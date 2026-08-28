import type { Track, TrackId } from '../../types';
import { ROTATION_WINDOW } from '../constants';
import { addHistory, recentHistory } from '../library/db';

/**
 * What has already been played, newest first. Kept in memory for the selector
 * (which runs on every track change) and mirrored to IndexedDB so a set picked
 * up tomorrow does not open with the same three songs as today.
 */

let recentIds: TrackId[] = [];
let recentArtists: string[] = [];

export async function loadHistory(): Promise<void> {
  const entries = await recentHistory(ROTATION_WINDOW * 2);
  recentIds = entries.map((entry) => entry.id);
  recentArtists = [];
}

export function recordPlayed(track: Track): void {
  recentIds = [track.id, ...recentIds.filter((id) => id !== track.id)].slice(0, ROTATION_WINDOW * 2);
  recentArtists = [track.artist, ...recentArtists].slice(0, ROTATION_WINDOW);
  void addHistory({ id: track.id, playedAt: Date.now() });
}

export function playedIds(): TrackId[] {
  return recentIds;
}

export function playedArtists(): string[] {
  return recentArtists;
}

/** How many tracks ago this one played; -1 if it has not played recently. */
export function playedAgo(id: TrackId): number {
  return recentIds.indexOf(id);
}

export function artistPlayedAgo(artist: string): number {
  return recentArtists.indexOf(artist);
}

/* -- The set clock --------------------------------------------------------- */

let setStartedAt = 0;

/** Called when a set begins, so the energy arc has something to measure from. */
export function startSet(): void {
  setStartedAt = Date.now();
}

/** Minutes since the set started. Zero before anything has played. */
export function setElapsedMin(): number {
  return setStartedAt === 0 ? 0 : (Date.now() - setStartedAt) / 60000;
}
