import { parseBlob, selectCover } from 'music-metadata';
import type { TrackId } from '../../types';
import { getArtwork, putArtwork } from './db';

export interface TagResult {
  title: string;
  artist: string;
  album: string;
  year?: number;
  durationSec?: number;
  tagBpm?: number;
}

/** "03 - Sunset Drive.mp3" -> "Sunset Drive". Used when a file has no tags. */
export function titleFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/^\s*\d{1,3}\s*[-._)]\s*/, '').trim() || withoutExt;
}

/**
 * Reads only the tag header, not the audio — this has to stay fast enough to
 * run across thousands of files. Anything unreadable degrades to the filename
 * rather than dropping the track.
 */
export async function readTags(file: File): Promise<TagResult> {
  try {
    const { common, format } = await parseBlob(file, {
      duration: false,
      skipCovers: true,
      skipPostHeaders: true,
    });

    const bpm = typeof common.bpm === 'number' ? common.bpm : Number(common.bpm);
    return {
      title: common.title?.trim() || titleFromFileName(file.name),
      artist: common.artist?.trim() || common.albumartist?.trim() || 'Unknown artist',
      album: common.album?.trim() || '',
      year: common.year,
      durationSec: format.duration,
      tagBpm: Number.isFinite(bpm) && bpm > 0 ? bpm : undefined,
    };
  } catch {
    return { title: titleFromFileName(file.name), artist: 'Unknown artist', album: '' };
  }
}

/**
 * Cover art is fetched only for tracks actually shown or played — pulling every
 * cover during a scan would put hundreds of megabytes into IndexedDB for
 * artwork the user never sees.
 */
export async function loadArtwork(id: TrackId, file: File): Promise<Blob | null> {
  const cached = await getArtwork(id);
  if (cached) return cached.size > 0 ? cached : null;

  let blob: Blob | null = null;
  try {
    const { common } = await parseBlob(file, { duration: false, skipPostHeaders: true });
    const cover = selectCover(common.picture);
    if (cover) blob = new Blob([cover.data as BlobPart], { type: cover.format });
  } catch {
    blob = null;
  }

  // A zero-byte blob is the "this track has no cover" marker, so we don't
  // re-parse the file every time it comes round again.
  await putArtwork(id, blob ?? new Blob([]));
  return blob;
}
