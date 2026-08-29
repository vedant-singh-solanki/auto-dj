import { useEffect, useRef } from 'react';
import type { Analysis } from '../types';
import { canvasTheme, fitCanvas } from '../lib/canvasTheme';

/**
 * The whole track at a glance, one row high.
 *
 * Drawn once from the cached peaks rather than on an animation frame — there
 * are hundreds of these on screen and none of them move. Tracks that have not
 * been analysed yet simply render nothing, which is honest: there is no
 * waveform to show until the file has been read.
 */
export function PreviewWave({ analysis, width = 120, height = 22 }: { analysis?: Analysis; width?: number; height?: number }) {
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
  }, [analysis, width, height]);

  return <canvas ref={ref} style={{ width, height }} className="block" />;
}
