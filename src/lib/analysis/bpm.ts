import { guess } from 'web-audio-beat-detector';
import { MAX_BPM, MIN_BPM } from '../constants';

export interface Tempo {
  bpm: number;
  /** Seconds to the first beat. beatAt(n) = beatOffset + n * 60 / bpm. */
  beatOffset: number;
  /** False when detection failed and we fell back to a tag or a default. */
  detected: boolean;
}

/**
 * Tempo detection halves or doubles freely — a 150 BPM drum track and a 75 BPM
 * reading describe the same pulse. Fold the answer into the range we mix in so
 * two tracks are never compared across an octave.
 */
export function foldTempo(bpm: number): number {
  let folded = bpm;
  while (folded > MAX_BPM) folded /= 2;
  while (folded > 0 && folded < MIN_BPM) folded *= 2;
  return folded;
}

/**
 * `guess` runs in its own worker inside the library, so this does not block the
 * page. It throws when it cannot find a pulse at all, which is common for
 * spoken word, ambient and live recordings — those fall back to the file's own
 * BPM tag, and ultimately to 120 with zero confidence, which makes the mixer
 * choose a plain crossfade.
 */
export async function detectTempo(buffer: AudioBuffer, tagBpm?: number): Promise<Tempo> {
  try {
    const { bpm, offset } = await guess(buffer);
    const folded = foldTempo(bpm);
    if (folded >= MIN_BPM && folded <= MAX_BPM) {
      // The offset was measured against the unfolded tempo, but it is still the
      // position of a real beat, so the grid stays aligned.
      return { bpm: folded, beatOffset: offset, detected: true };
    }
  } catch {
    // Fall through to the tag.
  }

  if (tagBpm && tagBpm > 0) {
    const folded = foldTempo(tagBpm);
    if (folded >= MIN_BPM && folded <= MAX_BPM) return { bpm: folded, beatOffset: 0, detected: false };
  }
  return { bpm: 120, beatOffset: 0, detected: false };
}
