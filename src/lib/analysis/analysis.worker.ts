/// <reference lib="webworker" />
/**
 * The number-crunching half of analysis. Receives raw samples (transferred, so
 * nothing is copied) and returns everything the DJ needs to mix a track:
 * a drawable waveform, an energy curve, a matched playback level, where the
 * intro ends and the outro begins, and how much to trust the beat grid.
 *
 * Kept off the main thread because a five-minute track is ~13 million samples
 * per channel and the waveform must never stutter.
 */
import { ENERGY_PER_SECOND, HOOK_WINDOW_SEC, PEAKS_PER_SECOND, SEGMENT_MIN_SEC } from '../constants';

export interface AnalyzeRequest {
  id: string;
  channels: Float32Array[];
  sampleRate: number;
  bpm: number;
  beatOffset: number;
}

export interface AnalyzeResult {
  id: string;
  durationSec: number;
  peaks: Float32Array;
  energy: Float32Array;
  loudnessDb: number;
  energyScore: number;
  bpmConfidence: number;
  mixInSec: number;
  mixOutSec: number;
  hookSec: number;
}

/** Onset envelope resolution. 512 samples is about 12ms — fine enough for a kick. */
const ONSET_HOP = 512;

function downmix(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    out[i] = sum / channels.length;
  }
  return out;
}

function bucketPeaks(mono: Float32Array, sampleRate: number, perSecond: number): Float32Array {
  const size = Math.max(1, Math.round(sampleRate / perSecond));
  const out = new Float32Array(Math.ceil(mono.length / size));
  for (let b = 0; b < out.length; b += 1) {
    const start = b * size;
    const end = Math.min(start + size, mono.length);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const abs = Math.abs(mono[i]);
      if (abs > peak) peak = abs;
    }
    out[b] = peak;
  }
  return out;
}

function bucketRms(mono: Float32Array, sampleRate: number, perSecond: number): Float32Array {
  const size = Math.max(1, Math.round(sampleRate / perSecond));
  const out = new Float32Array(Math.ceil(mono.length / size));
  for (let b = 0; b < out.length; b += 1) {
    const start = b * size;
    const end = Math.min(start + size, mono.length);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += mono[i] * mono[i];
    out[b] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return out;
}

/**
 * Half-wave rectified rise in short-window energy: cheap, and good enough to
 * find drum hits in anything with drums.
 */
function onsetEnvelope(mono: Float32Array): Float32Array {
  const frames = Math.floor(mono.length / ONSET_HOP);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    const start = f * ONSET_HOP;
    for (let i = start; i < start + ONSET_HOP; i += 1) sum += mono[i] * mono[i];
    rms[f] = Math.sqrt(sum / ONSET_HOP);
  }
  const onsets = new Float32Array(frames);
  for (let f = 1; f < frames; f += 1) onsets[f] = Math.max(0, rms[f] - rms[f - 1]);
  return onsets;
}

function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * How well does the predicted beat grid line up with where the hits actually
 * are? Compares onset strength at beat positions against the average.
 * A four-to-the-floor track scores near 1; a rubato piano piece scores near 0
 * and gets a plain crossfade instead of a beat-match.
 */
function gridConfidence(
  onsets: Float32Array,
  sampleRate: number,
  bpm: number,
  beatOffset: number,
  durationSec: number,
): number {
  if (!(bpm > 0)) return 0;
  const framesPerSec = sampleRate / ONSET_HOP;
  const beatSec = 60 / bpm;

  let total = 0;
  for (const value of onsets) total += value;
  const mean = total / Math.max(1, onsets.length);
  if (mean <= 0) return 0;

  let hit = 0;
  let beats = 0;
  for (let t = beatOffset; t < durationSec; t += beatSec) {
    const frame = Math.round(t * framesPerSec);
    if (frame < 1 || frame >= onsets.length - 1) continue;
    // A one-frame window either side absorbs small grid drift.
    hit += Math.max(onsets[frame - 1], onsets[frame], onsets[frame + 1]);
    beats += 1;
  }
  if (beats < 8) return 0;

  const ratio = hit / beats / mean;
  // ratio 1 means no better than chance; 3 or more is a strong, obvious pulse.
  return Math.max(0, Math.min(1, (ratio - 1) / 2));
}

/**
 * First and last points where the track is meaningfully above its own noise
 * floor — long silent intros and fade-outs should not eat the mix.
 */
function findMixPoints(energy: Float32Array, durationSec: number): { mixInSec: number; mixOutSec: number } {
  const body = percentile(energy, 0.6);
  const threshold = body * 0.45;

  let first = 0;
  while (first < energy.length && energy[first] < threshold) first += 1;

  let last = energy.length - 1;
  while (last > first && energy[last] < threshold) last -= 1;

  const mixInSec = Math.min(first / ENERGY_PER_SECOND, durationSec * 0.25);
  // Hand over where the body of the track ends, not where the file ends.
  const mixOutSec = Math.max(mixInSec, Math.min(last / ENERGY_PER_SECOND, durationSec));
  return { mixInSec, mixOutSec };
}

