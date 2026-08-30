import { useEffect } from 'react';
import { useApp } from '../store';

/** Long enough to read and reach, short enough not to sit in the way. */
const DISMISS_MS = 7000;

/**
 * Confirmation that something happened, and a way back when it threw something
 * away.
 *
 * Every destructive action here is one click and no dialog. That is the right
 * trade — a confirmation prompt on "remove from queue" would be miserable — but
 * it is only reasonable because of this.
 */
export function Notice() {
  const notice = useApp((s) => s.notice);
  const { dismissNotice } = useApp.getState();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismissNotice, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, dismissNotice]);

  if (!notice) return null;

  return (
    <div
      // Announced to screen readers without stealing focus from whatever the
      // user is doing.
      role="status"
      aria-live="polite"
      className="animate-in panel pointer-events-auto fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg px-3 py-2 shadow-lg"
    >
      <span className="text-body-sm text-ink-muted">{notice.message}</span>
      {notice.undo && (
        <button
          type="button"
          onClick={() => {
            notice.undo?.();
            dismissNotice();
          }}
          className="btn-primary rounded-sm px-2.5 py-1 text-caption"
        >
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={dismissNotice}
        aria-label="Dismiss"
        className="rounded-sm px-1 text-caption text-ink-tertiary hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
