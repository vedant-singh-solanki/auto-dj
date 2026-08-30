/**
 * Musical key detection, and the Camelot wheel DJs mix by.
 *
 * The method is Krumhansl-Schmuckler: build a chroma vector (how much energy
 * sits on each of the twelve pitch classes across the whole track), then
 * correlate it against profiles for all twenty-four major and minor keys and
 * take the best fit. It is the standard approach, it is cheap, and it is
 * roughly as good as commercial detectors on anything with clear tonality.
 *
 * It is not infallible — modal, atonal and heavily percussive tracks fool it —
 * so the correlation strength is kept and reported as confidence. Anything weak
 * is treated as "unknown" rather than mixed on.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Krumhansl-Kessler profiles: how strongly each pitch class implies a key. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * The Camelot wheel. Two tracks mix harmonically when they share a number, or
 * sit one step apart on it, or share the number across the A/B letter — which
 * is exactly the relative minor/major pair.
 */
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

export interface DetectedKey {
  /** Twelve pitch classes, C = 0. */
  tonic: number;
  mode: 'major' | 'minor';
  /** e.g. "8B". */
  camelot: string;
  /** e.g. "C major". */
  name: string;
  /** 0..1. Below KEY_CONFIDENCE_FLOOR the key is not trusted. */
  confidence: number;
}

/** Pearson correlation between a chroma vector and a rotated key profile. */
function correlate(chroma: number[], profile: number[], rotation: number): number {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < 12; i += 1) {
    sumX += chroma[i];
    sumY += profile[i];
  }
  const meanX = sumX / 12;
  const meanY = sumY / 12;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < 12; i += 1) {
    const x = chroma[(i + rotation) % 12] - meanX;
    const y = profile[i] - meanY;
    num += x * y;
    denX += x * x;
    denY += y * y;
  }
  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}

/**
 * Picks the best-fitting key from a chroma vector.
 *
 * Confidence is the gap between the winner and the runner-up rather than the
 * winner's raw correlation: a track that fits C major at 0.9 and A minor at
 * 0.89 has not really told us anything, and that is the case worth catching.
 */
export function keyFromChroma(chroma: number[]): DetectedKey {
  let best = { score: -2, tonic: 0, mode: 'major' as const };
  let runnerUp = -2;

  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const mode of ['major', 'minor'] as const) {
      const score = correlate(chroma, mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE, tonic);
      if (score > best.score) {
        runnerUp = best.score;
        best = { score, tonic, mode: mode as 'major' };
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }
  }

  const separation = Math.max(0, best.score - runnerUp);
  return {
    tonic: best.tonic,
    mode: best.mode,
    camelot: best.mode === 'major' ? CAMELOT_MAJOR[best.tonic] : CAMELOT_MINOR[best.tonic],
    name: `${NOTE_NAMES[best.tonic]} ${best.mode}`,
    confidence: Math.max(0, Math.min(1, separation * 6)),
  };
}

/**
 * Whether two Camelot keys sit well together: the same key, one step around the
 * wheel, or the relative major/minor of the same number. This is the rule
 * harmonic mixing runs on.
 */
export function keysAreCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const numberA = Number.parseInt(a, 10);
  const numberB = Number.parseInt(b, 10);
  const letterA = a.slice(-1);
  const letterB = b.slice(-1);
  if (!Number.isFinite(numberA) || !Number.isFinite(numberB)) return false;

  // Relative major/minor: same number, different letter.
  if (numberA === numberB) return true;

  // One step around a twelve-position wheel, staying in the same letter.
  const distance = Math.min(Math.abs(numberA - numberB), 12 - Math.abs(numberA - numberB));
  return letterA === letterB && distance === 1;
}
