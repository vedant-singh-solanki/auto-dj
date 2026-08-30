import type { Crate, HotCues, TrackId } from '../../types';
import { allCrates, allCues, allHotCues, allRatings, putCrate, putCue, putHotCues, putRating } from './db';

/**
 * Backing up the work, and moving it between machines.
 *
 * This is the app's answer to cloud sync. Real sync would need a server and an
 * account, and would mean uploading the music itself — the opposite of what this
 * app promises. A file does the same job: put it in Dropbox, or email it to
 * yourself, and your cue points and playlists follow you.
 *
 * It works because a track's id is derived from the file itself — its name, size
 * and modification time — not from where it happens to sit. The same track on
 * two computers has the same id, so a cue point set on one lands on the right
 * track on the other. The audio is never in here; only what you decided about it.
 */

/** Bumped only if the shape changes in a way an old file cannot satisfy. */
const BACKUP_VERSION = 1;

export interface BackupFile {
  format: 'auto-dj-settings';
  version: number;
  exportedAt: string;
  cues: Record<TrackId, number>;
  hotCues: Record<TrackId, HotCues>;
  ratings: Record<TrackId, number>;
  crates: Crate[];
}

export async function buildBackup(): Promise<BackupFile> {
  const [cues, hotCues, ratings, crates] = await Promise.all([
    allCues(),
    allHotCues(),
    allRatings(),
    allCrates(),
  ]);

  return {
    format: 'auto-dj-settings',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    cues: Object.fromEntries(cues),
    hotCues: Object.fromEntries(hotCues),
    ratings: Object.fromEntries(ratings),
    crates,
  };
}

export interface RestoreSummary {
  cues: number;
  hotCues: number;
  ratings: number;
  crates: number;
}

export class BackupError extends Error {}

/**
 * Reads a backup file and merges it in.
 *
 * Merges rather than replaces: restoring on a machine that already has work of
 * its own should not throw that work away. Where both sides have something for
 * the same track, the file wins — you restored it on purpose.
 */
export async function restoreBackup(text: string): Promise<RestoreSummary> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not an Auto DJ backup — it is not readable as one.');
  }

  const backup = parsed as Partial<BackupFile>;
  if (backup?.format !== 'auto-dj-settings') {
    throw new BackupError('That file is not an Auto DJ backup. Look for one ending in .autodj.json.');
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of Auto DJ. Update the app and try again.');
  }

  const summary: RestoreSummary = { cues: 0, hotCues: 0, ratings: 0, crates: 0 };

  for (const [id, seconds] of Object.entries(backup.cues ?? {})) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) continue;
    await putCue(id, seconds);
    summary.cues += 1;
  }

  for (const [id, slots] of Object.entries(backup.hotCues ?? {})) {
    if (!Array.isArray(slots)) continue;
    await putHotCues(id, slots);
    summary.hotCues += 1;
  }

  for (const [id, stars] of Object.entries(backup.ratings ?? {})) {
    if (typeof stars !== 'number') continue;
    await putRating(id, stars);
    summary.ratings += 1;
  }

  // Existing playlists of the same name are replaced rather than duplicated;
  // restoring twice should not leave two of everything.
  const existing = await allCrates();
  for (const crate of backup.crates ?? []) {
    if (!crate?.id || typeof crate.name !== 'string') continue;
    const clash = existing.find((entry) => entry.name === crate.name && entry.id !== crate.id);
    await putCrate({ ...crate, id: clash?.id ?? crate.id, trackIds: crate.trackIds ?? [] });
    summary.crates += 1;
  }

  return summary;
}

/** Hands the file to the browser's downloads. */
export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = backup.exportedAt.slice(0, 10);

  link.href = url;
  link.download = `auto-dj-${stamp}.autodj.json`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
