/**
 * Synthetic tracks for development.
 *
 * The folder picker is a native dialog, which cannot be driven from a test, so
 * this generates real WAV files in memory and feeds them through exactly the
 * same path as dropped files: tag reading, decoding, tempo detection, analysis,
 * beat-matched mixing. Nothing here is a stub.
 *
 * Tracks are short (25 seconds) so a full transition can be watched in under a
 * minute instead of waiting out a whole song.
 */

const SAMPLE_RATE = 44100;
const DEMO_SECONDS = 25;

/** Deterministic noise, so two runs produce identical files. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/** A kick, a hat and a bassline on a strict grid — easy for the beat detector
 *  to read, which is the point: it isolates mixing bugs from detection bugs. */
function renderTrack(bpm: number, seed: number): Float32Array {
  const length = SAMPLE_RATE * DEMO_SECONDS;
  const out = new Float32Array(length);
  const random = seeded(seed);
  const beatSec = 60 / bpm;
  const beats = Math.floor(DEMO_SECONDS / beatSec);
  const bassNotes = [55, 55, 73.42, 61.74];

  for (let beat = 0; beat < beats; beat += 1) {
    const beatStart = Math.floor(beat * beatSec * SAMPLE_RATE);

    // Kick: pitch drops from 120Hz to 45Hz over 150ms.
    const kickLength = Math.floor(0.15 * SAMPLE_RATE);
    let phase = 0;
    for (let i = 0; i < kickLength && beatStart + i < length; i += 1) {
      const t = i / kickLength;
      phase += (2 * Math.PI * (120 - 75 * t)) / SAMPLE_RATE;
      out[beatStart + i] += Math.sin(phase) * Math.exp(-5 * t) * 0.85;
    }

    // Hat on the offbeat.
    const hatStart = beatStart + Math.floor(beatSec * 0.5 * SAMPLE_RATE);
    const hatLength = Math.floor(0.03 * SAMPLE_RATE);
    for (let i = 0; i < hatLength && hatStart + i < length; i += 1) {
      out[hatStart + i] += (random() * 2 - 1) * Math.exp(-40 * (i / hatLength)) * 0.12;
    }

    // Bass note, one per beat, cycling through a four-bar figure.
    const note = bassNotes[Math.floor(beat / 4) % bassNotes.length];
    const noteLength = Math.floor(beatSec * 0.9 * SAMPLE_RATE);
    for (let i = 0; i < noteLength && beatStart + i < length; i += 1) {
      const t = i / noteLength;
      out[beatStart + i] += Math.sin((2 * Math.PI * note * i) / SAMPLE_RATE) * Math.exp(-2 * t) * 0.22;
    }
  }

  // Quiet intro and outro, so the analyser has real mix points to find.
  const rampSamples = Math.floor(beatSec * 4 * SAMPLE_RATE);
  for (let i = 0; i < rampSamples && i < length; i += 1) {
    const gain = 0.12 + 0.88 * (i / rampSamples);
    out[i] *= gain;
    out[length - 1 - i] *= gain;
  }
  return out;
}

export interface DemoSpec {
  name: string;
  bpm: number;
}

/** Tempos chosen to exercise all three cases: an exact match, a match inside
 *  the stretch limit, and a pair that only works at half/double time. */
export const DEMO_SET: DemoSpec[] = [
  { name: 'Demo One', bpm: 124 },
  { name: 'Demo Two', bpm: 126 },
  { name: 'Demo Three', bpm: 128 },
  { name: 'Demo Four', bpm: 64 },
];

export function buildDemoFiles(): File[] {
  return DEMO_SET.map((spec, index) => {
    const blob = encodeWav(renderTrack(spec.bpm, index * 7919 + 13), SAMPLE_RATE);
    return new File([blob], `${spec.name} - ${spec.bpm} BPM.wav`, { type: 'audio/wav' });
  });
}
