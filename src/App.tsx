import { useEffect, useRef, useState } from 'react';
import { useApp } from './store';
import { FolderPicker } from './components/FolderPicker';
import { ScanProgress } from './components/ScanProgress';
import { PerformanceView } from './components/PerformanceView';
import { ExportView } from './components/ExportView';
import { Help } from './components/Help';
import { Notice } from './components/Notice';

/** How often the control loop runs. Audio timing does not depend on this. */
const TICK_MS = 200;

/** `?demo` in development loads synthetic tracks, so the mixer can be exercised
 *  without going through a native folder dialog. Never present in a build. */
const DEMO_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

async function loadDemoSet(): Promise<void> {
  const { buildDemoFiles } = await import('./dev/demoSet');
  await useApp.getState().addTrackFiles(buildDemoFiles());
}

export function App() {
  const init = useApp((s) => s.init);
  const tick = useApp((s) => s.tick);
  const importing = useApp((s) => s.importing);
  const folderStatus = useApp((s) => s.folderStatus);
  const folderName = useApp((s) => s.folderName);
  const tracks = useApp((s) => s.tracks);
  const error = useApp((s) => s.error);
  const mode = useApp((s) => s.mode);
  const supportsPicker = useApp((s) => s.supportsPicker);
  const addFilesRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [tick]);

  const ready = folderStatus === 'ready' && tracks.length > 0;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-surface-1 px-3 py-2">
        <div className="h-4 w-4 shrink-0 rounded-xs bg-primary" />
        <span className="shrink-0 whitespace-nowrap text-body font-semibold text-ink">Auto DJ</span>

        {/* The two environments. Kept in the title bar because switching between
            them is a change of what you are doing, not a setting. */}
        {ready && (
          <div className="flex shrink-0 rounded-sm border border-hairline-strong bg-surface-2 p-0.5">
            {(['performance', 'export'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => useApp.getState().setMode(option)}
                aria-pressed={mode === option}
                className={`rounded-xs px-2.5 py-1 text-caption capitalize transition-colors ${
                  mode === option ? 'bg-primary text-on-primary' : 'text-ink-subtle hover:text-ink'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {folderName && (
          <span className="hidden truncate text-caption text-ink-tertiary sm:inline">
            {folderName} · {tracks.length} tracks
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="btn-gear rounded-sm px-2 py-1 text-caption"
          >
            Help
          </button>
          {DEMO_MODE && (
            <button type="button" onClick={() => void loadDemoSet()} className="btn-gear rounded-sm px-2 py-1 text-caption">
              Load demo set
            </button>
          )}
          {ready && (
            <>
              <button
                type="button"
                onClick={() => addFilesRef.current?.click()}
                className="btn-gear rounded-sm px-2 py-1 text-caption"
              >
                Add files
              </button>
              {supportsPicker && (
                <button
                  type="button"
                  onClick={() => void useApp.getState().addFolder()}
                  className="btn-gear rounded-sm px-2 py-1 text-caption"
                >
                  Add folder
                </button>
              )}
              <button
                type="button"
                onClick={() => void useApp.getState().connectFolder()}
                className="btn-gear rounded-sm px-2 py-1 text-caption"
              >
                Change folder
              </button>
            </>
          )}
        </div>

        <input
          ref={addFilesRef}
          type="file"
          multiple
          accept="audio/*,video/mp4,.mp3,.mp4,.m4a,.aac,.wav,.flac,.ogg,.opus"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void useApp.getState().addTrackFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </header>

      {error && (
        <div className="flex shrink-0 items-start gap-3 border-b border-hairline bg-surface-2 px-3 py-2">
          <p className="flex-1 text-body-sm text-ink-muted">{error}</p>
          <button
            type="button"
            onClick={() => useApp.getState().dismissError()}
            className="rounded-sm px-2 py-0.5 text-caption text-ink-subtle hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {importing ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-4 pt-12">
          <ScanProgress progress={importing} />
        </main>
      ) : !ready ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-4 pt-12">
          <FolderPicker />
        </main>
      ) : mode === 'export' ? (
        <ExportView />
      ) : (
        <PerformanceView />
      )}

      <Notice />
      {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
