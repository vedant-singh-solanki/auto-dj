import { type MouseEvent, useEffect, useRef } from 'react';
import type { DeckId } from '../types';
import { PEAKS_PER_SECOND } from '../lib/constants';
import { canvasTheme, fitCanvas } from '../lib/canvasTheme';
import { mixEngine } from '../lib/audio/engine';

/**
 * The scrolling waveform: a window of the track either side of the playhead,
 * with the beat grid drawn over it and a marker where the next blend begins.
 *
 * It reads the deck on every animation frame rather than taking the track as a
 * prop. That matters: a deck is loaded and swapped by the mixer between
 * renders, so anything snapshotted at render time goes stale silently — which
 * is exactly how the incoming waveform ended up permanently blank. Reading
 * live also means the deck colours follow the decks as they alternate.
 */

interface Props {
  /** Which deck to follow. Decks are fixed positions, as on real gear. */
  deckId: DeckId;
  /** Seconds of track shown across the full width. */
  windowSec?: number;
  /** Draw the marker showing where the handover starts. */
  showMixPoint?: boolean;
  /** The manual entry point for whatever is on this deck, if one is set. */
  cueSec?: number;
  /** Clicking the waveform sets the cue point to the time clicked. */
  onSetCue?: (seconds: number) => void;
  height?: number;
  /** Tailwind height classes. Takes precedence, so the height can be responsive —
   *  an inline height would otherwise always win over a breakpoint class. */
  heightClass?: string;
  className?: string;
}

export function WaveformCanvas({
  deckId,
  windowSec = 12,
  showMixPoint = true,
  cueSec,
  onSetCue,
  height = 96,
  heightClass,
  className = '',
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0;

    const draw = (): void => {
      frame = requestAnimationFrame(draw);
      const ctx = fitCanvas(canvas);
      if (!ctx) return;

      const theme = canvasTheme();
      const width = canvas.clientWidth;
      const fullHeight = canvas.clientHeight;
      const mid = fullHeight / 2;
      ctx.clearRect(0, 0, width, fullHeight);

      // Centre line reads as "silence" when a deck has nothing loaded.
      ctx.strokeStyle = theme.hairline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(width, mid + 0.5);
      ctx.stroke();

      const engine = mixEngine();
      const deck = engine.deck(deckId);
      const analysis = deck.loaded?.analysis;
      if (!analysis) return;

      const color = deck.id === 'a' ? theme.deckA : theme.deckB;
      const position = deck.positionAt(engine.now);
      const startSec = position - windowSec / 2;
      const pixelsPerSec = width / windowSec;

      // Beat grid first, so the waveform sits on top of it.
      const beatSec = 60 / analysis.bpm;
      if (beatSec > 0 && beatSec * pixelsPerSec > 6) {
        const firstBeat = Math.floor((startSec - analysis.beatOffset) / beatSec);
        for (let n = firstBeat; ; n += 1) {
          const time = analysis.beatOffset + n * beatSec;
          const x = (time - startSec) * pixelsPerSec;
          if (x > width) break;
          if (x < 0 || time < 0) continue;
          const isBar = ((n % 4) + 4) % 4 === 0;
          ctx.strokeStyle = isBar ? theme.hairlineStrong : theme.hairline;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, isBar ? 0 : mid - 10);
          ctx.lineTo(Math.round(x) + 0.5, isBar ? fullHeight : mid + 10);
          ctx.stroke();
        }
      }

      // Waveform. One vertical bar per pixel column, from the cached peaks.
      ctx.fillStyle = color;
      for (let x = 0; x < width; x += 1) {
        const time = startSec + x / pixelsPerSec;
        if (time < 0 || time > analysis.durationSec) continue;
        const peak = analysis.peaks[Math.floor(time * PEAKS_PER_SECOND)] ?? 0;
        const amplitude = Math.max(1, peak * (mid - 4));
        // Everything behind the playhead is dimmed, so progress is readable.
        ctx.globalAlpha = time <= position ? 1 : 0.42;
        ctx.fillRect(x, mid - amplitude, 1, amplitude * 2);
      }
      ctx.globalAlpha = 1;

      if (showMixPoint) {
        const x = (analysis.mixOutSec - startSec) * pixelsPerSec;
        if (x >= 0 && x <= width) {
          ctx.strokeStyle = theme.warning;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, fullHeight);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // The manual cue point, if the user has set one for this track.
      if (cueSec !== undefined) {
        const x = (cueSec - startSec) * pixelsPerSec;
        if (x >= 0 && x <= width) {
          ctx.strokeStyle = theme.primary;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, 0);
          ctx.lineTo(Math.round(x) + 0.5, fullHeight);
          ctx.stroke();
          // A flag at the top, so it reads as a marker rather than a playhead.
          ctx.fillStyle = theme.primary;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + 8, 4);
          ctx.lineTo(x, 8);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Playhead last: always on top, always in the middle.
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, fullHeight);
      ctx.stroke();
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [deckId, windowSec, showMixPoint, cueSec]);

  /**
   * Maps a click back to a time in the track. The window is centred on the
   * playhead, so the position has to be read at the moment of the click rather
   * than taken from the last render.
   */
  const handleClick = (event: MouseEvent<HTMLCanvasElement>): void => {
    if (!onSetCue) return;
    const canvas = event.currentTarget;
    const engine = mixEngine();
    const deck = engine.deck(deckId);
    const analysis = deck.loaded?.analysis;
    if (!analysis) return;

    const bounds = canvas.getBoundingClientRect();
    const fraction = (event.clientX - bounds.left) / bounds.width;
    const centre = deck.positionAt(engine.now);
    const time = centre + (fraction - 0.5) * windowSec;
    onSetCue(Math.max(0, Math.min(time, analysis.durationSec)));
  };

  return (
    <canvas
      ref={ref}
      onClick={handleClick}
      style={{ height: heightClass ? undefined : height, cursor: onSetCue ? 'crosshair' : undefined }}
      className={`w-full ${heightClass ?? ''} ${className}`}
    />
  );
}
