import type { Mood } from '../types';
import { useApp } from '../store';

/**
 * Everything the user needs to run a set: start, pause, skip, and the three
 * mood nudges. There is deliberately nothing else — the whole promise of this
 * app is that it works without knobs.
 */

const MOODS: { value: Mood; label: string; hint: string }[] = [
  { value: 'cool', label: 'Cool down', hint: 'Prefer calmer tracks next' },
  { value: 'hold', label: 'Hold', hint: 'Keep the same energy' },
  { value: 'lift', label: 'Lift', hint: 'Prefer more upbeat tracks next' },
];

export function Transport() {
  const status = useApp((s) => s.status);
  const mood = useApp((s) => s.mood);
  const volume = useApp((s) => s.volume);
  const trackCount = useApp((s) => s.tracks.length);
  const { start, togglePause, skip, setMood, setVolume } = useApp.getState();

  const playing = status === 'playing';
  const busy = status === 'starting';

  return (
    <section className="rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'idle' ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={trackCount === 0 || busy}
            className="rounded-md bg-primary px-4 py-2 text-button text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Starting…' : 'Start the set'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void togglePause()}
            className="rounded-md bg-primary px-4 py-2 text-button text-on-primary transition-colors hover:bg-primary-hover"
          >
            {playing ? 'Pause' : 'Resume'}
          </button>
        )}

        <button
          type="button"
          onClick={() => void skip()}
          disabled={!playing}
          className="rounded-md border border-hairline-strong bg-surface-2 px-4 py-2 text-button text-ink transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
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

      <div className="mt-4">
        <span className="text-eyebrow uppercase text-ink-tertiary">Where next</span>
        <div className="mt-2 inline-flex rounded-md border border-hairline bg-surface-2 p-0.5">
          {MOODS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.hint}
              onClick={() => setMood(option.value)}
              className={`rounded-sm px-3 py-1.5 text-button transition-colors ${
                mood === option.value ? 'bg-surface-4 text-ink' : 'text-ink-subtle hover:text-ink'
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
