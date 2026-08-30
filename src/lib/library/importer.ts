import type { Track } from '../../types';
import { trackIdFor } from '../../types';
import { allTracks, pruneTracks, putTracks } from './db';
import { clearSources, registerSource } from './fileSource';
import { MAX_LIBRARY_TRACKS } from '../constants';
import { scanFolder, scannedFilesFromInput } from './scan';
import { readTags } from './tags';

export type ImportPhase = 'scanning' | 'reading' | 'done';

export interface ImportProgress {
  phase: ImportPhase;
  done: number;
  total: number;
  /** A short line for the UI: the folder being read, or the current file. */
  label: string;
  /** How many files the library ceiling turned away, if any. */
  overflow?: number;
}

/** Tag reads are I/O bound; a handful at a time keeps the disk busy without
 *  flooding the browser with open file handles. */
const TAG_CONCURRENCY = 8;

interface Candidate {
  path: string;
  supported: boolean;
  getFile(): Promise<File>;
  register(id: string): void;
}

async function buildTracks(
  candidatesIn: Candidate[],
  onProgress: (p: ImportProgress) => void,
  signal: AbortSignal | undefined,
  options: { prune: boolean },
): Promise<Track[]> {
  // Tracks already imported keep their tags — a re-scan should be cheap.
  const known = new Map((await allTracks()).map((t) => [t.id, t]));
  let candidates = candidatesIn;

  // The ceiling counts the whole library, so adding files has to allow for what
  // is already there; a full rescan is starting from nothing.
  const alreadyHeld = options.prune ? 0 : known.size;
  const room = Math.max(0, MAX_LIBRARY_TRACKS - alreadyHeld);
  const overflow = Math.max(0, candidates.length - room);
  if (overflow > 0) candidates = candidates.slice(0, room);

  const results: Track[] = [];
  let done = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < candidates.length && !signal?.aborted) {
      const candidate = candidates[cursor++];
      try {
        const file = await candidate.getFile();
        const id = trackIdFor(file);
        candidate.register(id);

        const existing = known.get(id);
        const tags = existing ?? (await readTags(file));

        results.push({
          id,
          path: candidate.path,
          fileName: file.name,
          size: file.size,
          lastModified: file.lastModified,
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          year: tags.year,
          durationSec: tags.durationSec,
          tagBpm: tags.tagBpm,
          genre: tags.genre,
          supported: candidate.supported,
          addedAt: existing?.addedAt ?? Date.now(),
        });
      } catch {
        // A file that vanished mid-scan is simply not in the library.
      }
      done += 1;
      onProgress({ phase: 'reading', done, total: candidates.length, label: candidate.path });
    }
  }

  await Promise.all(Array.from({ length: Math.min(TAG_CONCURRENCY, candidates.length) }, worker));

  await putTracks(results);
  // Only a full folder rescan is allowed to decide a track no longer exists.
  // Adding one file must not wipe everything it did not mention.
  if (options.prune) await pruneTracks(new Set(results.map((t) => t.id)));

  const library = options.prune ? results : await allTracks();
  onProgress({
    phase: 'done',
    done: results.length,
    total: candidates.length,
    label: '',
    overflow: overflow > 0 ? overflow : undefined,
  });
  return library;
}

/**
 * Scans every folder the user has connected.
 *
 * This is the authoritative rebuild of the library: sources are cleared first
 * and anything no longer found is pruned, so deleting a file on disk removes it
 * here too. Individually added files are session-only and are re-added by the
 * caller afterwards — there is no handle to find them by after a reload.
 */
export async function importFromFolders(
  roots: FileSystemDirectoryHandle[],
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<Track[]> {
  const candidates: Candidate[] = [];

  for (const root of roots) {
    const files = await scanFolder(
      root,
      ({ found, folder }) =>
        onProgress({ phase: 'scanning', done: candidates.length + found, total: 0, label: folder }),
      signal,
    );
    for (const file of files) {
      candidates.push({
        // Folders are prefixed so two folders with a "House" subfolder stay apart.
        path: `${root.name}/${file.path}`,
        supported: file.supported,
        getFile: () => file.handle.getFile(),
        register: (id) => registerSource(id, file.handle),
      });
    }
  }

  clearSources();
  return buildTracks(candidates, onProgress, signal, { prune: true });
}

/**
 * Adds individual files — dropped on the page, or picked one at a time.
 *
 * Additive by design: these sit alongside whatever folders are connected rather
 * than replacing them, which is the whole point of being able to add a single
 * track without rebuilding the library.
 */
export async function addFiles(
  files: FileList | File[],
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<Track[]> {
  const picked = scannedFilesFromInput(files);
  return buildTracks(
    picked.map((f) => ({
      path: f.path,
      supported: f.supported,
      getFile: async () => f.file,
      register: (id) => registerSource(id, f.file),
    })),
    onProgress,
    signal,
    { prune: false },
  );
}
