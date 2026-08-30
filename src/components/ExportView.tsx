import { useApp } from '../store';
import { Crates } from './Crates';
import { TrackTable } from './TrackTable';
import { TrackPrep } from './TrackPrep';
import { BackupPanel } from './BackupPanel';

/**
 * Export mode: the desk rather than the booth.
 *
 * Everything here is preparation — analysing, cueing, rating, organising — and
 * none of it makes a sound. The whole point of separating it from Performance
 * is that this is work you do beforehand, with time to look at a waveform and
 * think, rather than something to be doing one-handed while a set runs.
 */
export function ExportView() {
  const tracks = useApp((s) => s.tracks);
  const analyses = useApp((s) => s.analyses);
  const analysed = tracks.reduce((count, track) => count + (analyses.has(track.id) ? 1 : 0), 0);
  const remaining = tracks.length - analysed;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="panel flex shrink-0 flex-wrap items-center gap-3 rounded-lg px-3 py-2">
        <span className="text-eyebrow uppercase text-ink-subtle">Library preparation</span>
        <span className="font-mono text-caption text-ink-tertiary">
          {analysed}/{tracks.length} analysed
        </span>
        {remaining > 0 && (
          <span className="text-caption text-ink-tertiary">
            {remaining} still to go — it works through them in the background, and you can carry on.
          </span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[190px_minmax(0,1fr)_minmax(0,400px)]">
        <div className="hidden min-h-0 lg:block">
          <Crates />
        </div>
        <div className="flex min-h-0 flex-col">
          <TrackTable />
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <TrackPrep />
          <BackupPanel />
        </div>
      </div>
    </div>
  );
}
