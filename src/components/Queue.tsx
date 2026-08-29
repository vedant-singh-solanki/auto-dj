import { bpmLabel, clock } from '../lib/format';
import { useApp } from '../store';
import { matchRate } from '../lib/audio/transition';

/**
 * What is coming, in order.
 *
 * The DJ keeps this topped up with its own picks, and anything the user drops
 * in by hand sits alongside them — marked, so it is obvious which choices are
 * yours and which are the machine's. Removing a track makes the DJ pick again.
 */
export function Queue() {
  const queue = useApp((s) => s.queue);
  const analyses = useApp((s) => s.analyses);
  const nowPlaying = useApp((s) => s.nowPlaying);
  const { removeFromQueue, reshuffleQueue } = useApp.getState();

  /**
   * Described against the track it will actually follow, and worked out at
   * render time rather than when the queue was planned — most of the queue is
   * chosen before those tracks have finished being analysed, so a reason frozen
   * at planning time would still read "not analysed yet" long after it was.
   */
  const describe = (index: number): string => {
    const entry = queue[index];
    if (entry.manual) return 'your pick';

    const analysis = analyses.get(entry.track.id);
    if (!analysis) return 'not analysed yet';

    const previous = index === 0 ? nowPlaying?.analysis : analyses.get(queue[index - 1].track.id);
    if (!previous) return `${Math.round(analysis.bpm)} BPM`;
    return matchRate(previous.bpm, analysis.bpm) !== null ? 'mixes cleanly' : 'tempo change';
  };

  return (
    <section className="edge-lit rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow uppercase text-ink-tertiary">Coming up</span>
        {queue.length > 0 && (
          <button
            type="button"
            onClick={() => reshuffleQueue()}
            className="rounded-md px-2 py-1 text-caption text-ink-tertiary transition-colors hover:text-gold"
            title="Throw away the DJ's suggestions and pick again. Your own choices stay."
          >
            Re-pick
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="mt-3 text-body-sm text-ink-tertiary">
          Nothing queued yet. The DJ fills this in as soon as there is music to choose from, and you can
          add your own from the library.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1">
          {queue.map((entry, index) => {
            const analysis = analyses.get(entry.track.id);
            return (
              <li
                key={entry.track.id}
                className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                <span
                  className={`w-4 shrink-0 text-right font-mono text-mono ${
                    index === 0 ? 'text-gold' : 'text-ink-tertiary'
                  }`}
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm text-ink">{entry.track.title}</p>
                  <p className="truncate text-caption text-ink-tertiary">
                    {describe(index)}
                  </p>
                </div>

                <span className="shrink-0 font-mono text-mono text-ink-tertiary">
                  {bpmLabel(analysis?.bpm)}
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-mono text-ink-tertiary">
                  {clock(analysis?.durationSec ?? entry.track.durationSec ?? 0)}
                </span>

                <button
                  type="button"
                  onClick={() => removeFromQueue(entry.track.id)}
                  aria-label={`Remove ${entry.track.title} from the queue`}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-caption text-ink-tertiary opacity-0 transition hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
