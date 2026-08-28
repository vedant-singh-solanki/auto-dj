import { useEffect, useRef } from 'react';
import type { Analysis } from '../types';
import { PEAKS_PER_SECOND } from '../lib/constants';
import { canvasTheme, fitCanvas } from '../lib/canvasTheme';

/**
 * The scrolling waveform: a window of the track either side of the playhead,
 * with the beat grid drawn over it and a marker where the next blend begins.
 *
 * Redrawn on an animation frame from a position getter rather than from props,
 * so the playhead moves smoothly without re-rendering React 60 times a second.
 */

interface Props {
  analysis: Analysis | null;
  /** Reads the current position in track seconds. Called once per frame. */
  positionSec: () => number;
  color: string;
  /** Seconds of track shown across the full width. */
  windowSec?: number;
  /** Draw the marker showing where the handover starts. */
  showMixPoint?: boolean;
  height?: number;
  className?: string;
}

export function WaveformCanvas({
  analysis,
  positionSec,
  color,
  windowSec = 12,
  showMixPoint = true,
  height = 96,
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
      const mid = canvas.clientHeight / 2;
      ctx.clearRect(0, 0, width, canvas.clientHeight);

      // Centre line reads as "silence" when a track has not started yet.
      ctx.strokeStyle = theme.hairline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(width, mid + 0.5);
      ctx.stroke();

      if (!analysis) return;

      const position = positionSec();
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
          ctx.lineTo(Math.round(x) + 0.5, isBar ? canvas.clientHeight : mid + 10);
          ctx.stroke();
        }
      }

      // Waveform. One vertical bar per pixel column, from the cached peaks.
      ctx.fillStyle = color;
      for (let x = 0; x < width; x += 1) {
        const time = startSec + x / pixelsPerSec;
        if (time < 0 || time > analysis.durationSec) continue;
        const index = Math.floor(time * PEAKS_PER_SECOND);
        const peak = analysis.peaks[index] ?? 0;
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
          ctx.lineTo(Math.round(x) + 0.5, canvas.clientHeight);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Playhead last: always on top, always in the middle.
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, canvas.clientHeight);
      ctx.stroke();
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analysis, positionSec, color, windowSec, showMixPoint]);

  return <canvas ref={ref} style={{ height }} className={`w-full ${className}`} />;
}
