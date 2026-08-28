import { useEffect } from 'react';
import type { DeckId, Track } from './types';
import { mixEngine } from './lib/audio/engine';
import { useApp } from './store';
import { FolderPicker } from './components/FolderPicker';
import { ScanProgress } from './components/ScanProgress';
import { TrackTable } from './components/TrackTable';
import { NowPlaying } from './components/NowPlaying';
import { NextUp } from './components/NextUp';
import { Transport } from './components/Transport';
import { Platter } from './components/Platter';
import { MasterLevel } from './components/MasterLevel';
import { TransitionMeter } from './components/TransitionMeter';

/** How often the control loop runs. Audio timing does not depend on this. */
const TICK_MS = 200;

/** `?demo` in development loads synthetic tracks, so the mixer can be exercised
 *  without going through a native folder dialog. Never present in a build. */
const DEMO_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

async function loadDemoSet(): Promise<void> {
  const { buildDemoFiles } = await import('./dev/demoSet');
  await useApp.getState().importDroppedFiles(buildDemoFiles());
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
  const status = useApp((s) => s.status);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [tick]);

  const ready = folderStatus === 'ready' && tracks.length > 0;

  // Which track sits on which platter. The live deck holds what is playing; the
  // other holds whatever is cued up behind it.
  const trackOnDeck = (deckId: DeckId): Track | null =>
    (mixEngine().liveDeckId === deckId ? nowPlaying?.track : upNext?.track) ?? null;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <div className="btn-gold h-5 w-5 rounded-xs" />
        <span className="text-body font-medium text-ink">Auto DJ</span>
        {folderName && (
          <span className="truncate text-caption text-ink-tertiary">
            {folderName} · {tracks.length} tracks
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {DEMO_MODE && (
            <button
              type="button"
              onClick={() => void loadDemoSet()}
              className="rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-caption text-ink-subtle transition-colors hover:text-ink"
            >
              Load demo set
            </button>
          )}
          {ready && (
            <button
              type="button"
              onClick={() => void useApp.getState().connectFolder()}
              className="rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-caption text-ink-subtle transition-colors hover:text-ink"
            >
              Change folder
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="flex shrink-0 items-start gap-3 border-b border-hairline bg-surface-2 px-4 py-3">
          <p className="flex-1 text-body-sm text-ink-muted">{error}</p>
          <button
            type="button"
            onClick={() => useApp.getState().dismissError()}
            className="rounded-md px-2 py-1 text-caption text-ink-subtle hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {importing ? (
          <div className="pt-12">
            <ScanProgress progress={importing} />
          </div>
        ) : !ready ? (
          <div className="pt-12">
            <FolderPicker />
          </div>
        ) : (
          <div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <div className="order-2 flex min-h-0 flex-col lg:order-1">
              <TrackTable />
            </div>

            <div className="order-1 flex flex-col gap-4 lg:order-2">
              {nowPlaying ? (
                <>
                  <NowPlaying loaded={nowPlaying} />
                  <TransitionMeter />
                  <NextUp info={upNext} live={nowPlaying} />
                </>
              ) : (
                <section className="edge-lit rounded-lg border border-hairline bg-surface-1 p-6 text-center">
                  <p className="text-body text-ink">
                    {status === 'starting' ? 'Getting the first track ready…' : 'Ready when you are.'}
                  </p>
                  <p className="mt-1 text-body-sm text-ink-subtle">
                    Press start and it will keep going on its own.
                  </p>
                </section>
              )}

              <Transport />

              <div className="edge-lit rounded-lg border border-hairline bg-surface-1 p-4">
                <span className="text-eyebrow uppercase text-ink-tertiary">Decks</span>
                <div className="mt-4 flex items-start justify-center gap-6">
                  <Platter deckId="a" track={trackOnDeck('a')} />
                  <Platter deckId="b" track={trackOnDeck('b')} />
                </div>
                <div className="mt-4">
                  <MasterLevel />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
