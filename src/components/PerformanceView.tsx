import type { DeckId, Track } from '../types';
import { mixEngine } from '../lib/audio/engine';
import { useApp } from '../store';
import { DeckPanel } from './DeckPanel';
import { Transport } from './Transport';
import { MasterLevel } from './MasterLevel';
import { TransitionMeter } from './TransitionMeter';
import { Queue } from './Queue';
import { TrackTable } from './TrackTable';
import { Crates } from './Crates';
import { WaveformCanvas } from './WaveformCanvas';

/**
 * Performance mode: the booth.
 *
 * Both waveforms, both decks, the transport and what is coming — nothing that
 * belongs to preparation. The collection stays, because reaching for a track
 * mid-set is a thing that happens, but the editing of it does not.
 */
export function PerformanceView() {
  const nowPlaying = useApp((s) => s.nowPlaying);
  const upNext = useApp((s) => s.upNext);

  // Which track sits on which deck. The live deck holds what is playing; the
  // other holds whatever is cued up behind it.
  const trackOnDeck = (deckId: DeckId): Track | null =>
    (mixEngine().liveDeckId === deckId ? nowPlaying?.track : upNext?.track) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      {/* The part of the screen a DJ actually reads while mixing. */}
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
    </div>
  );
}
