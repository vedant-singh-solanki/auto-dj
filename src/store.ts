import { create } from 'zustand';
import type { Analysis, Crate, HotCues, Mood, Track, TrackId } from './types';
import { emptyHotCues } from './types';
import { audioContext, resumeAudio } from './lib/audio/context';
import { type EngineTransition, mixEngine } from './lib/audio/engine';
import { handoverAt } from './lib/audio/transition';
import type { LoadedTrack } from './lib/audio/deck';
import { enqueueBackground, onAnalyzed } from './lib/analysis/queue';
import {
  allAnalysis,
  allCrates,
  allCues,
  allHotCues,
  allRatings,
  allTracks,
  pruneTracks,
  deleteCrate as deleteCrateRow,
  deleteCue,
  putCrate,
  putCue,
  putHotCues,
  putRating,
} from './lib/library/db';
import { addFiles, type ImportProgress, importFromFolders } from './lib/library/importer';
import {
  checkFolderPermission,
  chooseFolder as openFolderPicker,
  FolderError,
  rememberFolders,
  restoreFolders,
  supportsFolderPicker,
} from './lib/library/pickFolder';
import { chooseNext, planQueue, prepareTrack } from './lib/dj/autoDj';
import { loadHistory, recordPlayed, startSet } from './lib/dj/history';
import { MAX_LIBRARY_TRACKS, PREPARE_LEAD_SEC } from './lib/constants';

/**
 * All application state, and the auto-DJ control loop that drives it.
 *
 * Anything that changes 60 times a second — playhead position, meters — is
 * deliberately NOT in here; those components read the engine directly on an
 * animation frame. This store only holds what a re-render should react to.
 */

export type FolderStatus = 'none' | 'needs-click' | 'ready';
export type PlaybackStatus = 'idle' | 'starting' | 'playing' | 'paused';

export interface UpNext {
  track: Track;
  reason: string;
  ready: boolean;
}

export interface QueueEntry {
  track: Track;
  /** Why the DJ picked it, or that the user did. */
  reason: string;
  /** Put there by hand. Auto-planning tops up around these, never over them. */
  manual: boolean;
}

/** How many tracks to keep visible ahead of the one playing. */
const QUEUE_LENGTH = 5;

/** Decoded audio for the next track: too large to keep in render state. */
let preparedNext: LoadedTrack | null = null;
let preparing = false;
let folderHandles: FileSystemDirectoryHandle[] = [];
/** Where the live track came in, so its handover is measured from there. */
let liveEntrySec = 0;
/** Analyses that arrived since the last flush, batched to avoid render storms. */
let analysisInbox: Analysis[] = [];

/** Start scheduling the blend this many seconds before it is due. */
const SCHEDULE_AHEAD_SEC = 2.5;

/** How many candidates to try before reporting that a set could not start. */
const START_ATTEMPTS = 5;

interface AppState {
  supportsPicker: boolean;
  folderStatus: FolderStatus;
  folderName: string | null;
  importing: ImportProgress | null;

  tracks: Track[];
  analyses: Map<TrackId, Analysis>;
  /** Files that would not decode this session. Kept out of the rotation. */
  unplayable: Set<TrackId>;
  /** Manual entry points the user has set, in seconds. Persisted. */
  cues: Map<TrackId, number>;
  /** What is coming, in order. Index 0 is the next track. */
  queue: QueueEntry[];
  /** Manual shift of the current track's handover, in seconds. */
  handoverNudgeSec: number;
  /** Eight jump points per track. Persisted. */
  hotCues: Map<TrackId, HotCues>;
  /** Star ratings, 0-5. Persisted. */
  ratings: Map<TrackId, number>;
  /** Named groups of tracks. */
  crates: Crate[];
  /** Which crate the library and the DJ are limited to; null means everything. */
  activeCrateId: string | null;

  status: PlaybackStatus;
  nowPlaying: LoadedTrack | null;
  upNext: UpNext | null;
  transition: EngineTransition | null;
  mood: Mood;
  volume: number;
  error: string | null;

