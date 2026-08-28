import { useCallback } from 'react';
import type { LoadedTrack } from '../lib/audio/deck';
import { mixEngine } from '../lib/audio/engine';
import { handoverAt } from '../lib/audio/transition';
import { bpmLabel, countdown } from '../lib/format';
import type { UpNext as UpNextInfo } from '../store';
import { LiveText } from './Live';
import { WaveformCanvas } from './WaveformCanvas';
import { useArtwork } from './useArtwork';

/**
 * What is coming, why it was chosen, and how long until the blend starts.
 * Once the blend is under way the incoming waveform scrolls here too, so the
 * two tracks can be seen lining up.
 */
export function NextUp({ info, live }: { info: UpNextInfo | null; live: LoadedTrack | null }) {
  const engine = mixEngine();
  const cue = engine.cueDeck;
  const artwork = useArtwork(info?.track ?? cue.loaded?.track);

  // The mixer loads the cue deck between renders, so its tempo is read every
  // frame rather than snapshotted — otherwise it stays a dash for the whole blend.
  const liveCueBpm = useCallback(() => bpmLabel(mixEngine().cueDeck.loaded?.analysis.bpm), []);

  const untilMix = useCallback((): string => {
    const transition = engine.activeTransition;
    if (transition) {
      const left = transition.plan.startAt + transition.plan.durationSec - engine.now;
      return left > 0 ? `mixing · ${countdown(left)} left` : 'mixing';
    }
    if (!live) return '';
    // Nothing is cued yet, and a countdown beside no track name reads as a
    // contradiction — stay quiet until there is something to count down to.
    if (!info && !engine.cueDeck.loaded) return '';
    const deck = engine.liveDeck;
    const position = deck.positionAt(engine.now);
    const startsAt = handoverAt(live.analysis);
    const seconds = (startsAt - position) / Math.max(0.01, deck.playbackRate);
    return seconds > 0 ? `mixes in ${countdown(seconds)}` : 'mixing shortly';
  }, [engine, live, info]);

  const track = info?.track ?? cue.loaded?.track ?? null;

  return (
    <section className="edge-lit rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow uppercase text-ink-tertiary">Up next</span>
        <LiveText get={untilMix} className="font-mono text-mono text-ink-subtle" />
      </div>

      {track ? (
        <>
          <div className="mt-3 flex items-start gap-3">
            {artwork ? (
              <img src={artwork} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-md bg-surface-3" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-ink">{track.title}</p>
              <p className="truncate text-body-sm text-ink-subtle">{track.artist}</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-mono text-ink-subtle">
                <LiveText get={liveCueBpm} />
                <span className="text-ink-tertiary"> BPM</span>
              </div>
              <p className="text-caption text-ink-tertiary">
                {info && !info.ready ? 'getting it ready…' : (info?.reason ?? 'cued')}
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-md border border-hairline bg-surface-2">
            <WaveformCanvas which="cue" height={64} showMixPoint={false} />
          </div>
        </>
      ) : (
        <p className="mt-3 text-body-sm text-ink-tertiary">
          Choosing the next track once this one is closer to the end.
        </p>
      )}
    </section>
  );
}
