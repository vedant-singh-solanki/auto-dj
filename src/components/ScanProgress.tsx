import type { ImportProgress } from '../lib/library/importer';

/** Progress while the library is being read. Two phases, one line each. */
export function ScanProgress({ progress }: { progress: ImportProgress }) {
  const scanning = progress.phase === 'scanning';
  const fraction = progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <div className="mx-auto max-w-xl rounded-lg border border-hairline bg-surface-1 p-6 text-center">
      <p className="text-body text-ink">
        {scanning ? 'Looking through your music folder…' : 'Reading track details…'}
      </p>
      <p className="mt-1 truncate text-body-sm text-ink-subtle">
        {scanning
          ? `${progress.done} tracks found${progress.label ? ` · ${progress.label}` : ''}`
          : `${progress.done} of ${progress.total}`}
      </p>

      <div className="mt-4 h-1 overflow-hidden rounded-xs bg-surface-3">
        <div
          className={`h-full bg-primary transition-[width] duration-200 ${scanning ? 'shimmer' : ''}`}
          style={{ width: scanning ? '100%' : `${fraction * 100}%` }}
        />
      </div>

      <p className="mt-3 text-caption text-ink-tertiary">
        Tempo analysis happens quietly in the background afterwards — you do not have to wait for it.
      </p>
    </div>
  );
}
