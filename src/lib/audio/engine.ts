import type { DeckId } from '../../types';
import { audioContext, resumeAudio } from './context';
import { Deck, forceParam, type LoadedTrack } from './deck';
import { type MixPlan, planMix, scheduleMix } from './transition';

/**
 * The mixer. Owns two decks and the master chain:
 *
 *   deck A ─┐
 *           ├─> master gain -> limiter -> analyser -> speakers
 *   deck B ─┘
 *
 * The limiter is there because two tracks overlap during every blend, which is
 * more signal than either was mastered for; without it, loud mixes clip.
 */

/** Fade-in for the very first track of a session. */
const FIRST_FADE_SEC = 1.5;

/**
 * How long the newly-live deck takes to slide back to its own tempo after a
 * beat-matched blend. Long enough that the pitch change is not noticeable, and
 * it is what stops a set being stuck at the tempo of its first track forever.
 */
const RATE_GLIDE_SEC = 20;

export interface EngineTransition {
  plan: MixPlan;
  from: DeckId;
  to: DeckId;
}

export class MixEngine {
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly analyser: AnalyserNode;
  private readonly decks: Record<DeckId, Deck>;

  /** The deck the audience is hearing. During a blend, the one going out. */
  private liveId: DeckId = 'a';
  private transition: EngineTransition | null = null;

  constructor() {
    const ctx = audioContext();

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.master.connect(this.limiter).connect(this.analyser).connect(ctx.destination);

    this.decks = {
      a: new Deck('a', this.master),
      b: new Deck('b', this.master),
    };
  }

  deck(id: DeckId): Deck {
    return this.decks[id];
  }

  get liveDeck(): Deck {
    return this.decks[this.liveId];
  }

  /** The deck a track is loaded into next — always the one not front of house. */
  get cueDeck(): Deck {
    return this.decks[this.liveId === 'a' ? 'b' : 'a'];
  }

  get liveDeckId(): DeckId {
    return this.liveId;
  }

  get activeTransition(): EngineTransition | null {
    return this.transition;
  }

  get now(): number {
    return audioContext().currentTime;
  }

  setVolume(value: number): void {
    const ctx = audioContext();
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), ctx.currentTime, 0.02);
  }

  /**
   * Starts the session. No blend to make — just come up from silence.
   *
   * The opening track plays from 0:00. Every later track comes in at its hook,
   * because it has to land over something already playing, but the first record
   * of a set has nothing to mix against and is allowed to simply begin. Pass
   * `offsetSec` to override that — a cue point the user set by hand still wins.
   */
  async startFirst(loaded: LoadedTrack, offsetSec = 0, onEnded?: () => void): Promise<void> {
    await resumeAudio();
    const ctx = audioContext();
    const deck = this.liveDeck;

    deck.load(loaded);
    const startAt = ctx.currentTime + 0.08;
    const offset = Math.max(0, Math.min(offsetSec, loaded.analysis.durationSec * 0.9));
    deck.start(startAt, offset, 1, onEnded);

    deck.fader.gain.cancelScheduledValues(startAt);
    deck.fader.gain.setValueAtTime(0, startAt);
    deck.fader.gain.linearRampToValueAtTime(1, startAt + FIRST_FADE_SEC);

    forceParam(this.cueDeck.fader.gain, 0);
  }

  /**
   * Plans and schedules the handover into `loaded`. Returns the plan so the UI
   * can show a countdown and say whether it managed to beat-match.
   */
  mixInto(
    loaded: LoadedTrack,
    options: { immediate?: boolean; handoverAtSec?: number; incomingCue?: number } = {},
  ): EngineTransition | null {
    const outgoing = this.liveDeck;
    if (!outgoing.loaded) return null;

    // A beat-match assumes the outgoing deck holds a steady tempo, so any glide
    // still running from the last blend has to stop before the maths is done.
    outgoing.holdRate();

    const incoming = this.cueDeck;
    incoming.load(loaded);
    forceParam(incoming.fader.gain, 0);

    const plan = planMix({
      outgoing: outgoing.loaded.analysis,
      outgoingRate: outgoing.playbackRate,
      outgoingPositionSec: outgoing.positionAt(this.now),
      incoming: loaded.analysis,
      contextNow: this.now,
      immediate: options.immediate,
      handoverAtSec: options.handoverAtSec,
      incomingCue: options.incomingCue,
    });

    scheduleMix(outgoing, incoming, plan);
    this.transition = { plan, from: this.liveId, to: incoming.id };
    return this.transition;
  }

  /**
   * Bookkeeping after a blend finishes. Driven from the app's ticker rather
   * than a timer, so pausing (which suspends the audio clock) cannot make the
   * decks swap while nothing is playing.
   */
  settle(): EngineTransition | null {
    const transition = this.transition;
    if (!transition) return null;
    if (this.now < transition.plan.startAt + transition.plan.durationSec) return null;

    this.liveId = transition.to;
    // The blend is over, so let the new track drift back to its own speed.
    this.decks[transition.to].glideToRate(1, RATE_GLIDE_SEC);

    const retired = this.decks[transition.from];
    forceParam(retired.fader.gain, 0);
    retired.resetEq();
    retired.unload();

    this.transition = null;
    return transition;
  }

  stopEverything(): void {
    this.transition = null;
    for (const id of ['a', 'b'] as DeckId[]) {
      const deck = this.decks[id];
      forceParam(deck.fader.gain, 0);
      deck.resetEq();
      deck.unload();
    }
  }
}

let engine: MixEngine | null = null;

export function mixEngine(): MixEngine {
  engine ??= new MixEngine();
  return engine;
}
