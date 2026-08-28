import { useCallback } from 'react';
import type { LoadedTrack } from '../lib/audio/deck';
import { mixEngine } from '../lib/audio/engine';
import { bpmLabel, clock } from '../lib/format';
import { canvasTheme } from '../lib/canvasTheme';
import { LiveBar, LiveText } from './Live';
import { WaveformCanvas } from './WaveformCanvas';
import { useArtwork } from './useArtwork';

/**
 * The track the audience is hearing: cover, title, live clock, live tempo and
 * the scrolling waveform of the deck that is front of house.
 */
export function NowPlaying({ loaded }: { loaded: LoadedTrack }) {
  const artwork = useArtwork(loaded.track);
  const engine = mixEngine();
  const theme = canvasTheme();
  const deckColor = engine.liveDeckId === 'a' ? theme.deckA : theme.deckB;

  const position = useCallback(() => engine.liveDeck.positionAt(engine.now), [engine]);
  const duration = loaded.analysis.durationSec;

  return (
    <section className="rounded-lg border border-hairline bg-surface-1 p-4 edge-lit">
      <div className="flex items-start gap-4">
        {artwork ? (
          <img src={artwork} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-md bg-surface-3" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-xs" style={{ background: deckColor }} />
            <span className="text-eyebrow uppercase text-ink-tertiary">
              Now playing · deck {engine.liveDeckId}
            </span>
          </div>
          <h2 className="truncate text-card-title text-ink">{loaded.track.title}</h2>
          <p className="truncate text-body-sm text-ink-subtle">
            {loaded.track.artist}
            {loaded.track.album ? ` — ${loaded.track.album}` : ''}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono text-mono text-ink">
            <LiveText get={useCallback(() => bpmLabel(loaded.analysis.bpm, engine.liveDeck.playbackRate), [loaded, engine])} />
            <span className="text-ink-tertiary"> BPM</span>
          </div>
          <div className="font-mono text-mono text-ink-subtle">
            <LiveText get={useCallback(() => clock(position()), [position])} />
            <span className="text-ink-tertiary"> / {clock(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <LiveBar get={useCallback(() => position() / Math.max(1, duration), [position, duration])} className="bg-primary" />
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-hairline bg-surface-2">
        <WaveformCanvas analysis={loaded.analysis} positionSec={position} color={deckColor} height={104} />
      </div>
    </section>
  );
}
