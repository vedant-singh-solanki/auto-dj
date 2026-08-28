import type { Analysis, Track, TrackId } from '../../types';
import { analyzeTrack } from '../analysis/analyze';
import type { LoadedTrack } from '../audio/deck';
import { decodeFile } from '../audio/context';
import { tooLongToMix } from '../constants';
import { fileFor, hasSource } from '../library/fileSource';
import { pickNext, type ScoredTrack } from './selector';
import { playedArtists, playedIds, setElapsedMin } from './history';
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
  /**
   * Tracks that failed to decode this session. A real library has the odd
   * broken or mislabelled file in it, and the set has to route around them
   * rather than stopping.
   */
  unplayable: Set<TrackId>;
}

export function chooseNext(input: ChooseInput): ScoredTrack | null {
  return pickNext({
    tracks: input.tracks,
    analyses: input.analyses,
    current: input.current,
    mood: input.mood,
    playedIds: playedIds(),
    playedArtists: playedArtists(),
    setElapsedMin: setElapsedMin(),
    isAvailable: (id) => hasSource(id) && !input.unplayable.has(id),
  });
}

