import type { Analysis, MixKind } from '../../types';
import {
  CONFIDENCE_FLOOR,
  DEFAULT_MIX_BEATS,
  MAX_TEMPO_STRETCH,
  PHRASE_BEATS,
  SEGMENT_MAX_SEC,
  SEGMENT_MIN_SEC,
  SEGMENT_TARGET_SEC,
} from '../constants';
import { BASS_CUT_DB, type Deck } from './deck';

/**
 * Everything about how one track hands over to the next.
 *
 * The plan is pure maths, worked out in advance; the scheduling is then handed
 * to the Web Audio clock in one go. Nothing here runs on a timer — a mix that
 * depended on `setTimeout` firing on time would drift audibly.
 */

/** A mix is never scheduled closer than this, to leave room for the ramps. */
const MIN_LEAD_SEC = 1.5;
/** Shortest blend we will ever perform, for tracks that end abruptly. */
const MIN_MIX_SEC = 2;
/** Plain crossfades ignore the beat grid and just take this long. */
const PLAIN_MIX_SEC = 5;

export interface MixPlan {
  kind: MixKind;
  /** AudioContext time at which the incoming deck starts. */
  startAt: number;
  /** Length of the blend, in real seconds. */
  durationSec: number;
  /** Playback rate for the incoming deck. */
  rate: number;
  /** Where the incoming track starts, in its own seconds. */
  offsetSec: number;
  /** Blend length expressed in beats of the outgoing track. */
  beats: number;
}

export function beatSec(analysis: Analysis): number {
  return 60 / analysis.bpm;
}

/** The first bar line at or after `t`, in that track's own seconds. */
export function snapToBar(analysis: Analysis, t: number, beatsPerBar = 4): number {
  const bar = beatSec(analysis) * beatsPerBar;
  if (bar <= 0) return t;
  return analysis.beatOffset + Math.ceil((t - analysis.beatOffset) / bar) * bar;
}

/**
 * Finds a playback rate that puts the incoming track in step with the outgoing
 * one. Half- and double-time count as a match: a 174 BPM track sits perfectly
 * over an 87 BPM track. Returns null when no option lands inside the stretch
 * limit, which is the signal to fall back to a plain crossfade rather than
 * pitch a track until it sounds wrong.
 */
export function matchRate(outgoingBpm: number, incomingBpm: number): number | null {
  if (!(outgoingBpm > 0) || !(incomingBpm > 0)) return null;
  let best: number | null = null;
  for (const multiple of [1, 2, 0.5]) {
    const rate = (outgoingBpm * multiple) / incomingBpm;
    if (Math.abs(rate - 1) > MAX_TEMPO_STRETCH) continue;
    if (best === null || Math.abs(rate - 1) < Math.abs(best - 1)) best = rate;
  }
  return best;
}

export interface MixInput {
  outgoing: Analysis;
  /** Rate the outgoing deck is playing at, so tempo maths uses what is heard. */
  outgoingRate: number;
  /** Where the outgoing track is now, in its own seconds. */
  outgoingPositionSec: number;
  incoming: Analysis;
  /** `audioContext.currentTime` as of planning. */
  contextNow: number;
  /** Skip straight to the blend — the user pressed "mix now". */
  immediate?: boolean;
  beats?: number;
}

/**
 * Where the outgoing track starts handing over, in its own seconds.
 *
 * A live DJ gives a track its hook and then moves — roughly a minute and a
 * quarter, not five minutes. The segment is snapped to whole musical phrases so
 * the handover lands on a phrase boundary rather than halfway through a bar,
 * which means the real length varies a little with tempo. That variation is
 * welcome: a set where every track lasts exactly 75 seconds sounds mechanical.
 *
 * This is the single source of truth for the handover point. The mixer uses it
 * to schedule, and the control loop uses it to know when to start preparing —
 * if the two disagreed, tracks would either be cut short or overrun.
 */
export function handoverAt(analysis: Analysis): number {
  const beat = beatSec(analysis);
  const phrase = beat * PHRASE_BEATS;
  const blendSpan = beat * DEFAULT_MIX_BEATS;

  let segment = Math.max(1, Math.round(SEGMENT_TARGET_SEC / phrase)) * phrase;
  if (segment < SEGMENT_MIN_SEC) segment = Math.ceil(SEGMENT_MIN_SEC / phrase) * phrase;
  if (segment > SEGMENT_MAX_SEC) segment = Math.max(phrase, Math.floor(SEGMENT_MAX_SEC / phrase) * phrase);

  // The blend occupies the tail of the segment, and never runs past the point
  // where the track's body stops.
  const handover = Math.min(analysis.hookSec + segment, analysis.mixOutSec) - blendSpan;
  return Math.max(analysis.hookSec + blendSpan, handover);
}

