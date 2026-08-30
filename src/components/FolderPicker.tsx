import { useRef, useState } from 'react';
import { useApp } from '../store';
import { MAX_LIBRARY_TRACKS, PLAYABLE_EXTENSIONS } from '../lib/constants';

/**
 * The first thing anyone sees. Two paths in:
 *
 * - Chrome and Edge get the real folder picker, and the app can remember the
 *   folder for next time.
 * - Every other browser gets drag-and-drop, which works for one session only.
 *   That limitation is stated up front rather than discovered later.
 */
export function FolderPicker() {
  const supportsPicker = useApp((s) => s.supportsPicker);
  const folderStatus = useApp((s) => s.folderStatus);
  const folderName = useApp((s) => s.folderName);
  const { connectFolder, reconnectFolder, addTrackFiles } = useApp.getState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const needsReconnect = folderStatus === 'needs-click' && folderName;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length > 0) void addTrackFiles(event.dataTransfer.files);
      }}
      className={`mx-auto max-w-xl rounded-lg border border-dashed p-8 text-center transition-colors ${
        dragging ? 'border-primary bg-surface-2' : 'border-hairline-strong bg-surface-1'
      }`}
    >
      <div className="btn-primary mx-auto mb-5 h-9 w-9 rounded-sm" />
      <h2 className="text-headline text-ink">
        {needsReconnect ? 'Welcome back' : 'A DJ for your own music'}
      </h2>

      {needsReconnect ? (
        <p className="mx-auto mt-2 max-w-md text-body-sm text-ink-subtle">
          Your browser needs permission again to read "{folderName}". Nothing was lost — one click and
          the set can carry on.
        </p>
      ) : (
        <>
          {/* Say what it does before asking for anything. Someone arriving cold
              should not have to hand over their music to find out. */}
          <p className="mx-auto mt-2 max-w-md text-body-sm text-ink-muted">
            Point it at your music and press play. It picks what comes next and mixes it in — coming in
            at each track's hook, beat-matched and in key, then blending, cutting or rewinding into the
            next one. It does not stop.
          </p>
          <p className="mx-auto mt-2 max-w-md text-caption text-ink-tertiary">
            Everything happens in this browser. Your files are read from your disk and never uploaded.
          </p>

          {/* Three steps, so the shape of it is obvious before committing. */}
          <ol className="mx-auto mt-5 flex max-w-md flex-col gap-1.5 text-left text-body-sm text-ink-subtle">
            {[
              'Choose your music folder — it is remembered for next time.',
              'Press play. The first track starts from the beginning.',
              'Leave it, or take over: skip, re-order the queue, set where a track comes in.',
            ].map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="font-mono text-mono text-primary">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        {needsReconnect ? (
          <button
            type="button"
            onClick={() => void reconnectFolder()}
            className="btn-primary rounded-md px-5 py-2.5 text-button transition-[background-image]"
          >
            Reconnect "{folderName}"
          </button>
        ) : supportsPicker ? (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void connectFolder()}
                className="btn-primary rounded-md px-5 py-2.5 text-button transition-[background-image]"
              >
                Choose music folder
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md btn-gear px-5 py-2.5 text-button text-ink-muted transition-colors hover:border-accent-line hover:bg-surface-4 hover:text-ink"
              >
                Pick individual songs
              </button>
            </div>
            <p className="max-w-sm text-caption text-ink-tertiary">
              A folder is remembered for next time. Individual songs are added just for this visit — you
              can add more of either at any point.
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-primary rounded-md px-5 py-2.5 text-button transition-[background-image]"
            >
              Choose music files
            </button>
            <p className="max-w-sm text-caption text-ink-tertiary">
              This browser cannot remember a folder between visits. Chrome or Edge can — or just drag your
              music onto this box each time.
            </p>
          </>
        )}

        {!needsReconnect && supportsPicker && (
          <p className="text-caption text-ink-tertiary">or drag music onto this box</p>
        )}
      </div>

      {!needsReconnect && (
        <p className="mx-auto mt-4 max-w-sm text-caption text-ink-tertiary">
          Plays {PLAYABLE_EXTENSIONS.map((extension) => `.${extension}`).join(', ')}. Video files work
          too — it uses the audio. Up to {MAX_LIBRARY_TRACKS} tracks.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="audio/*,video/mp4,.mp3,.mp4,.m4a,.aac,.wav,.flac,.ogg,.opus"
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) void addTrackFiles(event.target.files);
        }}
      />
    </div>
  );
}
