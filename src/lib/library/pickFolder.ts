import { forgetFolderHandles, loadFolderHandles, saveFolderHandles } from './db';

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

export interface RestoredFolder {
  handle: FileSystemDirectoryHandle;
  permission: PermissionOutcome;
}

/**
 * The folders used last time, if the browser still has them. Never prompts —
 * the UI shows a "Reconnect" button when any of them need a click.
 */
export async function restoreFolders(): Promise<RestoredFolder[]> {
  const handles = await loadFolderHandles();
  const restored: RestoredFolder[] = [];

  for (const handle of handles) {
    try {
      restored.push({ handle, permission: await checkFolderPermission(handle, false) });
    } catch {
      // Deleted, or on a drive that is no longer plugged in. Skip it; the other
      // folders should still come back.
    }
  }

  if (restored.length === 0 && handles.length > 0) await forgetFolderHandles();
  return restored;
}

/** Adds a folder to the remembered list, keeping the order stable. */
export async function rememberFolders(handles: FileSystemDirectoryHandle[]): Promise<void> {
  await saveFolderHandles(handles);
}
