import type { Analysis, DeckId, Track } from '../../types';
import { audioContext } from './context';

/**
 * One playing track and its signal path:
 *
 *   source -> trim (auto-gain) -> low -> mid -> high -> fader -> master
 *
 * The trim exists so two tracks mastered at different levels arrive at the
 * crossfader sounding equally loud; the low shelf exists so the bass of the
 * outgoing track can be pulled out as the incoming one takes over.
 */

/** Decks are trimmed towards this level, in the same dBFS-ish units as
 *  `Analysis.loudnessDb`. Roughly where a modern master sits. */
const TARGET_LOUDNESS_DB = -20;
/** Trim is capped so a very quiet recording is not blown up into noise. */
const MIN_TRIM = 0.3;
const MAX_TRIM = 3;

export const BASS_CUT_DB = -26;

export interface LoadedTrack {
  track: Track;
  analysis: Analysis;
  buffer: AudioBuffer;
}

export class Deck {
  readonly id: DeckId;
  readonly input: GainNode;
  readonly trim: GainNode;
  readonly low: BiquadFilterNode;
  readonly mid: BiquadFilterNode;
  readonly high: BiquadFilterNode;
  readonly fader: GainNode;

  loaded: LoadedTrack | null = null;
  private source: AudioBufferSourceNode | null = null;

  /** Context time at which the current source started. */
  private startedAt = 0;
  /** Track position, in track seconds, corresponding to `startedAt`. */
  private startOffset = 0;
  private rate = 1;
  private endsAt = Infinity;
  /** Set while the deck is gliding back to the track's own tempo. */
  private glide: { target: number; endsAt: number } | null = null;

  constructor(id: DeckId, destination: AudioNode) {
    const ctx = audioContext();
    this.id = id;

    this.trim = ctx.createGain();
    this.input = this.trim;

    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 200;

    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.7;

    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 4000;

    this.fader = ctx.createGain();
    this.fader.gain.value = 0;

    this.trim.connect(this.low).connect(this.mid).connect(this.high).connect(this.fader).connect(destination);
  }

  get isPlaying(): boolean {
    return this.source !== null;
  }

  /** Loads a track without starting it. Call `start` to schedule playback. */
  load(loaded: LoadedTrack): void {
    this.stopNow();
    this.loaded = loaded;
    this.trim.gain.value = trimFor(loaded.analysis);
    this.resetEq();
  }

  resetEq(): void {
    const now = audioContext().currentTime;
    for (const band of [this.low, this.mid, this.high]) {
      band.gain.cancelScheduledValues(now);
      band.gain.setValueAtTime(0, now);
    }
  }

  /**
   * Schedules the track to begin at `when` (an AudioContext time), starting
   * `offset` seconds into the track and playing at `rate` times normal speed.
   */
  start(when: number, offset: number, rate: number, onEnded?: () => void): void {
    if (!this.loaded) return;
    const ctx = audioContext();

    const source = ctx.createBufferSource();
    source.buffer = this.loaded.buffer;
    source.playbackRate.value = rate;
    source.connect(this.trim);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        onEnded?.();
      }
    };
    source.start(when, offset);

    this.source = source;
    this.glide = null;
    this.startedAt = when;
    this.startOffset = offset;
    this.rate = rate;
    this.endsAt = when + (this.loaded.buffer.duration - offset) / rate;
  }

  /** Position within the track, in track seconds, at an AudioContext time. */
  positionAt(contextTime: number): number {
    if (!this.loaded) return 0;
    if (!this.source) return this.startOffset;
    if (this.glide && contextTime >= this.glide.endsAt) this.anchor(this.glide.endsAt, this.glide.target);
    const elapsed = Math.max(0, contextTime - this.startedAt);
    return Math.min(this.loaded.buffer.duration, this.startOffset + elapsed * this.rate);
  }

  /**
   * Re-bases the position bookkeeping so a rate change does not corrupt it.
   * Everything downstream assumes position is a straight line from
   * (startedAt, startOffset) at `rate`, so that line is redrawn on every change.
   */
  private anchor(at: number, rate: number): void {
    this.startOffset = this.positionAtRaw(at);
    this.startedAt = at;
    this.rate = rate;
    this.glide = null;
    if (this.loaded) this.endsAt = at + (this.loaded.buffer.duration - this.startOffset) / rate;
  }

  private positionAtRaw(contextTime: number): number {
    const duration = this.loaded?.buffer.duration ?? 0;
    return Math.min(duration, this.startOffset + Math.max(0, contextTime - this.startedAt) * this.rate);
  }

  /**
   * Slides the deck back to the track's own tempo after a mix has finished.
   *
   * Without this the whole set would stay locked to the tempo of whatever track
   * happened to start it, and hours later a track 10% faster could never be
   * beat-matched. The slide is slow enough — well under half a percent a
   * second — to pass as the pitch ride a human DJ would do by hand.
   *
   * The position model uses the average rate across the ramp, which is exactly
   * right at both ends and out by a few hundredths of a second in the middle.
   */
  glideToRate(target: number, seconds: number): void {
    if (!this.source || Math.abs(target - this.rate) < 0.001) return;
    const now = audioContext().currentTime;
    const from = this.rate;

    this.source.playbackRate.cancelScheduledValues(now);
    this.source.playbackRate.setValueAtTime(from, now);
    this.source.playbackRate.linearRampToValueAtTime(target, now + seconds);

    this.anchor(now, (from + target) / 2);
    this.glide = { target, endsAt: now + seconds };
  }

  /**
   * Pins the rate where it is. Called before scheduling a blend: the maths
   * behind a beat-match assumes the outgoing deck holds a steady tempo, so a
   * glide in progress has to stop first.
   */
  holdRate(): void {
    if (!this.source || !this.glide) return;
    const now = audioContext().currentTime;
    const held = this.rate;
    this.source.playbackRate.cancelScheduledValues(now);
    this.source.playbackRate.setValueAtTime(held, now);
    this.anchor(now, held);
  }

  /** Effective tempo, which is the track's own tempo times the pitch applied. */
  get playingBpm(): number {
    return (this.loaded?.analysis.bpm ?? 0) * this.rate;
  }

  get playbackRate(): number {
    return this.rate;
  }

  /** Context time at which the track will run out if nothing intervenes. */
  get runsOutAt(): number {
    return this.endsAt;
  }

  stopAt(when: number): void {
    try {
      this.source?.stop(when);
    } catch {
      // Already stopped — nothing to do.
    }
  }

  stopNow(): void {
    if (!this.source) return;
    const source = this.source;
    this.source = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Never started.
    }
    source.disconnect();
  }

  /** Drops the decoded audio. A five-minute track is about 50MB. */
  unload(): void {
    this.stopNow();
    this.loaded = null;
    this.glide = null;
    this.endsAt = Infinity;
  }
}

export function trimFor(analysis: Analysis): number {
  const gain = 10 ** ((TARGET_LOUDNESS_DB - analysis.loudnessDb) / 20);
  return Math.max(MIN_TRIM, Math.min(MAX_TRIM, gain));
}