  init: () => Promise<void>;
  connectFolder: () => Promise<void>;
  addFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  addTrackFiles: (files: FileList | File[]) => Promise<void>;
  start: (trackId?: TrackId) => Promise<void>;
  togglePause: () => Promise<void>;
  skip: () => Promise<void>;
  queueNext: (trackId: TrackId) => void;
  enqueue: (trackId: TrackId) => void;
  removeFromQueue: (trackId: TrackId) => void;
  reshuffleQueue: () => void;
  setCue: (trackId: TrackId, seconds: number) => void;
  clearCue: (trackId: TrackId) => void;
  nudgeHandover: (deltaSec: number) => void;
  setHotCue: (trackId: TrackId, slot: number, seconds: number | null) => void;
  jumpToHotCue: (slot: number) => void;
  setRating: (trackId: TrackId, stars: number) => void;
  createCrate: (name: string) => void;
  deleteCrate: (id: string) => void;
  addToCrate: (crateId: string, trackId: TrackId) => void;
  removeFromCrate: (crateId: string, trackId: TrackId) => void;
  setActiveCrate: (id: string | null) => void;
  setMood: (mood: Mood) => void;
  setVolume: (volume: number) => void;
  dismissError: () => void;
  tick: () => void;
}

function messageFor(error: unknown): string {
  if (error instanceof FolderError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again, or reload the page.';
}

export const useApp = create<AppState>((set, get) => ({
  supportsPicker: supportsFolderPicker(),
  folderStatus: 'none',
  folderName: null,
  importing: null,

  tracks: [],
  analyses: new Map(),
  unplayable: new Set(),
  cues: new Map(),
  queue: [],
  handoverNudgeSec: 0,
  hotCues: new Map(),
  ratings: new Map(),
  crates: [],
  activeCrateId: null,

  status: 'idle',
  nowPlaying: null,
  upNext: null,
  transition: null,
  mood: 'hold',
  volume: 0.9,
  error: null,

  async init() {
    onAnalyzed((analysis) => analysisInbox.push(analysis));
    await loadHistory();

    const [tracks, analyses, cues, hotCues, ratings, crates] = await Promise.all([
      allTracks(),
      allAnalysis(),
      allCues(),
      allHotCues(),
      allRatings(),
      allCrates(),
    ]);
    set({ tracks, analyses: new Map(analyses.map((a) => [a.id, a])), cues, hotCues, ratings, crates });

    const restored = await restoreFolders();
    if (restored.length === 0) {
      // Nothing to reconnect to. Anything still on file came from individually
      // added tracks, which a browser cannot hand back after a reload — leaving
      // them listed would fill the collection with rows that can never play.
      // Their cues and ratings survive, keyed by the file itself, so re-adding
      // the same track brings its settings back with it.
      if (get().tracks.length > 0) {
        await pruneTracks(new Set());
        set({ tracks: [], queue: [] });
      }
      return;
    }

    folderHandles = restored.map((entry) => entry.handle);
    set({ folderName: describeFolders(folderHandles) });

    if (restored.every((entry) => entry.permission === 'granted')) await rescan(set);
    else set({ folderStatus: 'needs-click' });
  },

  /** Replaces the connected folders with one freshly picked. */
  async connectFolder() {
    try {
      const handle = await openFolderPicker();
      if (!handle) return;
      folderHandles = [handle];
      await rememberFolders(folderHandles);
      set({ folderName: describeFolders(folderHandles), error: null });
      await rescan(set);
    } catch (error) {
      set({ error: messageFor(error) });
    }
  },

  /** Adds another folder alongside the ones already connected. */
  async addFolder() {
    try {
      const handle = await openFolderPicker();
      if (!handle) return;
      // isSameEntry is the only reliable way to compare handles; names collide.
      for (const existing of folderHandles) {
        if (await existing.isSameEntry(handle)) return;
      }
      folderHandles = [...folderHandles, handle];
      await rememberFolders(folderHandles);
      set({ folderName: describeFolders(folderHandles), error: null });
      await rescan(set);
    } catch (error) {
      set({ error: messageFor(error) });
    }
  },

  /** Chrome forgets file permissions between visits; one click restores them. */
  async reconnectFolder() {
    if (folderHandles.length === 0) return get().connectFolder();
    try {
      for (const handle of folderHandles) {
        if ((await checkFolderPermission(handle, true)) !== 'granted') {
          set({ error: 'Access to that folder was not allowed. Choose the folder again to continue.' });
          return;
        }
      }
      await rescan(set);
    } catch (error) {
      set({ error: messageFor(error) });
    }
  },

  /**
   * Individual files, dropped or picked. Added alongside everything already in
   * the library rather than replacing it — the point of adding one track is not
   * to lose the rest.
   */
  async addTrackFiles(files) {
    try {
      set({ error: null, importing: { phase: 'scanning', done: 0, total: 0, label: '' } });
      let overflow: number | undefined;
      const tracks = await addFiles(files, (importing) => {
        if (importing.overflow) overflow = importing.overflow;
        set({ importing });
      });
      finishImport(set, tracks, overflow);
      set({
        folderStatus: 'ready',
        folderName: folderHandles.length > 0 ? describeFolders(folderHandles) : 'Added files',
      });
    } catch (error) {
      set({ importing: null, error: messageFor(error) });
    }
  },

  async start(trackId) {
    const state = get();
    if (state.status === 'starting') return;
    set({ status: 'starting', error: null });

    try {
      await resumeAudio();
      startSet();

      // A real library contains the odd broken or mislabelled file. Try a few
      // candidates before admitting defeat, rather than letting the first bad
      // one stop the set from starting at all.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
        // Asked for a specific track, then whatever the user queued, then the
        // DJ's own pick.
        const chosen =
          (attempt === 0 && trackId ? get().tracks.find((track) => track.id === trackId) : undefined) ??
          get().queue[0]?.track ??
          chooseNext({
            tracks: tracksInScope(get()),
            analyses: get().analyses,
            current: null,
            mood: get().mood,
            unplayable: get().unplayable,
          })?.track;

        if (!chosen) break;

        try {
          const loaded = await prepareTrack(chosen);
          mergeAnalysis(set, loaded.analysis);

          // The opening record plays from the top. Every later track enters at
          // its hook because it has to land over something already playing;
          // this one has nothing to mix against. A cue set by hand still wins.
          const opensAt = get().cues.get(chosen.id) ?? 0;
          await mixEngine().startFirst(loaded, opensAt);
          liveEntrySec = opensAt;

          recordPlayed(chosen);
          set({
            status: 'playing',
            nowPlaying: loaded,
            upNext: null,
            transition: null,
            handoverNudgeSec: 0,
            queue: get().queue.filter((entry) => entry.track.id !== chosen.id),
          });
          topUpQueue(set, get);
          return;
        } catch (error) {
          lastError = error;
          markUnplayable(set, get, chosen.id);
          set({ queue: get().queue.filter((entry) => entry.track.id !== chosen.id) });
        }
      }

      set({
        status: 'idle',
        error: lastError
          ? messageFor(lastError)
          : 'There are no playable tracks yet. Choose a music folder to get started.',
      });
    } catch (error) {
      set({ status: 'idle', error: messageFor(error) });
    }
  },

  async togglePause() {
    const ctx = audioContext();
    if (get().status === 'playing') {
      await ctx.suspend();
      set({ status: 'paused' });
    } else if (get().status === 'paused') {
      await ctx.resume();
      set({ status: 'playing' });
    }
  },

  /** Skip = bring the next track in right now instead of at the outro. */
  async skip() {
    const state = get();
    if (state.status !== 'playing' || mixEngine().activeTransition) return;

    try {
      if (!preparedNext) await prepareUpNext(set, get);
      if (preparedNext) beginMix(set, get, preparedNext, true);
    } catch (error) {
      set({ error: messageFor(error) });
    }
  },

  /** Jump a track to the front of the queue — it plays next. */
  queueNext(trackId) {
    const track = get().tracks.find((candidate) => candidate.id === trackId);
    if (!track || mixEngine().activeTransition) return;

    // Whatever was being prepared is no longer what plays next.
    preparedNext = null;
    const rest = get().queue.filter((entry) => entry.track.id !== trackId);
    set({
      queue: [{ track, reason: 'you asked for it', manual: true }, ...rest],
      upNext: null,
    });
    topUpQueue(set, get);
  },

  /** Add a track to the end of the queue. */
  enqueue(trackId) {
    const state = get();
    const track = state.tracks.find((candidate) => candidate.id === trackId);
    if (!track || state.queue.some((entry) => entry.track.id === trackId)) return;
    set({ queue: [...state.queue, { track, reason: 'you asked for it', manual: true }] });
  },

  removeFromQueue(trackId) {
    const state = get();
    // Removing the track already decoded and waiting means dropping that too.
    if (state.queue[0]?.track.id === trackId && !mixEngine().activeTransition) {
      preparedNext = null;
      set({ upNext: null });
    }
    set({ queue: state.queue.filter((entry) => entry.track.id !== trackId) });
    topUpQueue(set, get);
  },

  /** Throw away the DJ's suggestions and pick again. Manual entries survive. */
  reshuffleQueue() {
    if (!mixEngine().activeTransition) {
      preparedNext = null;
      set({ upNext: null });
    }
    set({ queue: get().queue.filter((entry) => entry.manual) });
    topUpQueue(set, get);
  },

  /**
   * Sets where a track comes in, overriding the hook the analyser found.
   * Re-prepares the next track if this changes where it would enter.
   */
  setCue(trackId, seconds) {
    const cues = new Map(get().cues).set(trackId, Math.max(0, seconds));
    set({ cues });
    void putCue(trackId, Math.max(0, seconds));

    if (get().queue[0]?.track.id === trackId && !mixEngine().activeTransition) {
      preparedNext = null;
      set({ upNext: null });
    }
  },

  clearCue(trackId) {
    const cues = new Map(get().cues);
    cues.delete(trackId);
    set({ cues });
    void deleteCue(trackId);
  },

  /**
   * Moves the current track's handover earlier or later. Clamped inside
   * `handoverAt`, so it can never be pushed past the end of the track or
   * dragged back before the blend has room to happen.
   */
  nudgeHandover(deltaSec) {
    if (get().status !== 'playing' || mixEngine().activeTransition) return;
    set({ handoverNudgeSec: get().handoverNudgeSec + deltaSec });
  },

  /** Saves or clears one of the eight jump points on a track. */
  setHotCue(trackId, slot, seconds) {
    const existing = get().hotCues.get(trackId) ?? emptyHotCues();
    const updated = existing.slice();
    updated[slot] = seconds === null ? null : Math.max(0, seconds);

    set({ hotCues: new Map(get().hotCues).set(trackId, updated) });
    void putHotCues(trackId, updated);
  },

  /**
   * Jumps the live deck to one of its hot cues. Ignored mid-blend: moving a
   * deck that is being crossfaded would wreck the mix in progress.
   */
  jumpToHotCue(slot) {
    const state = get();
    const engine = mixEngine();
    if (state.status !== 'playing' || !state.nowPlaying || engine.activeTransition) return;

    const target = state.hotCues.get(state.nowPlaying.track.id)?.[slot];
    if (target === null || target === undefined) return;

    engine.liveDeck.seek(target);
    // The segment is measured from where the track came in, so a jump resets it.
    liveEntrySec = target;
    set({ handoverNudgeSec: 0 });
  },

  setRating(trackId, stars) {
    const clamped = Math.max(0, Math.min(5, Math.round(stars)));
    set({ ratings: new Map(get().ratings).set(trackId, clamped) });
    void putRating(trackId, clamped);
  },

  createCrate(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const crate: Crate = { id: `crate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: trimmed, trackIds: [] };
    set({ crates: [...get().crates, crate] });
    void putCrate(crate);
  },

  deleteCrate(id) {
    set({
      crates: get().crates.filter((crate) => crate.id !== id),
      activeCrateId: get().activeCrateId === id ? null : get().activeCrateId,
    });
    void deleteCrateRow(id);
  },

  addToCrate(crateId, trackId) {
    const crates = get().crates.map((crate) =>
      crate.id === crateId && !crate.trackIds.includes(trackId)
        ? { ...crate, trackIds: [...crate.trackIds, trackId] }
        : crate,
    );
    set({ crates });
    const updated = crates.find((crate) => crate.id === crateId);
    if (updated) void putCrate(updated);
  },

  removeFromCrate(crateId, trackId) {
    const crates = get().crates.map((crate) =>
      crate.id === crateId ? { ...crate, trackIds: crate.trackIds.filter((id) => id !== trackId) } : crate,
    );
    set({ crates });
    const updated = crates.find((crate) => crate.id === crateId);
    if (updated) void putCrate(updated);
  },

  /**
   * Limits both the library view and the DJ's choices to one crate. Re-picks
   * the queue, since what belongs in it has just changed.
   */
  setActiveCrate(id) {
    set({ activeCrateId: id });
    get().reshuffleQueue();
  },

  setMood(mood) {
    set({ mood });
    // The queue was planned under the old mood, so re-plan the part of it the
    // DJ chose. Anything the user queued by hand stays where it is.
    get().reshuffleQueue();
  },

  setVolume(volume) {
    mixEngine().setVolume(volume);
    set({ volume });
  },

  dismissError() {
    set({ error: null });
  },

  /**
   * The control loop, called a few times a second from the app shell. Audio
   * timing does not depend on it — every blend is handed to the audio clock in
   * advance — this only decides when to plan the next one.
   */
  tick() {
    flushAnalyses(set, get);

    const engine = mixEngine();
    const settled = engine.settle();
    if (settled) {
      const live = engine.liveDeck.loaded;
      preparedNext = null;
      // The new track came in at the plan's offset, and its own handover is
      // measured from there. Manual nudges belong to the track that has gone.
      liveEntrySec = settled.plan.offsetSec;
      set({ nowPlaying: live, upNext: null, transition: null, handoverNudgeSec: 0 });
      topUpQueue(set, get);
    }

    const state = get();
    if (state.status !== 'playing' || !state.nowPlaying) return;

    if (engine.activeTransition) return;

    // Nothing playing and nothing scheduled: the last track ran out.
    if (!engine.liveDeck.isPlaying) {
      set({ status: 'idle' });
      return;
    }

    const deck = engine.liveDeck;
    const position = deck.positionAt(engine.now);

    // Both decisions hang off the same handover point. Timing them off the end
    // of the track instead would never fire: a set plays a track's hook and
    // moves on with minutes of it still unplayed.
    const secondsToHandover = (liveHandoverAt(state) - position) / Math.max(0.01, deck.playbackRate);

    if (!preparedNext && !preparing && secondsToHandover < PREPARE_LEAD_SEC) {
      void prepareUpNext(set, get);
      return;
    }

    if (preparedNext && secondsToHandover <= SCHEDULE_AHEAD_SEC) {
      beginMix(set, get, preparedNext, false);
    }
  },
}));

/* -- Helpers --------------------------------------------------------------- */

type Setter = (partial: Partial<AppState>) => void;
type Getter = () => AppState;

/** Names the connected folders for the header. */
function describeFolders(handles: FileSystemDirectoryHandle[]): string | null {
  if (handles.length === 0) return null;
  if (handles.length === 1) return handles[0].name;
  return `${handles[0].name} +${handles.length - 1} more`;
}

/**
 * Rebuilds the library from every connected folder. This is the authoritative
 * pass: tracks whose files have gone are dropped. Individually added files are
 * session-only, so they do not survive it — there is no handle to find them by.
 */
async function rescan(set: Setter): Promise<void> {
  set({ importing: { phase: 'scanning', done: 0, total: 0, label: '' } });
  let overflow: number | undefined;
  const tracks = await importFromFolders(folderHandles, (importing) => {
    if (importing.overflow) overflow = importing.overflow;
    set({ importing });
  });
  finishImport(set, tracks, overflow);
  set({ folderStatus: 'ready' });
}

function finishImport(set: Setter, tracks: Track[], overflow?: number): void {
  if (overflow) {
    set({
      error: `This holds ${MAX_LIBRARY_TRACKS} tracks, so ${overflow} were left out. Point it at a smaller folder, or split your music across playlists.`,
    });
  }
  set({ tracks, importing: null });
  // Everything gets analysed eventually; the player just does not wait for it.
  enqueueBackground(tracks);
  // Show what is coming before anyone presses start.
  topUpQueue(set, useApp.getState);
}

function mergeAnalysis(set: Setter, analysis: Analysis): void {
  set({ analyses: new Map(useApp.getState().analyses).set(analysis.id, analysis) });
}

function flushAnalyses(set: Setter, get: Getter): void {
  if (analysisInbox.length === 0) return;
  const merged = new Map(get().analyses);
  for (const analysis of analysisInbox) merged.set(analysis.id, analysis);
  analysisInbox = [];
  set({ analyses: merged });
}

/**
 * Where the track currently playing hands over, in its own seconds.
 *
 * Folds together the three things that can move it: where the track actually
 * came in, a cue point the user set, and the manual earlier/later nudge.
 */
export function liveHandoverAt(state: AppState): number {
  const live = state.nowPlaying;
  if (!live) return 0;
  return handoverAt(live.analysis, {
    cue: state.cues.get(live.track.id),
    nudgeSec: state.handoverNudgeSec,
    startedAtSec: liveEntrySec,
  });
}

/**
 * Keeps the visible queue topped up with the DJ's own picks.
 *
 * Only ever appends: anything the user put in the queue by hand stays exactly
 * where they put it. Called on the events that change what a good pick would
 * be, rather than every tick, because planning scores the whole library.
 */
function topUpQueue(set: Setter, get: Getter): void {
  const state = get();
  if (state.queue.length >= QUEUE_LENGTH) return;

  const queued = new Set(state.queue.map((entry) => entry.track.id));
  // Never line a track up behind itself. The rotation window normally prevents
  // this, but a small library falls through to "least recently played", and
  // without this the playing track is the first thing that comes back.
  if (state.nowPlaying) queued.add(state.nowPlaying.track.id);
  if (state.upNext) queued.add(state.upNext.track.id);
  // Chain from the last thing in the queue, or from what is playing.
  const tail = state.queue.at(-1);
  const current = (tail ? state.analyses.get(tail.track.id) : state.nowPlaying?.analysis) ?? null;

  const picks = planQueue(
    {
      tracks: tracksInScope(state),
      analyses: state.analyses,
      current,
      mood: state.mood,
      unplayable: state.unplayable,
      exclude: queued,
    },
    QUEUE_LENGTH - state.queue.length,
  );
  if (picks.length === 0) return;

  set({
    queue: [...state.queue, ...picks.map((pick) => ({ track: pick.track, reason: pick.reason, manual: false }))],
  });
}

async function prepareUpNext(set: Setter, get: Getter): Promise<void> {
  const state = get();
  const next = state.queue[0];
  if (!next) {
    topUpQueue(set, get);
    return;
  }

  preparing = true;
  set({ upNext: { track: next.track, reason: next.reason, ready: false } });
  try {
    preparedNext = await prepareTrack(next.track);
    mergeAnalysis(set, preparedNext.analysis);
    set({ upNext: { track: next.track, reason: next.reason, ready: true } });
  } catch {
    // A file that will not decode is dropped from the queue and the next tick
    // takes whatever moved up behind it. No banner: the set carries on, and the
    // library row says why that track is greyed out.
    preparedNext = null;
    markUnplayable(set, get, next.track.id);
    set({ upNext: null, queue: get().queue.filter((entry) => entry.track.id !== next.track.id) });
    topUpQueue(set, get);
  } finally {
    preparing = false;
  }
}

function beginMix(set: Setter, get: Getter, loaded: LoadedTrack, immediate: boolean): void {
  const state = get();
  const transition = mixEngine().mixInto(loaded, {
    immediate,
    handoverAtSec: liveHandoverAt(state),
    incomingCue: state.cues.get(loaded.track.id),
  });
  if (!transition) return;

  recordPlayed(loaded.track);
  // It is committed now, so it leaves the queue and the DJ looks further ahead.
  set({ transition, queue: state.queue.filter((entry) => entry.track.id !== loaded.track.id) });
  topUpQueue(set, get);
}


/**
 * Records that a file would not decode, so nothing picks it again this session.
 * Not persisted — a file that gets repaired or replaced deserves another go
 * next time the app opens.
 */
function markUnplayable(set: Setter, get: Getter, id: TrackId): void {
  const next = new Set(get().unplayable);
  next.add(id);
  set({ unplayable: next });
}

/**
 * The tracks currently in scope.
 *
 * A crate is not just a view: selecting one narrows what the DJ is allowed to
 * play, which is the point of making one. "All music" is the whole library.
 */
export function tracksInScope(state: AppState): Track[] {
  if (!state.activeCrateId) return state.tracks;
  const crate = state.crates.find((entry) => entry.id === state.activeCrateId);
  if (!crate) return state.tracks;

  const wanted = new Set(crate.trackIds);
  return state.tracks.filter((track) => wanted.has(track.id));
}
