import type { Analysis, Mood, Track, TrackId } from '../../types';
import {
  ARTIST_WINDOW,
  MAX_TEMPO_STRETCH,
  KEY_CONFIDENCE_FLOOR,
  ROTATION_WINDOW,
  SET_CLIMB_MIN,
  SET_OPENING_ENERGY,
  SET_PEAK_ENERGY,
  tooLongToMix,
} from '../constants';
import { matchRate } from '../audio/transition';
import { keysAreCompatible } from '../analysis/key';
import type { SetStyle } from './styles';

/**
 * Choosing what plays next.
 *
 * Deliberately local arithmetic rather than a call to a model: it has to answer
 * instantly, work with no network, and cost nothing to run. The scores below
 * are the DJ's taste, and they are meant to be tuned by ear.
 */

/** How far the mood buttons push the target energy. */
const MOOD_SHIFT: Record<Mood, number> = { hold: 0, lift: 0.18, cool: -0.18 };

/** Tracks not analysed yet can still be played, they just wait their turn. */
const UNANALYSED_PENALTY = 0.45;
/** Same artist too recently: allowed, but pushed down the list. */
const ARTIST_PENALTY = 0.4;
/** Candidates considered for the weighted draw. */
const SHORTLIST = 8;

export interface SelectionInput {
  tracks: Track[];
  analyses: Map<TrackId, Analysis>;
  current: Analysis | null;
  mood: Mood;
  /** Newest first. */
  playedIds: TrackId[];
  /** Newest first. */
  playedArtists: string[];
  /** Minutes since the set started, for the energy arc. */
  setElapsedMin: number;
  /** Whether the file behind a track can actually be read right now. */
  isAvailable: (id: TrackId) => boolean;
  /** The chosen set style, which decides where the energy should go. */
  style?: SetStyle;
}

export interface ScoredTrack {
  track: Track;
  score: number;
  /** For the "why this track" line in the UI. */
  reason: string;
}

/** 1 when the tempos lock, tapering to a floor when they cannot. */
function tempoScore(current: Analysis | null, candidate: Analysis | undefined): number {
  if (!current || !candidate) return 0.6;
  const rate = matchRate(current.bpm, candidate.bpm);
  if (rate === null) return 0.2;
  return 1 - (Math.abs(rate - 1) / MAX_TEMPO_STRETCH) * 0.4;
}

/**
 * Where the set should sit on the energy scale this far in. A live set goes
 * somewhere across a night instead of holding one level all evening.
 */
export function arcTarget(elapsedMin: number, style?: SetStyle): number {
  const opening = style?.openingEnergy ?? SET_OPENING_ENERGY;
  const peak = style?.peakEnergy ?? SET_PEAK_ENERGY;
  const over = style?.climbMin ?? SET_CLIMB_MIN;
  const climb = Math.max(0, Math.min(1, elapsedMin / over));
  return opening + (peak - opening) * climb;
}

/** 1 when the track sits exactly where the arc and the mood ask for. */
function energyScore(
  current: Analysis | null,
  candidate: Analysis | undefined,
  mood: Mood,
  elapsedMin: number,
  style?: SetStyle,
): number {
  if (!candidate) return 0.5;
  const arc = arcTarget(elapsedMin, style);
  // Weighted towards the arc so the set climbs, but anchored to where it
  // actually is so it does not lurch from one track to the next.
  const continuity = current?.energyScore ?? arc;
  const target = Math.max(0, Math.min(1, 0.6 * arc + 0.4 * continuity + MOOD_SHIFT[mood]));
  return 1 - Math.min(1, Math.abs(candidate.energyScore - target) / 0.5);
}

/**
 * Harmonic mixing: 1 when the two keys sit well together on the Camelot wheel.
 *
 * Neutral rather than punishing when either key is unknown or the detector was
 * unsure — plenty of music is modal or percussive enough to have no useful key,
 * and refusing to play it would be worse than mixing it blind.
 */
function keyScore(current: Analysis | null, candidate: Analysis | undefined): number {
  const from = current?.key;
  const to = candidate?.key;
  if (!from || !to) return 0.6;
  if (from.confidence < KEY_CONFIDENCE_FLOOR || to.confidence < KEY_CONFIDENCE_FLOOR) return 0.6;
  return keysAreCompatible(from.camelot, to.camelot) ? 1 : 0.25;
}

export function scoreTrack(track: Track, input: SelectionInput): ScoredTrack | null {
  if (!track.supported || !input.isAvailable(track.id)) return null;

  const playedAgo = input.playedIds.indexOf(track.id);
  if (playedAgo >= 0 && playedAgo < ROTATION_WINDOW) return null;

  const analysis = input.analyses.get(track.id);
  // An hour-long DJ mix or podcast cannot be held in memory beside a second
  // deck, and is not something to beat-match anyway.
  if (tooLongToMix(analysis?.durationSec ?? track.durationSec)) return null;

  const tempo = tempoScore(input.current, analysis);
  const energy = energyScore(input.current, analysis, input.mood, input.setElapsedMin, input.style);

  const harmony = keyScore(input.current, analysis);
  let score = 0.45 * tempo + 0.35 * energy + 0.2 * harmony;
  if (!analysis) score *= UNANALYSED_PENALTY;

  const artistAgo = input.playedArtists.indexOf(track.artist);
  if (artistAgo >= 0 && artistAgo < ARTIST_WINDOW) score *= ARTIST_PENALTY;

  let reason = 'fits the set';
  if (analysis && input.current) {
    const rate = matchRate(input.current.bpm, analysis.bpm);
    if (rate !== null) reason = `${Math.round(analysis.bpm)} BPM, mixes cleanly`;
    else reason = `${Math.round(analysis.bpm)} BPM, different tempo`;
  } else if (analysis) {
    reason = `${Math.round(analysis.bpm)} BPM`;
  } else {
    reason = 'not analysed yet';
  }

  return { track, score, reason };
}

/**
 * Picks from the top of the list rather than taking the winner every time — an
 * always-optimal DJ plays the same set twice, which is the one thing a radio
 * must not do. Higher scores are still strongly favoured.
 */
export function pickNext(input: SelectionInput, random: () => number = Math.random): ScoredTrack | null {
  const scored: ScoredTrack[] = [];
  for (const track of input.tracks) {
    const candidate = scoreTrack(track, input);
    if (candidate) scored.push(candidate);
  }

  if (scored.length === 0) {
    // Everything is in the rotation window: fall back to the least recently
    // played track that can actually be read, so the music never stops.
    const fallback = input.tracks
      .filter(
        (track) =>
          track.supported &&
          input.isAvailable(track.id) &&
          !tooLongToMix(input.analyses.get(track.id)?.durationSec ?? track.durationSec),
      )
      .sort((a, b) => input.playedIds.indexOf(a.id) - input.playedIds.indexOf(b.id))
      .pop();
    return fallback ? { track: fallback, score: 0, reason: 'starting the rotation again' } : null;
  }

  scored.sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, SHORTLIST);

  // Cubed weights: a clearly better track wins most of the time, but not always.
  const weights = shortlist.map((entry) => Math.max(0.001, entry.score) ** 3);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let i = 0; i < shortlist.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return shortlist[i];
  }
  return shortlist[0];
}
