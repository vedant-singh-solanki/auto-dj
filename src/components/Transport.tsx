import { useCallback, useEffect } from 'react';
import type { Mood } from '../types';
import { liveHandoverAt, useApp } from '../store';
import { mixEngine } from '../lib/audio/engine';
import { countdown } from '../lib/format';
import { LiveText } from './Live';

/**
 * Everything the user needs to run a set: start, pause, skip, and the three
 * mood nudges. There is deliberately nothing else — the whole promise of this
 * app is that it works without knobs.
 */

/** How far one press of the earlier/later buttons moves the handover. */
const NUDGE_SEC = 10;

const MOODS: { value: Mood; label: string; hint: string }[] = [
  { value: 'cool', label: 'Cool down', hint: 'Prefer calmer tracks next' },
  { value: 'hold', label: 'Hold', hint: 'Keep the same energy' },
  { value: 'lift', label: 'Lift', hint: 'Prefer more upbeat tracks next' },
];

/** Solid glyphs rather than text: this is the one control read at a glance. */
function PlayPauseIcon({ playing }: { playing: boolean }) {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" aria-hidden="true" fill="currentColor">
      {playing ? (
        <>
          <rect x="1" y="1" width="3.5" height="11" rx="0.5" />
          <rect x="7.5" y="1" width="3.5" height="11" rx="0.5" />
        </>
      ) : (
        <path d="M2 1.4c0-.5.5-.8 1-.5l7.4 5.1c.4.3.4.9 0 1.2L3 12.3c-.5.3-1 0-1-.5z" />
      )}
    </svg>
  );
}

export function Transport() {
  const status = useApp((s) => s.status);
  const mood = useApp((s) => s.mood);
  const volume = useApp((s) => s.volume);
  const trackCount = useApp((s) => s.tracks.length);
  const { start, togglePause, skip, setMood, setVolume, nudgeHandover } = useApp.getState();

  const playing = status === 'playing';
  const busy = status === 'starting';

  /**
   * Space plays and pauses, the way it does in every music player. Ignored
   * while typing, otherwise searching the library would stop the music.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      // Space also activates a focused button; let that win rather than firing twice.
      if (target?.tagName === 'BUTTON') return;

      event.preventDefault();
      const state = useApp.getState();
      if (state.status === 'idle') void state.start();
      else void state.togglePause();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Read live rather than from state: the countdown ticks every frame, and the
  // nudge has to show up in it the instant it is pressed.
  const untilMix = useCallback((): string => {
    const engine = mixEngine();
    const transition = engine.activeTransition;
    if (transition) return 'mixing now';

    const state = useApp.getState();
    if (state.status !== 'playing' || !state.nowPlaying) return '—';
    const deck = engine.liveDeck;
    const left =
      (liveHandoverAt(state) - deck.positionAt(engine.now)) / Math.max(0.01, deck.playbackRate);
    return left > 0 ? countdown(left) : 'any moment';
  }, []);

  return (
    <section className="panel rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* One control, three states: start, pause, resume. Space works too. */}
        <button
          type="button"
          onClick={() => (status === 'idle' ? void start() : void togglePause())}
          disabled={status === 'idle' && (trackCount === 0 || busy)}
          aria-label={playing ? 'Pause' : status === 'idle' ? 'Start the set' : 'Resume'}
          title="Play / pause (space)"
          className="btn-primary flex items-center gap-2.5 rounded-md px-5 py-2.5 text-button transition-[background-image] disabled:cursor-not-allowed"
        >
          <PlayPauseIcon playing={playing} />
          {busy ? 'Starting…' : playing ? 'Pause' : status === 'idle' ? 'Start the set' : 'Resume'}
        </button>

        <button
          type="button"
          onClick={() => void skip()}
          disabled={!playing}
          className="rounded-md btn-gear px-4 py-2.5 text-button text-ink-muted transition-colors hover:border-accent-line hover:bg-surface-4 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
        >
          Skip — mix the next one in now
        </button>

        <label className="ml-auto flex items-center gap-2 text-caption text-ink-tertiary">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="w-28 accent-[var(--color-primary)]"
            aria-label="Volume"
          />
        </label>
      </div>

      {/* When the handover happens, and how to move it. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-eyebrow uppercase text-ink-tertiary">Next mix</span>
        <LiveText get={untilMix} className="font-mono text-mono text-primary" />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => nudgeHandover(-NUDGE_SEC)}
            disabled={!playing}
            title="Bring the next mix forward by 10 seconds"
            className="rounded-md btn-gear px-2.5 py-1 text-caption text-ink-subtle transition-colors hover:border-accent-line hover:text-ink disabled:opacity-35"
          >
            − 10s
          </button>
          <button
            type="button"
            onClick={() => nudgeHandover(NUDGE_SEC)}
            disabled={!playing}
            title="Hold this track for 10 seconds longer"
            className="rounded-md btn-gear px-2.5 py-1 text-caption text-ink-subtle transition-colors hover:border-accent-line hover:text-ink disabled:opacity-35"
          >
            + 10s
          </button>
        </div>
      </div>

      <div className="mt-4">
        <span className="text-eyebrow uppercase text-ink-tertiary">Where next</span>
        <div className="mt-2 inline-flex rounded-md border border-hairline bg-surface-2 p-1">
          {MOODS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.hint}
              onClick={() => setMood(option.value)}
              className={`rounded-sm px-3 py-1.5 text-button transition-colors ${
                mood === option.value ? 'bg-surface-4 text-primary' : 'text-ink-subtle hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
