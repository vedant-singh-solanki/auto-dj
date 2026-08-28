/**
 * One AudioContext for the whole app — decoding and playback must share it so
 * decoded buffers already sit at the output sample rate.
 *
 * Browsers start it suspended until the user interacts with the page; decoding
 * works while suspended, playback does not, so `resumeAudio()` is called from
 * the first real click.
 */
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: 'playback' });
  return ctx;
}

export async function resumeAudio(): Promise<void> {
  const context = audioContext();
  if (context.state !== 'running') await context.resume();
}

export class DecodeError extends Error {}

/**
 * Decodes a whole file into memory. Callers must drop the buffer when done —
 * a five-minute stereo track is roughly 50MB decoded.
 */
export async function decodeFile(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  try {
    return await audioContext().decodeAudioData(bytes);
  } catch {
    throw new DecodeError(
      `"${file.name}" could not be played — the file may be damaged, or in a format this browser does not support.`,
    );
  }
}
