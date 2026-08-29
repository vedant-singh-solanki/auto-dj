import { useEffect, useRef } from 'react';
import type { DeckId, Track } from './types';
import { mixEngine } from './lib/audio/engine';
import { useApp } from './store';
import { FolderPicker } from './components/FolderPicker';
import { ScanProgress } from './components/ScanProgress';
import { TrackTable } from './components/TrackTable';
import { DeckPanel } from './components/DeckPanel';
import { Transport } from './components/Transport';
import { MasterLevel } from './components/MasterLevel';
import { TransitionMeter } from './components/TransitionMeter';
import { Queue } from './components/Queue';
import { Crates } from './components/Crates';
import { WaveformCanvas } from './components/WaveformCanvas';

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
  const nowPlaying = useApp((s) => s.nowPlaying);
  const upNext = useApp((s) => s.upNext);
  const error = useApp((s) => s.error);
  const supportsPicker = useApp((s) => s.supportsPicker);
  const addFilesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [tick]);

  const ready = folderStatus === 'ready' && tracks.length > 0;

  // Which track sits on which deck. The live deck holds what is playing; the
  // other holds whatever is cued up behind it.
  const trackOnDeck = (deckId: DeckId): Track | null =>
    (mixEngine().liveDeckId === deckId ? nowPlaying?.track : upNext?.track) ?? null;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-surface-1 px-3 py-2">
        <div className="h-4 w-4 shrink-0 rounded-xs bg-primary" />
        <span className="shrink-0 whitespace-nowrap text-body font-semibold text-ink">Auto DJ</span>
        {folderName && (
          <span className="hidden truncate text-caption text-ink-tertiary sm:inline">
            {folderName} · {tracks.length} tracks
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          {/* Both decks' waveforms, stacked and full width — the part of the
              screen a DJ actually reads while mixing. */}
          <div className="well shrink-0 overflow-hidden rounded-lg">
            <WaveformCanvas deckId="a" height={72} windowSec={14} />
            <div className="h-px bg-hairline" />
            <WaveformCanvas deckId="b" height={72} windowSec={14} />
          </div>

          <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-2">
            <DeckPanel deckId="a" track={trackOnDeck('a')} />
            <DeckPanel deckId="b" track={trackOnDeck('b')} />
          </div>

          <div className="shrink-0">
            <TransitionMeter />
          </div>

          <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <Transport />
            <Queue />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[190px_minmax(0,1fr)]">
            <div className="hidden min-h-0 lg:block">
              <Crates />
            </div>
            <div className="flex min-h-0 flex-col">
              <TrackTable />
            </div>
          </div>

          <div className="shrink-0 px-1">
            <MasterLevel />
          </div>
        </main>
      )}
    </div>
  );
}
