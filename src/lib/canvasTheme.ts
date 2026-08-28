/**
 * Canvas cannot read CSS custom properties, so the tokens are resolved once and
 * cached. Everything drawn on a canvas still comes from `theme.css` — see the
 * "Canvas rendering sits outside the token system" note in DESIGN.md.
 */
export interface CanvasTheme {
  deckA: string;
  deckB: string;
  hairline: string;
  hairlineStrong: string;
  inkSubtle: string;
  ink: string;
  surface2: string;
  primary: string;
  warning: string;
}

let cached: CanvasTheme | null = null;

export function canvasTheme(): CanvasTheme {
  if (cached) return cached;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;

  cached = {
    deckA: token('--color-deck-a', '#4cc2ff'),
    deckB: token('--color-deck-b', '#f0883e'),
    hairline: token('--color-hairline', '#23252a'),
    hairlineStrong: token('--color-hairline-strong', '#2c2e33'),
    inkSubtle: token('--color-ink-subtle', '#8a8f98'),
    ink: token('--color-ink', '#f7f8f8'),
    surface2: token('--color-surface-2', '#0f1011'),
    primary: token('--color-primary', '#5e6ad2'),
    warning: token('--color-warning', '#d9a441'),
  };
  return cached;
}

/** Sizes a canvas for the display's pixel density and returns its 2D context. */
export function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
