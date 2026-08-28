import { forgetFolderHandle, loadFolderHandle, saveFolderHandle } from './db';

/**
 * Firefox and Safari have no File System Access API. They fall back to a
 * drag-and-drop / file-input path that works for one session but cannot
 * remember the folder — see `FolderPicker.tsx`.
 */
export function supportsFolderPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** An error whose message is safe to show to the user as-is. */
export class FolderError extends Error {}

/**
 * Opens the system folder picker. Returns null if the user closed it — that is
 * a normal outcome, not an error.
 */
export async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFolderPicker()) {
    throw new FolderError(
      'This browser cannot open a music folder. Use Chrome or Edge, or drag your music files onto the page instead.',
    );
  }
  try {
    const handle = await window.showDirectoryPicker!({ id: 'auto-dj-music', mode: 'read', startIn: 'music' });
    await saveFolderHandle(handle);
    return handle;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new FolderError('Your browser blocked the folder picker. Click the "Choose music folder" button directly and try again.');
    }
    throw new FolderError('That folder could not be opened. Try choosing it again, or pick a different folder.');
  }
}

export type PermissionOutcome = 'granted' | 'needs-click' | 'denied';

/**
 * Chrome drops file permissions between visits, so a remembered folder is
 * re-granted with one click rather than a second trip through the picker.
 * `prompt: false` checks silently; `true` may show the browser's own dialog and
 * must therefore be called from a click handler.
 */
export async function checkFolderPermission(
  handle: FileSystemDirectoryHandle,
  prompt: boolean,
): Promise<PermissionOutcome> {
  const descriptor = { mode: 'read' } as const;
  const current = (await handle.queryPermission?.(descriptor)) ?? 'granted';
  if (current === 'granted') return 'granted';
  if (!prompt) return current === 'denied' ? 'denied' : 'needs-click';

  const asked = (await handle.requestPermission?.(descriptor)) ?? 'granted';
  return asked === 'granted' ? 'granted' : 'denied';
}

/**
 * The folder used last time, if the browser still has it. Never prompts —
 * the UI shows a "Reconnect" button when this returns `needs-click`.
 */
export async function restoreFolder(): Promise<
  { handle: FileSystemDirectoryHandle; permission: PermissionOutcome } | null
> {
  const handle = await loadFolderHandle();
  if (!handle) return null;
  try {
    return { handle, permission: await checkFolderPermission(handle, false) };
  } catch {
    // The folder was deleted, or lives on a drive that is no longer plugged in.
    await forgetFolderHandle();
    return null;
  }
}
