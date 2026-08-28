import { create } from 'zustand';
import type { Analysis, Mood, Track, TrackId } from './types';
import { audioContext, resumeAudio } from './lib/audio/context';
import { type EngineTransition, mixEngine } from './lib/audio/engine';
import { handoverAt } from './lib/audio/transition';
import type { LoadedTrack } from './lib/audio/deck';
import { enqueueBackground, onAnalyzed } from './lib/analysis/queue';
import { allAnalysis, allTracks } from './lib/library/db';
import { type ImportProgress, importFromFiles, importFromFolder } from './lib/library/importer';
import {
  checkFolderPermission,
  chooseFolder as openFolderPicker,
  FolderError,
  restoreFolder,
  supportsFolderPicker,
} from './lib/library/pickFolder';
import { chooseNext, prepareTrack } from './lib/dj/autoDj';
import { loadHistory, recordPlayed, startSet } from './lib/dj/history';
import { PREPARE_LEAD_SEC } from './lib/constants';

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

/** Decoded audio for the next track: too large to keep in render state. */
let preparedNext: LoadedTrack | null = null;
let preparing = false;
let folderHandle: FileSystemDirectoryHandle | null = null;
/** Set when the user picks the next track by hand; consumed once. */
let forcedNextId: TrackId | null = null;
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

  status: PlaybackStatus;
  nowPlaying: LoadedTrack | null;
  upNext: UpNext | null;
  transition: EngineTransition | null;
  mood: Mood;
  volume: number;
  error: string | null;

  init: () => Promise<void>;
  connectFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  importDroppedFiles: (files: FileList | File[]) => Promise<void>;
  start: (trackId?: TrackId) => Promise<void>;
  togglePause: () => Promise<void>;
  skip: () => Promise<void>;
  queueNext: (trackId: TrackId) => void;
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

    const [tracks, analyses] = await Promise.all([allTracks(), allAnalysis()]);
    set({ tracks, analyses: new Map(analyses.map((a) => [a.id, a])) });

    const restored = await restoreFolder();
    if (!restored) return;

    folderHandle = restored.handle;
    set({ folderName: restored.handle.name });

    if (restored.permission === 'granted') await scanInto(set, get, restored.handle);
    else set({ folderStatus: 'needs-click' });
  },

  async connectFolder() {
    try {
      const handle = await openFolderPicker();
      if (!handle) return;
      folderHandle = handle;
      set({ folderName: handle.name, error: null });
      await scanInto(set, get, handle);
    } catch (error) {
      set({ error: messageFor(error) });
    }
  },

  /** Chrome forgets file permissions between visits; one click restores them. */
  async reconnectFolder() {
    if (!folderHandle) return get().connectFolder();
    try {
      const permission = await checkFolderPermission(folderHandle, true);
      if (permission !== 'granted') {
        set({ error: 'Access to that folder was not allowed. Choose the folder again to continue.' });
        return;
      }
      await scanInto(set, get, folderHandle);
    } catch (error) {
      set({ error: messageFor(error) });
    }
  },

  async importDroppedFiles(files) {
    try {
      set({ error: null, importing: { phase: 'scanning', done: 0, total: 0, label: '' } });
      const tracks = await importFromFiles(files, (importing) => set({ importing }));
      finishImport(set, tracks);
      set({ folderStatus: 'ready', folderName: 'Dropped files' });
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
        const requested = attempt === 0 && trackId;
        const chosen = requested
          ? get().tracks.find((track) => track.id === trackId)
          : chooseNext({
              tracks: get().tracks,
              analyses: get().analyses,
              current: null,
              mood: get().mood,
              unplayable: get().unplayable,
            })?.track;

        if (!chosen) break;

        try {
          const loaded = await prepareTrack(chosen);
          mergeAnalysis(set, loaded.analysis);
          await mixEngine().startFirst(loaded);
          recordPlayed(chosen);
          set({ status: 'playing', nowPlaying: loaded, upNext: null, transition: null });
          return;
        } catch (error) {
          lastError = error;
          markUnplayable(set, get, chosen.id);
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
      if (preparedNext) beginMix(set, preparedNext, true);
    } catch (error) {
      set({ error: messageFor(error) });
    }
  },

  /** Override the DJ's choice for the next track, from the library list. */
  queueNext(trackId) {
    if (mixEngine().activeTransition) return;
    forcedNextId = trackId;
    preparedNext = null;
    const track = get().tracks.find((candidate) => candidate.id === trackId);
    set({ upNext: track ? { track, reason: 'you asked for it', ready: false } : null });
  },

  setMood(mood) {
    // The queued track was chosen under the old mood, so let it be re-picked.
    if (!mixEngine().activeTransition) {
      preparedNext = null;
      set({ upNext: null });
    }
    set({ mood });
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
    if (engine.settle()) {
      const live = engine.liveDeck.loaded;
      preparedNext = null;
      set({ nowPlaying: live, upNext: null, transition: null });
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
    const secondsToHandover =
      (handoverAt(state.nowPlaying.analysis) - position) / Math.max(0.01, deck.playbackRate);

    if (!preparedNext && !preparing && secondsToHandover < PREPARE_LEAD_SEC) {
      void prepareUpNext(set, get);
      return;
    }

    if (preparedNext && secondsToHandover <= SCHEDULE_AHEAD_SEC) {
      beginMix(set, preparedNext, false);
    }
  },
}));

/* -- Helpers --------------------------------------------------------------- */

type Setter = (partial: Partial<AppState>) => void;
type Getter = () => AppState;

async function scanInto(set: Setter, _get: Getter, handle: FileSystemDirectoryHandle): Promise<void> {
  set({ importing: { phase: 'scanning', done: 0, total: 0, label: handle.name } });
  const tracks = await importFromFolder(handle, (importing) => set({ importing }));
  finishImport(set, tracks);
  set({ folderStatus: 'ready' });
}

function finishImport(set: Setter, tracks: Track[]): void {
  set({ tracks, importing: null });
  // Everything gets analysed eventually; the player just does not wait for it.
  enqueueBackground(tracks);
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

async function prepareUpNext(set: Setter, get: Getter): Promise<void> {
  const state = get();

  const forced = forcedNextId ? state.tracks.find((track) => track.id === forcedNextId) : undefined;
  forcedNextId = null;

  const choice = forced
    ? { track: forced, score: 1, reason: 'you asked for it' }
    : chooseNext({
        tracks: state.tracks,
        analyses: state.analyses,
        current: state.nowPlaying?.analysis ?? null,
        mood: state.mood,
        unplayable: state.unplayable,
      });
  if (!choice) return;

  preparing = true;
  set({ upNext: { track: choice.track, reason: choice.reason, ready: false } });
  try {
    preparedNext = await prepareTrack(choice.track);
    mergeAnalysis(set, preparedNext.analysis);
    set({ upNext: { track: choice.track, reason: choice.reason, ready: true } });
  } catch {
    // A file that will not decode is dropped from the rotation and the next
    // tick picks something else. No banner: the set carries on, and the library
    // row says why that track is greyed out.
    preparedNext = null;
    markUnplayable(set, get, choice.track.id);
    set({ upNext: null });
  } finally {
    preparing = false;
  }
}

function beginMix(set: Setter, loaded: LoadedTrack, immediate: boolean): void {
  const transition = mixEngine().mixInto(loaded, { immediate });
  if (!transition) return;
  recordPlayed(loaded.track);
  set({ transition });
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
