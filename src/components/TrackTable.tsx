import { useMemo, useState } from 'react';
import type { Analysis, Track } from '../types';
import { bpmLabel, clock } from '../lib/format';
import { hasSource } from '../lib/library/fileSource';
import { tooLongToMix } from '../lib/constants';
import { useApp } from '../store';

/**
 * The library. Sortable, searchable, and honest about what it does not know
 * yet — a track with no BPM shows a dash and fills itself in as the background
 * analysis reaches it.
 */

type SortKey = 'title' | 'artist' | 'bpm' | 'duration';

/** Rendering thousands of rows is slower than any sane user needs; the rest are
 *  one search box away. */
const MAX_ROWS = 300;

function durationOf(track: Track, analysis: Analysis | undefined): number {
  return analysis?.durationSec ?? track.durationSec ?? 0;
}

export function TrackTable() {
  const tracks = useApp((s) => s.tracks);
  const analyses = useApp((s) => s.analyses);
  const status = useApp((s) => s.status);
  const unplayable = useApp((s) => s.unplayable);
  const { start, queueNext, enqueue } = useApp.getState();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('title');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? tracks.filter((track) =>
          `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(needle),
        )
      : tracks.slice();

    filtered.sort((a, b) => {
      switch (sort) {
        case 'artist':
          return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
        case 'bpm':
          return (analyses.get(b.id)?.bpm ?? 0) - (analyses.get(a.id)?.bpm ?? 0);
        case 'duration':
          return durationOf(b, analyses.get(b.id)) - durationOf(a, analyses.get(a.id));
        default:
          return a.title.localeCompare(b.title);
      }
    });
    return filtered;
  }, [tracks, analyses, query, sort]);

  const analysedCount = useMemo(
    () => tracks.reduce((count, track) => count + (analyses.has(track.id) ? 1 : 0), 0),
    [tracks, analyses],
  );

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-hairline bg-surface-1">
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline p-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your music"
          className="min-w-40 flex-1 rounded-md border border-hairline bg-surface-2 px-3 py-1.5 text-body-sm text-ink placeholder:text-ink-tertiary"
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="rounded-md border border-hairline bg-surface-2 px-2 py-1.5 text-body-sm text-ink"
          aria-label="Sort tracks"
        >
          <option value="title">Title</option>
          <option value="artist">Artist</option>
          <option value="bpm">Tempo</option>
          <option value="duration">Length</option>
        </select>
        <span className="font-mono text-mono text-ink-tertiary">
          {analysedCount}/{tracks.length} analysed
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-body-sm">
          <tbody>
            {rows.slice(0, MAX_ROWS).map((track) => {
              const analysis = analyses.get(track.id);
              const tooLong = tooLongToMix(durationOf(track, analysis));
              const broken = unplayable.has(track.id);
              const available = track.supported && hasSource(track.id) && !tooLong && !broken;
              return (
                <tr key={track.id} className="group border-b border-hairline last:border-0 hover:bg-surface-2">
                  <td className="max-w-0 px-3 py-2">
                    <p className="truncate text-ink">{track.title}</p>
                    <p className="truncate text-caption text-ink-subtle">{track.artist}</p>
                  </td>
                  <td className="w-16 px-2 py-2 text-right font-mono text-mono text-ink-subtle">
                    {bpmLabel(analysis?.bpm)}
                  </td>
                  <td className="w-14 px-2 py-2 text-right font-mono text-mono text-ink-tertiary">
                    {clock(durationOf(track, analysis))}
                  </td>
                  <td className="w-40 px-3 py-2 text-right">
                    {available ? (
                      <span className="inline-flex gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => (status === 'idle' ? void start(track.id) : queueNext(track.id))}
                          className="rounded-md border border-hairline bg-surface-2 px-2 py-1 text-caption text-ink-subtle transition-colors hover:border-gold-line hover:text-ink"
                        >
                          {status === 'idle' ? 'Start here' : 'Play next'}
                        </button>
                        <button
                          type="button"
                          onClick={() => enqueue(track.id)}
                          title="Add to the end of the queue"
                          className="rounded-md border border-hairline bg-surface-2 px-2 py-1 text-caption text-ink-subtle transition-colors hover:border-gold-line hover:text-ink"
                        >
                          Queue
                        </button>
                      </span>
                    ) : (
                      <span className="text-caption text-ink-tertiary">
                        {broken
                          ? 'would not play'
                          : tooLong
                            ? 'too long to mix'
                            : track.supported
                              ? 'reconnect folder'
                              : 'unsupported file'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length > MAX_ROWS && (
          <p className="px-3 py-3 text-caption text-ink-tertiary">
            Showing the first {MAX_ROWS} of {rows.length} matches — search to narrow it down.
          </p>
        )}
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-body-sm text-ink-tertiary">
            {tracks.length === 0 ? 'No music loaded yet.' : 'Nothing matches that search.'}
          </p>
        )}
      </div>
    </section>
  );
}
