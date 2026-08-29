import { useCallback } from 'react';
import type { DeckId, Track } from '../types';
import { mixEngine } from '../lib/audio/engine';
import { bpmLabel, clock } from '../lib/format';
import { LiveText } from './Live';
import { Platter } from './Platter';
import { HotCuePads } from './HotCuePads';
import { WaveformCanvas } from './WaveformCanvas';
import { useArtwork } from './useArtwork';
import { useApp } from '../store';

/**
 * One deck's channel strip: artwork, title, clock, tempo, jog wheel and hot
 * cues, plus the overview waveform.
 *
 * Decks are fixed to their side of the screen the way they are on real gear —
 * deck A on the left, deck B on the right, always. The MASTER badge moves
 * between them to say which one the audience is hearing.
 */
export function DeckPanel({ deckId, track }: { deckId: DeckId; track: Track | null }) {
  const artwork = useArtwork(track);
  const engine = mixEngine();
  const cues = useApp((s) => s.cues);
  const nowPlaying = useApp((s) => s.nowPlaying);
  const { setCue, clearCue } = useApp.getState();

  const isLive = engine.liveDeckId === deckId;
  const loaded = engine.deck(deckId).loaded;
  const cue = track ? cues.get(track.id) : undefined;

  const clockText = useCallback(() => {
    const deck = engine.deck(deckId);
    if (!deck.loaded) return '—:—';
    return `${clock(deck.positionAt(engine.now))} / ${clock(deck.loaded.analysis.durationSec)}`;
  }, [engine, deckId]);
  const bpmText = useCallback(() => {
    const deck = engine.deck(deckId);
    return deck.loaded ? bpmLabel(deck.loaded.analysis.bpm, deck.playbackRate) : '—';
  }, [engine, deckId]);

  // Declared unconditionally: hooks cannot live inside the conditional JSX
  // below, however tempting it is to put them next to what uses them.
  const progress = useCallback(() => {
    const deck = engine.deck(deckId);
    if (!deck.loaded) return 0;
    return deck.positionAt(engine.now) / Math.max(1, deck.loaded.analysis.durationSec);
  }, [engine, deckId]);

  return (
    <section className={`panel flex flex-col gap-3 rounded-lg p-3 ${isLive ? 'deck-live' : ''}`}>
      <div className="flex items-start gap-3">
        {artwork ? (
          <img src={artwork} alt="" className="h-14 w-14 shrink-0 rounded-sm object-cover" />
        ) : (
          <div className="well h-14 w-14 shrink-0 rounded-sm" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-eyebrow uppercase"
              style={{ color: `var(--color-deck-${deckId})` }}
            >
              Deck {deckId}
            </span>
            {isLive && (
              <span className="rounded-xs bg-warning px-1 text-caption font-semibold leading-tight text-canvas">
                MASTER
              </span>
            )}
          </div>
          <p className="truncate text-body text-ink">{track?.title ?? 'No track loaded'}</p>
          <p className="truncate text-body-sm text-ink-subtle">{track?.artist ?? '—'}</p>
        </div>

        <div className="shrink-0 text-right">
          <LiveText get={bpmText} className="block font-mono text-mono-lg leading-none text-ink" />
          <span className="text-eyebrow uppercase text-ink-tertiary">bpm</span>
          <LiveText get={clockText} className="mt-1 block font-mono text-mono text-ink-subtle" />
        </div>
      </div>

      {/* Overview of the whole track, with the cue marker on it. */}
      <div className="well overflow-hidden rounded-sm">
        <WaveformCanvas
          deckId={deckId}
          height={54}
          windowSec={20}
          cueSec={cue}
          onSetCue={track ? (seconds) => setCue(track.id, seconds) : undefined}
        />
      </div>

      <div className="flex items-start gap-3">
        <Platter deckId={deckId} track={track} size={96} />
        <div className="min-w-0 flex-1">
          {loaded ? (
            <HotCuePads loaded={loaded} />
          ) : (
            <p className="text-caption text-ink-tertiary">Hot cues appear once a track is on this deck.</p>
          )}
          {cue !== undefined && track && (
            <div className="mt-2 flex items-center gap-2 text-caption text-ink-tertiary">
              <span className="font-mono text-primary">mix-in {clock(cue)}</span>
              <button
                type="button"
                onClick={() => clearCue(track.id)}
                className="transition-colors hover:text-ink"
              >
                clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Only meaningful for the deck that is playing. */}
      {isLive && nowPlaying && (
        <div className="h-1 overflow-hidden rounded-xs bg-surface-3">
          <LiveWidth get={progress} />
        </div>
      )}
    </section>
  );
}

/** A progress fill written straight to the DOM, like the other live readouts. */
function LiveWidth({ get }: { get: () => number }) {
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    let frame = 0;
    const update = (): void => {
      frame = requestAnimationFrame(update);
      node.style.width = `${Math.max(0, Math.min(1, get())) * 100}%`;
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [get]);

  return <div ref={ref} className="h-full bg-primary" style={{ width: '0%' }} />;
}
