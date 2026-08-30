import { type MouseEvent, useEffect, useRef } from 'react';
import type { Analysis } from '../types';
import { canvasTheme, fitCanvas } from '../lib/canvasTheme';

/**
 * The whole track at a glance, one row high.
 *
 * Drawn once from the cached peaks rather than on an animation frame — there
 * are hundreds of these on screen and none of them move. Tracks that have not
 * been analysed yet render nothing, which is honest: there is no waveform to
 * show until the file has been read.
 *
 * With `onSetCue` it becomes the timeline for a track that is not on a deck
 * yet: click anywhere to say where it should come in. That is the only way to
 * cue something still sitting in the queue.
 */
interface Props {
  analysis?: Analysis;
  width?: number;
  height?: number;
  /** Marker showing where the track will enter. */
  cueSec?: number;
  /** Where the analyser would come in, if no cue is set. */
  hookSec?: number;
  onSetCue?: (seconds: number) => void;
}

export function PreviewWave({ analysis, width = 120, height = 22, cueSec, hookSec, onSetCue }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = fitCanvas(canvas);
    if (!ctx) return;

    const theme = canvasTheme();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!analysis || analysis.peaks.length === 0) return;

    const mid = h / 2;
    ctx.fillStyle = theme.deckA;
    ctx.globalAlpha = 0.75;
    for (let x = 0; x < w; x += 1) {
      // Each column summarises a slice of the track, so nothing is skipped.
      const from = Math.floor((x / w) * analysis.peaks.length);
      const to = Math.max(from + 1, Math.floor(((x + 1) / w) * analysis.peaks.length));
      let peak = 0;
      for (let i = from; i < to && i < analysis.peaks.length; i += 1) {
        if (analysis.peaks[i] > peak) peak = analysis.peaks[i];
      }
      const amplitude = Math.max(0.5, peak * (mid - 1));
      ctx.fillRect(x, mid - amplitude, 1, amplitude * 2);
    }
    ctx.globalAlpha = 1;

    const markAt = (seconds: number, color: string, dashed: boolean): void => {
      const x = (seconds / Math.max(1, analysis.durationSec)) * w;
      if (x < 0 || x > w) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = dashed ? 1 : 2;
      if (dashed) ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // The analyser's own entry point, faint, so a cue can be judged against it.
    if (hookSec !== undefined && cueSec === undefined) markAt(hookSec, theme.inkSubtle, true);
    if (cueSec !== undefined) markAt(cueSec, theme.primary, false);
  }, [analysis, width, height, cueSec, hookSec]);

  const handleClick = (event: MouseEvent<HTMLCanvasElement>): void => {
    if (!onSetCue || !analysis) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - bounds.left) / bounds.width;
    onSetCue(Math.max(0, Math.min(fraction * analysis.durationSec, analysis.durationSec)));
  };

  return (
    <canvas
      ref={ref}
      onClick={handleClick}
      title={onSetCue && analysis ? 'Click to set where this track comes in' : undefined}
      style={{ width, height, cursor: onSetCue && analysis ? 'crosshair' : undefined }}
      className="block"
    />
  );
}
