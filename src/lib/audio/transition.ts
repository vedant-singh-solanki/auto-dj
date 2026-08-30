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
import { BASS_CUT_DB, type Deck, FILTER_OPEN_HZ, FILTER_SWEEP_HZ } from './deck';

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

/** How many beats before the end of a blend the echo throw reaches full send. */
const ECHO_THROW_BEATS = 3;
/** Send level for the throw. Loud enough to hear, quiet enough not to smear. */
const ECHO_SEND = 0.32;

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

/**
 * Where a track should come in, in its own seconds.
 *
 * A cue point the user set by hand always wins over the hook the analyser
 * guessed at — the whole reason for having one is to overrule the machine on a
 * track it read wrongly.
 */
export function entrySec(analysis: Analysis, cue?: number): number {
  if (cue !== undefined && Number.isFinite(cue) && cue >= 0) {
    return Math.min(cue, Math.max(0, analysis.durationSec - 1));
  }
  return analysis.hookSec;
}

/**
 * The first phrase boundary at or after `t`, in that track's own seconds.
 *
 * This is the difference between a mix that sounds professional and one that
 * sounds automatic. Music is built in phrases — typically 8 or 16 bars — and a
 * blend that starts halfway through one lands the incoming chorus over the
 * outgoing verse. Snapping to bars (the previous behaviour) is not enough;
 * every fourth bar is a phrase, and only one of them is the right one.
 *
 * The phrase grid is anchored on the hook rather than on the detected beat
 * offset. The beat offset is just wherever the first beat happened to be
 * detected and carries no musical meaning, whereas the hook is a real section
 * boundary — so counting phrases out from it lands them where the music does.
 */
export function snapToPhrase(analysis: Analysis, t: number, anchorSec = analysis.hookSec): number {
  const phrase = beatSec(analysis) * PHRASE_BEATS;
  if (phrase <= 0) return t;
  return anchorSec + Math.round((t - anchorSec) / phrase) * phrase;
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
  /**
   * Where the outgoing track should hand over, in its own seconds. Passed in
   * rather than re-derived, so the mixer and the control loop cannot disagree
   * about it once manual nudges and cue points are in play.
   */
  handoverAtSec?: number;
  /** Manual entry point for the incoming track, if the user set one. */
  incomingCue?: number;
  /** Force a particular kind of transition, rather than choosing one. */
  kind?: MixKind;
  /** Injectable for tests, so a chosen kind can be made deterministic. */
  random?: () => number;
}

