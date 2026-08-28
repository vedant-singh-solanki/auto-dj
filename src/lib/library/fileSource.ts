import type { TrackId } from '../../types';

/**
 * The bridge between a track row and the bytes on disk.
 *
 * Two shapes go in — a `FileSystemFileHandle` from the folder picker, or a
 * plain `File` from drag-and-drop — and one shape comes out. Held in memory
 * only: handles are re-registered on every scan or reconnect, which is why a
 * page reload always goes through the folder step before playback.
 */
const sources = new Map<TrackId, FileSystemFileHandle | File>();

export function registerSource(id: TrackId, source: FileSystemFileHandle | File): void {
  sources.set(id, source);
}

export function clearSources(): void {
  sources.clear();
}

export function hasSource(id: TrackId): boolean {
  return sources.has(id);
}

export function readyTrackIds(): Set<TrackId> {
  return new Set(sources.keys());
}

export class MissingFileError extends Error {}

/** Reads the file behind a track. Throws a message fit to show the user. */
export async function fileFor(id: TrackId): Promise<File> {
  const source = sources.get(id);
  if (!source) {
    throw new MissingFileError('That track is not available right now. Reconnect your music folder and try again.');
  }
  if (source instanceof File) return source;

  try {
    return await source.getFile();
  } catch {
    throw new MissingFileError('That file could not be read — it may have been moved, renamed or deleted.');
  }
}
