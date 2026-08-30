import { useRef } from 'react';
import { useApp } from '../store';

/**
 * Backup and restore, in Export mode where the rest of the library work lives.
 *
 * This is the app's substitute for cloud sync. There is no server to sync to and
 * no account to sync with, and real sync would mean uploading the music itself —
 * which this app promises never to do. A file does the same job by hand.
 */
export function BackupPanel() {
  const { exportSettings, importSettings } = useApp.getState();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="panel rounded-lg p-3">
      <span className="text-eyebrow uppercase text-ink-subtle">Backup</span>
      <p className="mt-1.5 text-caption text-ink-tertiary">
        Saves your cue points, hot cues, ratings and playlists to a file. The music itself is not in it.
        Put the file in Dropbox or email it to yourself, restore it on another computer, and the same
        work follows you — the tracks are matched by the files themselves, not by where they are kept.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void exportSettings()} className="btn-gear rounded-sm px-3 py-1.5 text-caption">
          Save a backup
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-gear rounded-sm px-3 py-1.5 text-caption"
        >
          Restore from a backup
        </button>
      </div>

      <p className="mt-2 text-caption text-ink-tertiary">
        Restoring merges rather than replaces, so nothing you have done here is lost.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importSettings(file);
          event.target.value = '';
        }}
      />
    </section>
  );
}
