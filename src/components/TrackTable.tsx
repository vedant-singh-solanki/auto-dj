import { useMemo, useState } from 'react';
import type { Analysis, Track } from '../types';
import { bpmLabel, clock } from '../lib/format';
import { hasSource } from '../lib/library/fileSource';
import { tooLongToMix } from '../lib/constants';
import { tracksInScope, useApp } from '../store';
import { PreviewWave } from './PreviewWave';
import { Stars } from './Stars';

/**
 * The collection: everything known about every track, sortable on any of it.
 *
 * Honest about what it does not know yet — a track with no BPM shows a dash and
 * fills itself in as the background analysis reaches it.
 */

type SortKey = 'title' | 'artist' | 'genre' | 'bpm' | 'rating' | 'duration';

/** Rendering thousands of rows is slower than any sane user needs; the rest are
 *  one search box away. */
const MAX_ROWS = 300;

function durationOf(track: Track, analysis: Analysis | undefined): number {
  return analysis?.durationSec ?? track.durationSec ?? 0;
}

export function TrackTable() {
  const tracks = useApp(tracksInScope);
  const analyses = useApp((s) => s.analyses);
  const ratings = useApp((s) => s.ratings);
  const crates = useApp((s) => s.crates);
  const activeCrateId = useApp((s) => s.activeCrateId);
  const status = useApp((s) => s.status);
  const unplayable = useApp((s) => s.unplayable);
  const { start, queueNext, enqueue, setRating, addToCrate, removeFromCrate } = useApp.getState();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('title');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? tracks.filter((track) =>
          `${track.title} ${track.artist} ${track.album} ${track.genre ?? ''}`.toLowerCase().includes(needle),
        )
      : tracks.slice();

    filtered.sort((a, b) => {
      switch (sort) {
        case 'artist':
          return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
        case 'genre':
          return (a.genre ?? '~').localeCompare(b.genre ?? '~') || a.title.localeCompare(b.title);
        case 'bpm':
          return (analyses.get(b.id)?.bpm ?? 0) - (analyses.get(a.id)?.bpm ?? 0);
        case 'rating':
          return (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0);
        case 'duration':
          return durationOf(b, analyses.get(b.id)) - durationOf(a, analyses.get(a.id));
        default:
          return a.title.localeCompare(b.title);
      }
    });
    return filtered;
  }, [tracks, analyses, ratings, query, sort]);

  const analysedCount = useMemo(
    () => tracks.reduce((count, track) => count + (analyses.has(track.id) ? 1 : 0), 0),
    [tracks, analyses],
  );

  const header = (key: SortKey, label: string, className = '') => (
    <th
      scope="col"
      className={`cursor-pointer select-none border-b border-hairline px-2 py-1.5 text-left text-eyebrow uppercase transition-colors ${
        sort === key ? 'text-primary' : 'text-ink-tertiary hover:text-ink-subtle'
      } ${className}`}
      onClick={() => setSort(key)}
    >
      {label}
    </th>
  );

  return (
    <section className="panel flex min-h-0 flex-col rounded-lg">
      <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-2 py-2">
        <span className="text-eyebrow uppercase text-ink-subtle">
          Collection ({rows.length})
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="well ml-auto w-44 rounded-sm px-2 py-1 text-body-sm text-ink placeholder:text-ink-tertiary"
        />
        <span className="font-mono text-caption text-ink-tertiary">
          {analysedCount}/{tracks.length} analysed
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-body-sm">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              <th scope="col" className="border-b border-hairline px-2 py-1.5 text-left text-eyebrow uppercase text-ink-tertiary">
                Preview
              </th>
              {header('title', 'Track title')}
              {header('artist', 'Artist')}
              {header('genre', 'Genre')}
              {header('bpm', 'BPM', 'text-right')}
              {header('rating', 'Rating')}
              {header('duration', 'Time', 'text-right')}
              <th scope="col" className="border-b border-hairline px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((track) => {
              const analysis = analyses.get(track.id);
              const tooLong = tooLongToMix(durationOf(track, analysis));
              const broken = unplayable.has(track.id);
              const available = track.supported && hasSource(track.id) && !tooLong && !broken;

              return (
                <tr key={track.id} className="group border-b border-hairline last:border-0 hover:bg-surface-3">
                  <td className="w-32 px-2 py-1">
                    <PreviewWave analysis={analysis} />
                  </td>
                  <td className="max-w-0 px-2 py-1">
                    <p className="truncate text-ink">{track.title}</p>
                  </td>
                  <td className="max-w-0 px-2 py-1">
                    <p className="truncate text-ink-subtle">{track.artist}</p>
                  </td>
                  <td className="w-28 max-w-0 px-2 py-1">
                    <p className="truncate text-ink-tertiary">{track.genre ?? '—'}</p>
                  </td>
                  <td className="w-14 px-2 py-1 text-right font-mono text-mono text-ink-muted">
                    {bpmLabel(analysis?.bpm)}
                  </td>
                  <td className="w-24 px-2 py-1">
                    <Stars value={ratings.get(track.id) ?? 0} onChange={(stars) => setRating(track.id, stars)} />
                  </td>
                  <td className="w-14 px-2 py-1 text-right font-mono text-mono text-ink-tertiary">
                    {clock(durationOf(track, analysis))}
                  </td>
                  <td className="w-44 px-2 py-1 text-right">
                    {available ? (
                      <span className="inline-flex gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => (status === 'idle' ? void start(track.id) : queueNext(track.id))}
                          className="btn-gear rounded-sm px-1.5 py-0.5 text-caption"
                        >
                          {status === 'idle' ? 'Play' : 'Next'}
                        </button>
                        <button
                          type="button"
                          onClick={() => enqueue(track.id)}
                          title="Add to the end of the queue"
                          className="btn-gear rounded-sm px-1.5 py-0.5 text-caption"
                        >
                          Queue
                        </button>
                        {activeCrateId ? (
                          <button
                            type="button"
                            onClick={() => removeFromCrate(activeCrateId, track.id)}
                            title="Remove from this playlist"
                            className="btn-gear rounded-sm px-1.5 py-0.5 text-caption"
                          >
                            −
                          </button>
                        ) : (
                          crates.length > 0 && (
                            <select
                              aria-label="Add to playlist"
                              value=""
                              onChange={(event) => event.target.value && addToCrate(event.target.value, track.id)}
                              className="btn-gear rounded-sm px-1 py-0.5 text-caption"
                            >
                              <option value="">+ list</option>
                              {crates.map((crate) => (
                                <option key={crate.id} value={crate.id}>
                                  {crate.name}
                                </option>
                              ))}
                            </select>
                          )
                        )}
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
            {tracks.length === 0 ? 'Nothing in here yet.' : 'Nothing matches that search.'}
          </p>
        )}
      </div>
    </section>
  );
}
