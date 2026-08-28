import { useEffect, useRef } from 'react';
import type { DeckId, Track } from '../types';
import { mixEngine } from '../lib/audio/engine';
import { bpmLabel } from '../lib/format';
import { useArtwork } from './useArtwork';

/**
 * A turntable platter — the jog wheels of a real DJ setup rather than a
 * spectrum analyser.
 *
 * The rotation is not decoration: it is driven by the deck's actual playback
 * position at a real 33⅓ RPM, so a deck pitched up to match tempo visibly spins
 * faster, and pausing (which suspends the audio clock) stops the record dead.
 * That makes it a readout, not an animation.
 *
 * Like the waveform, it reads the engine every frame rather than taking the
 * deck as a prop — decks are loaded and swapped between renders.
 */

/** Real vinyl speed. Slow enough to read as a record, not as a fan. */
const RPM = 33 + 1 / 3;
/** Degrees per second at 33⅓ RPM. */
const DEGREES_PER_SEC = RPM * 6;

interface Props {
  /**
   * Platters are pinned to decks the way they are in real DJ software: A on the
   * left, B on the right. It is the highlight that moves between them, not the
   * decks themselves.
   */
  deckId: DeckId;
  /** Passed from the store so artwork re-renders; rotation is read live. */
  track: Track | null;
  size?: number;
}

export function Platter({ deckId, track, size = 132 }: Props) {
  const artwork = useArtwork(track);
  const spinRef = useRef<HTMLDivElement>(null);
  const rimRef = useRef<HTMLDivElement>(null);
  const bpmRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    let lastBpm = '';
    let lastLive: boolean | null = null;

    const update = (): void => {
      frame = requestAnimationFrame(update);
      const engine = mixEngine();
      const deck = engine.deck(deckId);

      const angle = (deck.positionAt(engine.now) * DEGREES_PER_SEC) % 360;
      if (spinRef.current) spinRef.current.style.transform = `rotate(${angle}deg)`;

      // The highlight follows whichever deck is front of house.
      const isLive = engine.liveDeckId === deckId;
      if (isLive !== lastLive) {
        lastLive = isLive;
        if (rimRef.current) {
          rimRef.current.style.opacity = isLive ? '1' : '0.4';
          rimRef.current.style.boxShadow = isLive
            ? 'inset 0 0 24px rgba(0,0,0,0.9), 0 0 26px -10px var(--color-gold-glow)'
            : 'inset 0 0 24px rgba(0,0,0,0.9)';
        }
      }

      const bpm = deck.loaded ? bpmLabel(deck.loaded.analysis.bpm, deck.playbackRate) : '—';
      if (bpm !== lastBpm && bpmRef.current) {
        bpmRef.current.textContent = bpm;
        lastBpm = bpm;
      }
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [deckId]);

  const labelSize = Math.round(size * 0.42);
  const markerHeight = size * 0.5 - labelSize / 2 - 4;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={rimRef}
        className="relative rounded-full border-2 bg-surface-2"
        style={{
          width: size,
          height: size,
          borderColor: `var(--color-deck-${deckId})`,
          // Grooves. Fine concentric rings are what make it read as vinyl
          // rather than as a dark circle.
          backgroundImage:
            'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.045) 0 1px, transparent 1px 4px), radial-gradient(circle at 38% 32%, #1c1a17 0%, #0b0a09 62%, #000000 100%)',
          boxShadow: 'inset 0 0 24px rgba(0,0,0,0.9)',
        }}
      >
        <div ref={spinRef} className="absolute inset-0" style={{ willChange: 'transform' }}>
          {/* The label, and the marker that makes the rotation visible at all. */}
          <div
            className="absolute overflow-hidden rounded-full"
            style={{
              width: labelSize,
              height: labelSize,
              left: `calc(50% - ${labelSize / 2}px)`,
              top: `calc(50% - ${labelSize / 2}px)`,
              backgroundImage: artwork
                ? undefined
                : 'linear-gradient(145deg, var(--color-gold-bright), var(--color-gold) 55%, var(--color-gold-deep))',
            }}
          >
            {artwork && <img src={artwork} alt="" className="h-full w-full object-cover" />}
          </div>

          <div
            className="absolute rounded-full bg-ink"
            style={{ width: 2, height: markerHeight, left: 'calc(50% - 1px)', top: 4, opacity: 0.5 }}
          />

          <div
            className="absolute rounded-full bg-canvas"
            style={{ width: 6, height: 6, left: 'calc(50% - 3px)', top: 'calc(50% - 3px)' }}
          />
        </div>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-eyebrow uppercase text-ink-tertiary">Deck {deckId}</span>
        <span ref={bpmRef} className="font-mono text-mono text-ink-muted">
          —
        </span>
      </div>
    </div>
  );
}
