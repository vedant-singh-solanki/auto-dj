import { useEffect, useRef } from 'react';
import { mixEngine } from '../lib/audio/engine';
import { canvasTheme, fitCanvas } from '../lib/canvasTheme';

/**
 * Where the blend has got to. Sits between the two waveforms and slides from
 * the outgoing deck's colour to the incoming one over the length of the mix.
 * Idle, it is just a hairline.
 */
export function TransitionMeter({ height = 26 }: { height?: number }) {
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

      ctx.strokeStyle = theme.hairline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(width, mid + 0.5);
      ctx.stroke();

      const engine = mixEngine();
      const transition = engine.activeTransition;
      if (!transition) return;

      const { startAt, durationSec } = transition.plan;
      const progress = Math.max(0, Math.min(1, (engine.now - startAt) / durationSec));
      const fromColor = transition.from === 'a' ? theme.deckA : theme.deckB;
      const toColor = transition.to === 'a' ? theme.deckA : theme.deckB;

      ctx.strokeStyle = fromColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width * progress, mid);
      ctx.stroke();

      ctx.strokeStyle = toColor;
      ctx.beginPath();
      ctx.moveTo(width * progress, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();

      ctx.fillStyle = toColor;
      ctx.beginPath();
      ctx.arc(width * progress, mid, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} style={{ height }} className="w-full" />;
}