export interface HandoverOptions {
  /** Manual entry point for this track, if the user set one. */
  cue?: number;
  /**
   * Seconds to shift the handover by, from the "mix earlier"/"mix later"
   * buttons. Positive plays the track for longer.
   */
  nudgeSec?: number;
  /** Where the track actually started, when that is not its entry point —
   *  the opening track of a set begins at 0:00 however it is cued. */
  startedAtSec?: number;
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
export function handoverAt(analysis: Analysis, options: HandoverOptions = {}): number {
  const beat = beatSec(analysis);
  const phrase = beat * PHRASE_BEATS;
  const blendSpan = beat * DEFAULT_MIX_BEATS;
  // The segment is measured from wherever the track actually came in.
  const from = options.startedAtSec ?? entrySec(analysis, options.cue);

  let segment = Math.max(1, Math.round(SEGMENT_TARGET_SEC / phrase)) * phrase;
  if (segment < SEGMENT_MIN_SEC) segment = Math.ceil(SEGMENT_MIN_SEC / phrase) * phrase;
  if (segment > SEGMENT_MAX_SEC) segment = Math.max(phrase, Math.floor(SEGMENT_MAX_SEC / phrase) * phrase);

  // The blend occupies the tail of the segment, and never runs past the point
  // where the track's body stops.
  const handover = Math.min(from + segment, analysis.mixOutSec) - blendSpan;
  const nudged = Math.max(from + blendSpan, handover) + (options.nudgeSec ?? 0);

  // A nudge must not push the handover past the end of the track, nor drag it
  // back before the track has had time to establish itself.
  return Math.max(from + blendSpan, Math.min(nudged, analysis.durationSec - blendSpan));
}

/**
 * How long this particular blend should be, in beats.
 *
 * A DJ does not use the same transition all night, and an auto-mix that always
 * takes exactly sixteen beats announces itself as a machine within three
 * tracks. The length follows the energy relationship, which is roughly what a
 * human is reacting to:
 *
 * - dropping into something much bigger gets a short, punchy blend, because a
 *   long fade would waste the lift;
 * - two calm tracks get a long one, because there is nothing to hurry for;
 * - everything else gets the default.
 */
export function blendBeatsFor(outgoing: Analysis, incoming: Analysis): number {
  const jump = incoming.energyScore - outgoing.energyScore;
  if (jump > 0.18) return Math.round(DEFAULT_MIX_BEATS / 2);
  if (jump < -0.05 && incoming.energyScore < 0.55) return DEFAULT_MIX_BEATS * 2;
  return DEFAULT_MIX_BEATS;
}

/**
 * Which kind of transition this pair calls for.
 *
 * A DJ does not blend everything. House and techno get long tempo-locked
 * blends; hip-hop, pop and open-format sets live on cuts and rewinds, because
 * the tracks have vocals that would talk over each other and drops that are
 * wasted by a fade. Picking by ear is what a person does, so this picks by the
 * two things a person is reacting to: whether the tempos can lock at all, and
 * how big the jump in energy is.
 *
 * There is deliberate randomness in it. An auto-mix that always does the same
 * thing in the same situation gives itself away within a few tracks.
 */
export function chooseKind(
  rate: number | null,
  outgoing: Analysis,
  incoming: Analysis,
  random: () => number,
): MixKind {
  const jump = incoming.energyScore - outgoing.energyScore;

  if (rate === null) {
    // Tempos cannot meet. A rewind turns that into a deliberate gear change
    // rather than an apology, but only when both grids are solid enough to
    // land the drop on a beat.
    const confident =
      outgoing.bpmConfidence >= CONFIDENCE_FLOOR && incoming.bpmConfidence >= CONFIDENCE_FLOOR;
    if (confident && jump > 0 && random() < 0.4) return 'backspin';
    return 'plain';
  }

  // Tempos lock. A big lift is worth cutting to — the drop lands whole instead
  // of arriving underneath the track it is replacing.
  if (jump > 0.15 && random() < 0.5) return 'cut';
  return 'beatmatched';
}

export function planMix(input: MixInput): MixPlan {
  const { outgoing, outgoingRate, outgoingPositionSec, incoming, contextNow, immediate } = input;

  const trusted = outgoing.bpmConfidence >= CONFIDENCE_FLOOR && incoming.bpmConfidence >= CONFIDENCE_FLOOR;
  const outgoingBpm = outgoing.bpm * outgoingRate;
  const rate = trusted ? matchRate(outgoingBpm, incoming.bpm) : null;
  const kind: MixKind = input.kind ?? chooseKind(rate, outgoing, incoming, input.random ?? Math.random);

  const beats = input.beats ?? blendBeatsFor(outgoing, incoming);
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
  const handover = input.handoverAtSec ?? handoverAt(outgoing);
  let startInTrack = immediate ? earliest : Math.max(earliest, handover);
  startInTrack = Math.min(startInTrack, latest);
  if (kind === 'beatmatched') {
    // snapToPhrase rounds to the NEAREST phrase, so it can move the start
    // earlier. Re-clamp: a mix scheduled before the earliest safe point would
    // land in the past on the audio clock.
    startInTrack = Math.max(earliest, Math.min(snapToPhrase(outgoing, startInTrack), latest));
  }

  // Come in at the hook — or wherever the user cued it. This is the difference
  // between a set and a playlist.
  const entry = entrySec(incoming, input.incomingCue);
  let offsetSec = entry;
  if (kind === 'beatmatched') offsetSec = snapToPhrase(incoming, offsetSec, entry);
  if (input.incomingCue === undefined) {
    // Never so late that there is no track left to play, and never earlier than
    // where the track actually starts making sound. This guards the analyser's
    // guess only: an explicit cue is an instruction, and gets obeyed even if it
    // leaves a short segment — that is the user's call to make.
    const latestEntry = Math.max(incoming.mixInSec, incoming.durationSec - SEGMENT_MIN_SEC);
    offsetSec = Math.max(0, Math.min(offsetSec, latestEntry));
  } else {
    offsetSec = Math.max(0, Math.min(offsetSec, Math.max(0, incoming.durationSec - 1)));
  }

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
  // One beat of the outgoing track, as heard. Drives the echo timing.
  const outgoingBeatSec = plan.beats > 0 ? durationSec / plan.beats : 0;

  // A cut is not a short crossfade — it is the absence of one. Track A stops on
  // the downbeat and B is already at full level. Nothing overlaps, which is the
  // whole point: two vocals talking over each other is what a cut avoids.
  if (plan.kind === 'cut') {
    incomingDeck.start(startAt, offsetSec, rate, onIncomingEnded);
    forceAt(incomingDeck.fader.gain, 1, startAt);
    outgoingDeck.stopAt(startAt + 0.01);
    return;
  }

  // A rewind: A spins backwards to a stop, then B lands on the downbeat after.
  if (plan.kind === 'backspin') {
    outgoingDeck.backspin(startAt, durationSec, outgoingPositionAt(outgoingDeck, startAt));
    incomingDeck.start(startAt + durationSec, offsetSec, rate, onIncomingEnded);
    forceAt(incomingDeck.fader.gain, 1, startAt + durationSec);
    return;
  }

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

  // Filter sweep out. A DJ rides the highpass up as a track leaves, so it
  // thins from underneath rather than simply getting quieter. Starts later
  // than the bass swap so the two read as one gesture rather than two.
  const outgoingFilter = outgoingDeck.highpass.frequency;
  outgoingFilter.cancelScheduledValues(startAt);
  outgoingFilter.setValueAtTime(FILTER_OPEN_HZ, startAt);
  outgoingFilter.setValueAtTime(FILTER_OPEN_HZ, startAt + durationSec * 0.45);
  // Exponential, because pitch is logarithmic — a linear sweep does nothing
  // for the first half and then lurches.
  outgoingFilter.exponentialRampToValueAtTime(FILTER_SWEEP_HZ, endAt);

  // Echo throw on the last beats, so the outgoing track rings away instead of
  // simply stopping. Only when the tempo is known, since the delay has to be
  // in time to sound like anything but a mistake.
  if (plan.kind === 'beatmatched' && outgoingBeatSec > 0) {
    const throwAt = endAt - outgoingBeatSec * ECHO_THROW_BEATS;
    outgoingDeck.echoDelay.delayTime.setValueAtTime(outgoingBeatSec / 2, startAt);

    const send = outgoingDeck.echoSend.gain;
    send.cancelScheduledValues(startAt);
    send.setValueAtTime(0, startAt);
    send.linearRampToValueAtTime(ECHO_SEND, throwAt);
    // Cut the send at the end; the feedback loop carries the tail out on its
    // own, which is what makes it decay rather than stop dead.
    send.setValueAtTime(ECHO_SEND, endAt);
    send.linearRampToValueAtTime(0, endAt + outgoingBeatSec);
  }

  outgoingDeck.stopAt(endAt + 0.05);
}

/** Sets a parameter at an exact future time, clearing anything in its way. */
function forceAt(param: AudioParam, value: number, at: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(value, at);
}

/** Where the outgoing track will be when the transition begins. */
function outgoingPositionAt(deck: Deck, at: number): number {
  return deck.positionAt(at);
}
