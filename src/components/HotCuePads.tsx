import type { LoadedTrack } from '../lib/audio/deck';
import { mixEngine } from '../lib/audio/engine';
import { clock } from '../lib/format';
import { HOT_CUE_LABELS, HOT_CUE_SLOTS } from '../types';
import { useApp } from '../store';

/**
 * Eight jump points per track, laid out as pads the way DJ gear lays them out.
 *
 * Empty pad: saves wherever the deck is now. Filled pad: jumps there. The pad
 * colours are fixed per slot rather than per track, because the whole value of
 * A–H is that the position means the same thing every time.
 */
export function HotCuePads({ loaded }: { loaded: LoadedTrack }) {
  const cues = useApp((s) => s.hotCues.get(loaded.track.id));
  const status = useApp((s) => s.status);
  const { setHotCue, jumpToHotCue } = useApp.getState();

  const press = (slot: number): void => {
    const existing = cues?.[slot];
    if (existing === null || existing === undefined) {
      const engine = mixEngine();
      setHotCue(loaded.track.id, slot, engine.liveDeck.positionAt(engine.now));
    } else {
      jumpToHotCue(slot);
    }
  };

  return (
    <div className="grid grid-cols-4 gap-1">
      {Array.from({ length: HOT_CUE_SLOTS }, (_, slot) => {
        const at = cues?.[slot];
        const filled = at !== null && at !== undefined;
        const color = `var(--color-cue-${HOT_CUE_LABELS[slot].toLowerCase()})`;

        return (
          <div key={slot} className="group relative">
            <button
              type="button"
              onClick={() => press(slot)}
              disabled={status !== 'playing'}
              title={filled ? `Jump to ${clock(at)}` : 'Save this spot'}
              className="well flex w-full flex-col items-start gap-0.5 rounded-sm px-1.5 py-1 text-left transition-colors disabled:opacity-40"
              style={{ borderColor: filled ? color : undefined }}
            >
              <span
                className="text-caption font-semibold leading-none"
                style={{ color: filled ? color : 'var(--color-ink-tertiary)' }}
              >
                {HOT_CUE_LABELS[slot]}
              </span>
              <span className="font-mono text-caption leading-none text-ink-subtle">
                {filled ? clock(at) : '—'}
              </span>
            </button>

            {filled && (
              <button
                type="button"
                onClick={() => setHotCue(loaded.track.id, slot, null)}
                aria-label={`Clear hot cue ${HOT_CUE_LABELS[slot]}`}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-surface-4 text-caption leading-none text-ink-subtle hover:text-ink group-hover:flex"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
