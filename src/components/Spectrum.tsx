import { useEffect, useRef } from 'react';
import { mixEngine } from '../lib/audio/engine';
import { canvasTheme, fitCanvas } from '../lib/canvasTheme';

/**
 * Master output spectrum, with a peak-hold level bar underneath. Reads the
 * engine's analyser node directly on an animation frame — no React state is
 * involved, and nothing here can affect what is heard.
 */

const BARS = 48;

export function Spectrum({ height = 56 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const analyser = mixEngine().analyser;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const smoothed = new Float32Array(BARS);
    let peakHold = 0;
    let frame = 0;

    const draw = (): void => {
      frame = requestAnimationFrame(draw);
      const ctx = fitCanvas(canvas);
      if (!ctx) return;

      const theme = canvasTheme();
      const width = canvas.clientWidth;
      const full = canvas.clientHeight;
      const meterHeight = 3;
      const graphHeight = full - meterHeight - 4;
      ctx.clearRect(0, 0, width, full);

      analyser.getByteFrequencyData(bins as Uint8Array<ArrayBuffer>);

      // Bins are linear in frequency but hearing is not, so bars are spaced
      // logarithmically — otherwise everything interesting sits in bar one.
      const gap = 2;
      const barWidth = Math.max(1, (width - gap * (BARS - 1)) / BARS);
      let level = 0;

      for (let i = 0; i < BARS; i += 1) {
        const from = Math.floor(bins.length ** (i / BARS)) - 1;
        const to = Math.max(from + 1, Math.floor(bins.length ** ((i + 1) / BARS)) - 1);
        let sum = 0;
        for (let b = from; b < to && b < bins.length; b += 1) sum += bins[b];
        const value = sum / Math.max(1, to - from) / 255;

        // Falling bars decay slowly; rising ones jump, which is what reads as
        // "responsive" on a meter.
        smoothed[i] = value > smoothed[i] ? value : smoothed[i] * 0.86 + value * 0.14;
        level = Math.max(level, smoothed[i]);

        const barHeight = Math.max(1, smoothed[i] * graphHeight);
        ctx.fillStyle = theme.hairlineStrong;
        ctx.fillRect(i * (barWidth + gap), graphHeight - barHeight, barWidth, barHeight);
      }

      peakHold = Math.max(level, peakHold * 0.97);
      ctx.fillStyle = theme.hairline;
      ctx.fillRect(0, full - meterHeight, width, meterHeight);
      ctx.fillStyle = peakHold > 0.92 ? theme.warning : theme.primary;
      ctx.fillRect(0, full - meterHeight, width * Math.min(1, peakHold), meterHeight);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} style={{ height }} className="w-full" />;
}
