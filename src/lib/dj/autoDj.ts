import type { Analysis, Track, TrackId } from '../../types';
import { analyzeTrack } from '../analysis/analyze';
import type { LoadedTrack } from '../audio/deck';
import { decodeFile } from '../audio/context';
import { DEFAULT_MIX_BEATS, tooLongToMix } from '../constants';
import { fileFor, hasSource } from '../library/fileSource';
import { pickNext, type ScoredTrack } from './selector';
import { playedArtists, playedIds } from './history';
import type { Mood } from '../../types';

/**
 * The two things the auto-DJ has to do between songs: decide what is next, and
 * have it decoded and analysed before it is needed.
 */

export class TrackTooLongError extends Error {}

function tooLongMessage(track: Track): string {
  return `"${track.title}" is longer than 20 minutes, so it is too big to mix — it looks like a DJ set or a podcast rather than a track.`;
}

/**
 * Decodes and analyses a track in one pass. Decoding is the expensive half, so
 * the buffer is handed straight to the analyser rather than read twice.
 *
 * The length check happens before decoding wherever the duration is already
 * known, because decoding is precisely the step that would run the tab out of
 * memory.
 */
export async function prepareTrack(track: Track): Promise<LoadedTrack> {
  if (tooLongToMix(track.durationSec)) throw new TrackTooLongError(tooLongMessage(track));

  const buffer = await decodeFile(await fileFor(track.id));
  if (tooLongToMix(buffer.duration)) throw new TrackTooLongError(tooLongMessage(track));

  const analysis = await analyzeTrack(track, buffer);
  return { track, analysis, buffer };
}

export interface ChooseInput {
  tracks: Track[];
  analyses: Map<TrackId, Analysis>;
  current: Analysis | null;
  mood: Mood;
}

export function chooseNext(input: ChooseInput): ScoredTrack | null {
  return pickNext({
    tracks: input.tracks,
    analyses: input.analyses,
    current: input.current,
    mood: input.mood,
    playedIds: playedIds(),
    playedArtists: playedArtists(),
    isAvailable: hasSource,
  });
}

/**
 * How far into the outgoing track, in its own seconds, the blend wants to
 * begin. The mixer re-derives this precisely when it schedules; this is only
 * the cue for the controller to stop waiting and call it.
 *
 * Measured in the track's own seconds, so the playback rate does not come into
 * it: 32 beats of a 124 BPM track is 15.5 seconds of that track however fast it
 * is being played.
 */
export function mixStartsAt(outgoing: Analysis): number {
  return Math.max(0, outgoing.mixOutSec - (DEFAULT_MIX_BEATS * 60) / outgoing.bpm);
}
