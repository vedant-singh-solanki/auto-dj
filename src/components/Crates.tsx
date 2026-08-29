import { useState } from 'react';
import { useApp } from '../store';

/**
 * Playlists, down the side, the way every DJ application arranges them.
 *
 * Selecting one does more than filter the view: it limits what the auto-DJ is
 * allowed to play. That is the point of building a crate — "play only from
 * this" is the instruction, not "show me only this".
 */
export function Crates() {
  const crates = useApp((s) => s.crates);
  const activeCrateId = useApp((s) => s.activeCrateId);
  const trackCount = useApp((s) => s.tracks.length);
  const { setActiveCrate, createCrate, deleteCrate } = useApp.getState();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const submit = (): void => {
    createCrate(name);
    setName('');
    setNaming(false);
  };

  return (
    <nav className="panel flex min-h-0 flex-col rounded-lg">
      <header className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="text-eyebrow uppercase text-ink-subtle">Playlists</span>
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="rounded-sm px-1.5 text-body-sm leading-none text-ink-subtle transition-colors hover:text-primary"
          aria-label="New playlist"
          title="New playlist"
        >
          +
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <button
          type="button"
          onClick={() => setActiveCrate(null)}
          className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-body-sm transition-colors ${
            activeCrateId === null ? 'bg-primary text-on-primary' : 'text-ink-muted hover:bg-surface-3'
          }`}
        >
          <span className="truncate">All music</span>
          <span className="ml-2 shrink-0 font-mono text-caption opacity-70">{trackCount}</span>
        </button>

        {crates.map((crate) => (
          <div key={crate.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => setActiveCrate(crate.id)}
              className={`flex min-w-0 flex-1 items-center justify-between rounded-sm px-2 py-1.5 text-body-sm transition-colors ${
                activeCrateId === crate.id ? 'bg-primary text-on-primary' : 'text-ink-muted hover:bg-surface-3'
              }`}
            >
              <span className="truncate">{crate.name}</span>
              <span className="ml-2 shrink-0 font-mono text-caption opacity-70">{crate.trackIds.length}</span>
            </button>
            <button
              type="button"
              onClick={() => deleteCrate(crate.id)}
              aria-label={`Delete playlist ${crate.name}`}
              className="shrink-0 px-1.5 text-caption text-ink-tertiary opacity-0 transition hover:text-danger group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}

        {naming && (
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={submit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
              if (event.key === 'Escape') {
                setName('');
                setNaming(false);
              }
            }}
            placeholder="Playlist name"
            className="well mt-1 w-full rounded-sm px-2 py-1.5 text-body-sm text-ink placeholder:text-ink-tertiary"
          />
        )}

        {crates.length === 0 && !naming && (
          <p className="px-2 py-3 text-caption text-ink-tertiary">
            Make a playlist with + to have the DJ play only from a chosen set of tracks.
          </p>
        )}
      </div>
    </nav>
  );
}
