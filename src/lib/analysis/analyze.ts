import type { Analysis, Track } from '../../types';
import { ANALYSIS_VERSION } from '../../types';
import { decodeFile } from '../audio/context';
import { getAnalysis, putAnalysis } from '../library/db';
import { fileFor } from '../library/fileSource';
import type { AnalyzeRequest, AnalyzeResult } from './analysis.worker';
import { detectTempo } from './bpm';

/**
 * Orchestrates one track's analysis: decode, find the tempo, hand the samples
 * to the worker, cache the result.
 *
 * Results live in IndexedDB forever, keyed by the file's identity — a track is
 * only ever analysed once, no matter how many times the app is opened.
 */

let worker: Worker | null = null;
/** The worker handles one request at a time; this chains callers behind it. */
let inFlight: Promise<unknown> = Promise.resolve();

function analysisWorker(): Worker {
  worker ??= new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

function runInWorker(request: AnalyzeRequest, transfer: ArrayBuffer[]): Promise<AnalyzeResult> {
  const run = inFlight.then(
    () =>
      new Promise<AnalyzeResult>((resolve, reject) => {
        const target = analysisWorker();
        const onMessage = (event: MessageEvent<AnalyzeResult>) => {
          if (event.data.id !== request.id) return;
          cleanup();
          resolve(event.data);
        };
        const onError = (event: ErrorEvent) => {
          cleanup();
          reject(new Error(event.message));
        };
        function cleanup(): void {
          target.removeEventListener('message', onMessage);
          target.removeEventListener('error', onError);
        }
        target.addEventListener('message', onMessage);
        target.addEventListener('error', onError);
        target.postMessage(request, transfer);
      }),
  );
  // Keep the chain alive even when one track fails.
  inFlight = run.catch(() => undefined);
  return run;
}

/** Channel data is a view into the AudioBuffer, so it has to be copied before
 *  it can be transferred — detaching the original would silence the deck. */
function copyChannels(buffer: AudioBuffer): Float32Array[] {
  const count = Math.min(2, buffer.numberOfChannels);
  return Array.from({ length: count }, (_, i) => buffer.getChannelData(i).slice());
}

export async function cachedAnalysis(track: Track): Promise<Analysis | null> {
  const cached = await getAnalysis(track.id);
  return cached && cached.version === ANALYSIS_VERSION ? cached : null;
}

/**
 * Analyses a track, reusing the cache when possible. Pass `buffer` when the
 * track has already been decoded for playback, to avoid decoding it twice.
 */
export async function analyzeTrack(track: Track, buffer?: AudioBuffer): Promise<Analysis> {
  const cached = await cachedAnalysis(track);
  if (cached) return cached;

  const decoded = buffer ?? (await decodeFile(await fileFor(track.id)));
  const tempo = await detectTempo(decoded, track.tagBpm);
  const channels = copyChannels(decoded);

  const result = await runInWorker(
    {
      id: track.id,
      channels,
      sampleRate: decoded.sampleRate,
      bpm: tempo.bpm,
      beatOffset: tempo.beatOffset,
    },
    channels.map((channel) => channel.buffer as ArrayBuffer),
  );

  const analysis: Analysis = {
    id: track.id,
    version: ANALYSIS_VERSION,
    durationSec: result.durationSec,
    bpm: tempo.bpm,
    beatOffset: tempo.beatOffset,
    // A grid we never detected cannot be trusted, whatever the samples suggest.
    bpmConfidence: tempo.detected ? result.bpmConfidence : Math.min(result.bpmConfidence, 0.2),
    peaks: result.peaks,
    energy: result.energy,
    loudnessDb: result.loudnessDb,
    energyScore: result.energyScore,
    mixInSec: result.mixInSec,
    mixOutSec: result.mixOutSec,
    analyzedAt: Date.now(),
  };

  await putAnalysis(analysis);
  return analysis;
}
