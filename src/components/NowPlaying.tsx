import { useCallback } from 'react';
import type { LoadedTrack } from '../lib/audio/deck';
import { mixEngine } from '../lib/audio/engine';
import { bpmLabel, clock } from '../lib/format';
import { canvasTheme } from '../lib/canvasTheme';
import { LiveBar, LiveText } from './Live';
import { WaveformCanvas } from './WaveformCanvas';
import { useArtwork } from './useArtwork';

/**
 * The deck the audience is hearing, and the centrepiece of the app: cover,
 * title, live tempo, live clock, and the scrolling waveform.
 *
 * This is the one panel that carries the gold treatment — the lit gold edge and
 * the glow — because it is the thing that is actually live. See DESIGN.md:
 * gold marks what is happening, it does not decorate.
 */
export function NowPlaying({ loaded }: { loaded: LoadedTrack }) {
  const artwork = useArtwork(loaded.track);
  const engine = mixEngine();
  const theme = canvasTheme();
  const deckColor = engine.liveDeckId === 'a' ? theme.deckA : theme.deckB;

  const position = useCallback(() => engine.liveDeck.positionAt(engine.now), [engine]);
  const duration = loaded.analysis.durationSec;

  return (
    <section className="edge-lit edge-lit-gold deck-glow rounded-xl border border-hairline-strong bg-surface-1 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-xs" style={{ background: deckColor }} />
          <span className="text-eyebrow uppercase text-gold">Now playing</span>
          <span className="text-eyebrow uppercase text-ink-tertiary">· deck {engine.liveDeckId}</span>
        </div>
        <div className="font-mono text-mono text-ink-tertiary">
          <LiveText get={useCallback(() => clock(position()), [position])} className="text-ink-muted" />
          {` / ${clock(duration)}`}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-4">
        {artwork ? (
          <img src={artwork} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="well h-20 w-20 shrink-0 rounded-lg" />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-card-title text-ink">{loaded.track.title}</h2>
          <p className="truncate text-body-sm text-ink-subtle">
            {loaded.track.artist}
            {loaded.track.album ? ` — ${loaded.track.album}` : ''}
          </p>

          <div className="mt-3 flex items-baseline gap-1.5">
            <LiveText
              get={useCallback(
                () => bpmLabel(loaded.analysis.bpm, engine.liveDeck.playbackRate),
                [loaded, engine],
              )}
              className="font-mono text-mono-lg text-gold"
            />
            <span className="text-eyebrow uppercase text-ink-tertiary">bpm</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <LiveBar
          get={useCallback(() => position() / Math.max(1, duration), [position, duration])}
          className="bg-gold"
        />
      </div>

      <div className="well mt-4 overflow-hidden rounded-lg">
        <WaveformCanvas which="live" height={112} />
      </div>
    </section>
  );
}
