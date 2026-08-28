import { useEffect, useRef } from 'react';

/**
 * Text that changes every frame — clocks, countdowns, live BPM — written
 * straight into the DOM node rather than through React state. A running clock
 * in state would re-render the whole panel sixty times a second.
 */
export function LiveText({ get, className = '' }: { get: () => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    // null, not '': the effect restarts whenever the getter changes identity,
    // and a seed of '' would compare equal to an empty new value while the DOM
    // node still holds the previous text — which would never then be cleared.
    let last: string | null = null;
    const update = (): void => {
      frame = requestAnimationFrame(update);
      const next = get();
      if (next !== last && ref.current) {
        ref.current.textContent = next;
        last = next;
      }
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [get]);

  return <span ref={ref} className={className} />;
}

/** Same idea for a progress bar: writes `width` directly. */
export function LiveBar({ get, className = '' }: { get: () => number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = requestAnimationFrame(update);
      if (ref.current) ref.current.style.width = `${Math.max(0, Math.min(1, get())) * 100}%`;
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [get]);

  return (
    <div className="h-1 w-full overflow-hidden rounded-xs bg-surface-2">
      <div ref={ref} className={`h-full ${className}`} style={{ width: '0%' }} />
    </div>
  );
}
