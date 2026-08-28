import type { Analysis, Track, TrackId } from '../../types';
import { hasSource } from '../library/fileSource';
import { analyzeTrack, cachedAnalysis } from './analyze';

/**
 * Analysis is lazy on purpose. Reading tags for a whole library is quick;
 * decoding every file is not. So the track that is playing and the handful of
 * candidates for next jump the queue, and everything else is filled in during
 * idle time and cached for good.
 *
 * The user should never be made to wait for this.
 */

/** Deduplicates concurrent requests for the same track. */
const inFlight = new Map<TrackId, Promise<Analysis>>();
const backlog: Track[] = [];
const queued = new Set<TrackId>();
const listeners = new Set<(analysis: Analysis) => void>();

let draining = false;

export function onAnalyzed(listener: (analysis: Analysis) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(analysis: Analysis): void {
  for (const listener of listeners) listener(analysis);
}

/** Analyse now, ahead of the backlog. Use for the playing and next-up tracks. */
export function analysisFor(track: Track): Promise<Analysis> {
  const existing = inFlight.get(track.id);
  if (existing) return existing;

  const run = analyzeTrack(track)
    .then((analysis) => {
      announce(analysis);
      return analysis;
    })
    .finally(() => {
      inFlight.delete(track.id);
    });

  inFlight.set(track.id, run);
  return run;
}

/** Adds tracks to the idle-time backlog. Already-analysed tracks are skipped. */
export function enqueueBackground(tracks: Track[]): void {
  for (const track of tracks) {
    if (!track.supported || queued.has(track.id) || inFlight.has(track.id)) continue;
    queued.add(track.id);
    backlog.push(track);
  }
  startDraining();
}

export function backlogSize(): number {
  return backlog.length;
}

function whenIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 2000 });
  else setTimeout(run, 250);
}

function startDraining(): void {
  if (draining) return;
  draining = true;
  whenIdle(drainOne);
}

async function drainOne(): Promise<void> {
  const track = backlog.shift();
  if (!track) {
    draining = false;
    return;
  }
  queued.delete(track.id);

  try {
    // A track whose file is not registered (folder disconnected) waits for the
    // next scan rather than erroring.
    if (hasSource(track.id) && !(await cachedAnalysis(track))) {
      await analysisFor(track);
    }
  } catch {
    // One unreadable file must not stop the backlog.
  }

  // Yield between tracks so a decode never lands in the middle of a transition.
  whenIdle(drainOne);
}
