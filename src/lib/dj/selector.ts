import type { Analysis, Mood, Track, TrackId } from '../../types';
import { ARTIST_WINDOW, MAX_TEMPO_STRETCH, ROTATION_WINDOW } from '../constants';
import { matchRate } from '../audio/transition';

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
  /** Whether the file behind a track can actually be read right now. */
  isAvailable: (id: TrackId) => boolean;
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

/** 1 when the track sits exactly where the mood asks for. */
function energyScore(current: Analysis | null, candidate: Analysis | undefined, mood: Mood): number {
  if (!candidate) return 0.5;
  const base = current?.energyScore ?? candidate.energyScore;
  const target = Math.max(0, Math.min(1, base + MOOD_SHIFT[mood]));
  return 1 - Math.min(1, Math.abs(candidate.energyScore - target) / 0.5);
}

export function scoreTrack(track: Track, input: SelectionInput): ScoredTrack | null {
  if (!track.supported || !input.isAvailable(track.id)) return null;

  const playedAgo = input.playedIds.indexOf(track.id);
  if (playedAgo >= 0 && playedAgo < ROTATION_WINDOW) return null;

  const analysis = input.analyses.get(track.id);
  const tempo = tempoScore(input.current, analysis);
  const energy = energyScore(input.current, analysis, input.mood);

  let score = 0.55 * tempo + 0.45 * energy;
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
      .filter((track) => track.supported && input.isAvailable(track.id))
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
