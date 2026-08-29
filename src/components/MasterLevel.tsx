import { useEffect, useRef } from 'react';
import { mixEngine } from '../lib/audio/engine';

/**
 * A single output level bar. What survives of the old spectrum display: the
 * useful part (is it clipping?) without the busy frequency graph, which the
 * platters replaced.
 */
export function MasterLevel() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const analyser = mixEngine().analyser;
    const samples = new Uint8Array(analyser.fftSize);
    let peak = 0;
    let frame = 0;

    const update = (): void => {
      frame = requestAnimationFrame(update);
      analyser.getByteTimeDomainData(samples as Uint8Array<ArrayBuffer>);

      let level = 0;
      for (const sample of samples) {
        const deviation = Math.abs(sample - 128) / 128;
        if (deviation > level) level = deviation;
      }

      // Rises instantly, falls slowly — which is what reads as a meter.
      peak = level > peak ? level : peak * 0.92 + level * 0.08;
      const bar = ref.current;
      if (bar) {
        bar.style.width = `${Math.min(100, peak * 100)}%`;
        bar.style.background = peak > 0.95 ? 'var(--color-warning)' : 'var(--color-primary)';
      }
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="h-0.5 w-full overflow-hidden rounded-xs bg-surface-2">
      <div ref={ref} className="h-full" style={{ width: '0%' }} />
    </div>
  );
}
