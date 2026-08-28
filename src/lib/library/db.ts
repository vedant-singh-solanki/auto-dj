import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Analysis, HistoryEntry, Track, TrackId } from '../../types';

/**
 * Everything the app remembers lives here: the folder handle, one row per
 * track, one analysis row per track, cover art blobs, and the play history.
 *
 * Nothing leaves the browser. Clearing site data is the "start over" button.
 */
interface AutoDjDb extends DBSchema {
  meta: { key: string; value: unknown };
  tracks: { key: TrackId; value: Track };
  analysis: { key: TrackId; value: Analysis };
  artwork: { key: TrackId; value: Blob };
  history: { key: number; value: HistoryEntry; indexes: { byPlayedAt: number } };
}

const DB_NAME = 'auto-dj';
const DB_VERSION = 1;
const FOLDER_KEY = 'musicFolder';

let dbPromise: Promise<IDBPDatabase<AutoDjDb>> | null = null;

export function db(): Promise<IDBPDatabase<AutoDjDb>> {
  dbPromise ??= openDB<AutoDjDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore('meta');
      database.createObjectStore('tracks', { keyPath: 'id' });
      database.createObjectStore('analysis', { keyPath: 'id' });
      database.createObjectStore('artwork');
      const history = database.createObjectStore('history', { autoIncrement: true });
      history.createIndex('byPlayedAt', 'playedAt');
    },
  });
  return dbPromise;
}

/* -- The chosen folder ----------------------------------------------------- */

export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  // Directory handles are structured-cloneable, so IndexedDB can store them
  // directly — this is what lets the app reconnect without a second picker.
  (await db()).put('meta', handle, FOLDER_KEY);
}

export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const stored = await (await db()).get('meta', FOLDER_KEY);
  return (stored as FileSystemDirectoryHandle | undefined) ?? null;
}

export async function forgetFolderHandle(): Promise<void> {
  (await db()).delete('meta', FOLDER_KEY);
}

/* -- Tracks ---------------------------------------------------------------- */

export async function allTracks(): Promise<Track[]> {
  return (await db()).getAll('tracks');
}

export async function putTracks(tracks: Track[]): Promise<void> {
  const tx = (await db()).transaction('tracks', 'readwrite');
  await Promise.all([...tracks.map((t) => tx.store.put(t)), tx.done]);
}

/** Drops tracks whose files are gone, so a re-scan doesn't leave ghosts. */
export async function pruneTracks(keep: Set<TrackId>): Promise<number> {
  const tx = (await db()).transaction('tracks', 'readwrite');
  let removed = 0;
  for (const id of await tx.store.getAllKeys()) {
    if (!keep.has(id)) {
      tx.store.delete(id);
      removed += 1;
    }
  }
  await tx.done;
  return removed;
}

/* -- Analysis -------------------------------------------------------------- */

export async function getAnalysis(id: TrackId): Promise<Analysis | undefined> {
  return (await db()).get('analysis', id);
}

export async function allAnalysis(): Promise<Analysis[]> {
  return (await db()).getAll('analysis');
}

export async function putAnalysis(analysis: Analysis): Promise<void> {
  await (await db()).put('analysis', analysis);
}

/* -- Artwork --------------------------------------------------------------- */

export async function getArtwork(id: TrackId): Promise<Blob | undefined> {
  return (await db()).get('artwork', id);
}

export async function putArtwork(id: TrackId, blob: Blob): Promise<void> {
  await (await db()).put('artwork', blob, id);
}

/* -- History --------------------------------------------------------------- */

export async function addHistory(entry: HistoryEntry): Promise<void> {
  await (await db()).add('history', entry);
}

/** Most recent first. The selector uses this to avoid repeats. */
export async function recentHistory(limit: number): Promise<HistoryEntry[]> {
  const tx = (await db()).transaction('history');
  const out: HistoryEntry[] = [];
  let cursor = await tx.store.index('byPlayedAt').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}