export function planMix(input: MixInput): MixPlan {
  const { outgoing, outgoingRate, outgoingPositionSec, incoming, contextNow, immediate } = input;

  const trusted = outgoing.bpmConfidence >= CONFIDENCE_FLOOR && incoming.bpmConfidence >= CONFIDENCE_FLOOR;
  const outgoingBpm = outgoing.bpm * outgoingRate;
  const rate = trusted ? matchRate(outgoingBpm, incoming.bpm) : null;
  const kind: MixKind = rate === null ? 'plain' : 'beatmatched';

  const beats = input.beats ?? DEFAULT_MIX_BEATS;
  let durationSec = kind === 'beatmatched' ? (beats * 60) / outgoingBpm : PLAIN_MIX_SEC;

  // Work in the outgoing track's own seconds, then convert to context time once.
  const earliest = outgoingPositionSec + MIN_LEAD_SEC * outgoingRate;
  const remaining = Math.max(0, outgoing.durationSec - earliest);

  let spanInTrack = durationSec * outgoingRate;
  if (spanInTrack > remaining) {
    // The track is nearly over: shorten the blend rather than run off the end.
    spanInTrack = Math.max(MIN_MIX_SEC * outgoingRate, remaining * 0.8);
    durationSec = spanInTrack / outgoingRate;
  }

  const latest = Math.max(earliest, outgoing.durationSec - spanInTrack);
  let startInTrack = immediate ? earliest : Math.max(earliest, handoverAt(outgoing));
  startInTrack = Math.min(startInTrack, latest);
  if (kind === 'beatmatched') startInTrack = Math.min(snapToBar(outgoing, startInTrack), latest);

  // Come in at the hook, not at bar one. This is the difference between a set
  // and a playlist.
  let offsetSec = incoming.hookSec;
  if (kind === 'beatmatched') offsetSec = snapToBar(incoming, offsetSec);
  // But never so late that there is no track left to play — and never earlier
  // than where the track actually starts making sound.
  const latestEntry = Math.max(incoming.mixInSec, incoming.durationSec - SEGMENT_MIN_SEC);
  offsetSec = Math.max(0, Math.min(offsetSec, latestEntry));

  return {
    kind,
    startAt: contextNow + (startInTrack - outgoingPositionSec) / outgoingRate,
    durationSec,
    rate: rate ?? 1,
    offsetSec,
    beats: Math.max(1, Math.round(durationSec / (60 / outgoingBpm))),
  };
}

/** Equal-power crossfade: constant perceived loudness across the blend. */
function equalPowerCurve(rising: boolean, steps = 128): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    curve[i] = rising ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
  }
  return curve;
}

/**
 * Commits a plan to the audio clock: starts the incoming deck, crossfades the
 * two faders, swaps the bass between them, and stops the outgoing deck.
 *
 * The bass swap is what stops a mix turning to mud — two kick drums and two
 * basslines at once is far more low end than either track was mastered for, so
 * the outgoing low shelf is pulled down as the incoming one comes up, crossing
 * over in the middle of the blend.
 */
export function scheduleMix(outgoingDeck: Deck, incomingDeck: Deck, plan: MixPlan, onIncomingEnded?: () => void): void {
  const { startAt, durationSec, rate, offsetSec } = plan;
  const endAt = startAt + durationSec;

  incomingDeck.start(startAt, offsetSec, rate, onIncomingEnded);

  const fadeIn = incomingDeck.fader.gain;
  fadeIn.cancelScheduledValues(startAt);
  fadeIn.setValueAtTime(0, startAt);
  fadeIn.setValueCurveAtTime(equalPowerCurve(true), startAt, durationSec);

  const fadeOut = outgoingDeck.fader.gain;
  fadeOut.cancelScheduledValues(startAt);
  fadeOut.setValueCurveAtTime(equalPowerCurve(false), startAt, durationSec);

  // Bass crosses over in the middle third, well inside the fade.
  const swapStart = startAt + durationSec * 0.35;
  const swapEnd = startAt + durationSec * 0.65;

  const incomingLow = incomingDeck.low.gain;
  incomingLow.cancelScheduledValues(startAt);
  incomingLow.setValueAtTime(BASS_CUT_DB, startAt);
  incomingLow.setValueAtTime(BASS_CUT_DB, swapStart);
  incomingLow.linearRampToValueAtTime(0, swapEnd);

  const outgoingLow = outgoingDeck.low.gain;
  outgoingLow.cancelScheduledValues(startAt);
  outgoingLow.setValueAtTime(0, swapStart);
  outgoingLow.linearRampToValueAtTime(BASS_CUT_DB, swapEnd);

  outgoingDeck.stopAt(endAt + 0.05);
}