/**
 * Finds the hook: the start of the track's biggest sustained section.
 *
 * A DJ playing live comes in at the drop or the chorus, not at bar one — that
 * is most of what makes a set sound like a set rather than a playlist. So slide
 * a window across the energy curve, take the loudest sustained stretch, then
 * walk backwards to where that stretch actually begins.
 *
 * Deliberately conservative: a track whose energy never really varies (a lot of
 * hip hop, most Bollywood) has no obvious drop, and for those this lands close
 * to the end of the intro, which is the right answer anyway.
 */
function findHook(energy: Float32Array, mixInSec: number, mixOutSec: number): number {
  const first = Math.floor(mixInSec * ENERGY_PER_SECOND);
  const last = Math.floor(mixOutSec * ENERGY_PER_SECOND);
  const window = Math.round(HOOK_WINDOW_SEC * ENERGY_PER_SECOND);
  if (last - first <= window) return mixInSec;

  // Leave a whole segment after the hook. Some tracks — a lot of afro house —
  // genuinely peak in their final thirty seconds, and entering there would give
  // the set a few bars before it had to move on again.
  const minTail = Math.round(SEGMENT_MIN_SEC * ENERGY_PER_SECOND);
  const latestStart = Math.max(first, last - Math.max(window, minTail));

  let bestStart = first;
  let bestMean = -1;
  let sum = 0;
  for (let i = first; i < first + window; i += 1) sum += energy[i];

  for (let start = first; start <= latestStart; start += 1) {
    const mean = sum / window;
    // Ties go to the earlier window: given two equally big sections, the first
    // one is the one the listener is waiting for.
    if (mean > bestMean + 0.01) {
      bestMean = mean;
      bestStart = start;
    }
    sum += (energy[start + window] ?? 0) - energy[start];
  }

  // Walk back to where the section starts, rather than into the middle of it.
  const entryThreshold = bestMean * 0.82;
  let entry = bestStart;
  while (entry > first && energy[entry - 1] >= entryThreshold) entry -= 1;

  return entry / ENERGY_PER_SECOND;
}

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const { id, channels, sampleRate, bpm, beatOffset } = event.data;
  const mono = downmix(channels);
  const durationSec = mono.length / sampleRate;

  const rawPeaks = bucketPeaks(mono, sampleRate, PEAKS_PER_SECOND);
  const rawEnergy = bucketRms(mono, sampleRate, ENERGY_PER_SECOND);

  // Peaks are for drawing, so they are normalised to the track's own maximum.
  let maxPeak = 0;
  for (const value of rawPeaks) if (value > maxPeak) maxPeak = value;
  const peaks = new Float32Array(rawPeaks.length);
  if (maxPeak > 0) for (let i = 0; i < rawPeaks.length; i += 1) peaks[i] = rawPeaks[i] / maxPeak;

  // Loudness is absolute — it is what lets two decks be trimmed to match.
  let sumSquares = 0;
  for (const value of rawEnergy) sumSquares += value * value;
  const overallRms = Math.sqrt(sumSquares / Math.max(1, rawEnergy.length));
  const loudnessDb = overallRms > 0 ? 20 * Math.log10(overallRms) : -60;

  // The energy curve is normalised to the track's own loud sections, so "how
  // full does this sit" is comparable between a ballad and a club record.
  const loudSection = percentile(rawEnergy, 0.95) || 1;
  const energy = new Float32Array(rawEnergy.length);
  for (let i = 0; i < rawEnergy.length; i += 1) energy[i] = Math.min(1, rawEnergy[i] / loudSection);

  let energySum = 0;
  for (const value of energy) energySum += value;
  const density = energySum / Math.max(1, energy.length);
  const tempoWeight = Math.max(0, Math.min(1, (bpm - 70) / 80));
  const energyScore = Math.max(0, Math.min(1, 0.6 * density + 0.4 * tempoWeight));

  const bpmConfidence = gridConfidence(onsetEnvelope(mono), sampleRate, bpm, beatOffset, durationSec);
  const { mixInSec, mixOutSec } = findMixPoints(energy, durationSec);
  const hookSec = findHook(energy, mixInSec, mixOutSec);

  const result: AnalyzeResult = {
    id,
    durationSec,
    peaks,
    energy,
    loudnessDb,
    energyScore,
    bpmConfidence,
    mixInSec,
    mixOutSec,
    hookSec,
  };
  (self as unknown as Worker).postMessage(result, [peaks.buffer, energy.buffer]);
};
