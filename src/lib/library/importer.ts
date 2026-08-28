import type { Track } from '../../types';
import { trackIdFor } from '../../types';
import { allTracks, pruneTracks, putTracks } from './db';
import { clearSources, registerSource } from './fileSource';
import { scanFolder, scannedFilesFromInput } from './scan';
import { readTags } from './tags';

export type ImportPhase = 'scanning' | 'reading' | 'done';

export interface ImportProgress {
  phase: ImportPhase;
  done: number;
  total: number;
  /** A short line for the UI: the folder being read, or the current file. */
  label: string;
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
  candidates: Candidate[],
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<Track[]> {
  // Tracks already imported keep their tags — a re-scan should be cheap.
  const known = new Map((await allTracks()).map((t) => [t.id, t]));

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
  await pruneTracks(new Set(results.map((t) => t.id)));
  onProgress({ phase: 'done', done: results.length, total: candidates.length, label: '' });
  return results;
}

/** Chrome/Edge path: walk a folder the user picked. */
export async function importFromFolder(
  root: FileSystemDirectoryHandle,
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<Track[]> {
  const files = await scanFolder(
    root,
    ({ found, folder }) => onProgress({ phase: 'scanning', done: found, total: 0, label: folder }),
    signal,
  );

  clearSources();
  return buildTracks(
    files.map((f) => ({
      path: f.path,
      supported: f.supported,
      getFile: () => f.handle.getFile(),
      register: (id) => registerSource(id, f.handle),
    })),
    onProgress,
    signal,
  );
}

/** Fallback path: files dropped on the page, or chosen with a file input. */
export async function importFromFiles(
  files: FileList | File[],
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<Track[]> {
  const picked = scannedFilesFromInput(files);
  clearSources();
  return buildTracks(
    picked.map((f) => ({
      path: f.path,
      supported: f.supported,
      getFile: async () => f.file,
      register: (id) => registerSource(id, f.file),
    })),
    onProgress,
    signal,
  );
}
