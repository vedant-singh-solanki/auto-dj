import { PLAYABLE_EXTENSIONS, UNPLAYABLE_EXTENSIONS } from '../constants';

export interface ScannedFile {
  handle: FileSystemFileHandle;
  /** Path relative to the chosen folder, e.g. "House/Artist/track.mp3". */
  path: string;
  supported: boolean;
}

export interface ScanProgress {
  /** Audio files found so far. */
  found: number;
  /** Folder currently being read, for the progress line. */
  folder: string;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function isAudio(name: string): { audio: boolean; supported: boolean } {
  const ext = extensionOf(name);
  if (PLAYABLE_EXTENSIONS.includes(ext)) return { audio: true, supported: true };
  if (UNPLAYABLE_EXTENSIONS.includes(ext)) return { audio: true, supported: false };
  return { audio: false, supported: false };
}

/**
 * Walks the chosen folder and every folder inside it. Deliberately tolerant:
 * a folder the browser refuses to open is skipped, not fatal — one bad
 * subfolder should never cost the user their whole library.
 */
export async function scanFolder(
  root: FileSystemDirectoryHandle,
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<ScannedFile[]> {
  const found: ScannedFile[] = [];

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    if (signal?.aborted) return;
    onProgress({ found: found.length, folder: prefix || root.name });

    let entries: [string, FileSystemHandle][];
    try {
      entries = [];
      for await (const entry of dir.entries()) entries.push(entry);
    } catch {
      return; // Unreadable folder — skip it and keep going.
    }

    for (const [name, handle] of entries) {
      if (signal?.aborted) return;
      if (name.startsWith('.')) continue;

      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        await walk(handle as FileSystemDirectoryHandle, path);
      } else {
        const { audio, supported } = isAudio(name);
        if (audio) found.push({ handle: handle as FileSystemFileHandle, path, supported });
      }
    }
  }

  await walk(root, '');
  onProgress({ found: found.length, folder: '' });
  return found;
}

/** The drag-and-drop / file-input path for browsers without a folder picker. */
export function scannedFilesFromInput(files: FileList | File[]): { file: File; path: string; supported: boolean }[] {
  const out: { file: File; path: string; supported: boolean }[] = [];
  for (const file of Array.from(files)) {
    const { audio, supported } = isAudio(file.name);
    if (!audio) continue;
    out.push({ file, path: file.webkitRelativePath || file.name, supported });
  }
  return out;
}
