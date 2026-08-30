import { type ReactNode, useEffect, useRef } from 'react';
import { MAX_LIBRARY_TRACKS, PLAYABLE_EXTENSIONS } from '../lib/constants';

const REPO = 'https://github.com/vedant-singh-solanki/auto-dj';

/**
 * Help, in the app rather than in a file nobody opens.
 *
 * Covers the questions that actually come up — what happens to your music, why
 * a folder is remembered but a loose file is not, why a row says it will not
 * play — plus the keyboard shortcuts and a link to the source.
 */
export function Help({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // A dialog you cannot leave with the keyboard is not a dialog.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="panel my-6 w-full max-w-2xl rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-headline text-ink">Auto DJ</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-gear rounded-sm px-2 py-1 text-caption"
          >
            Close
          </button>
        </div>

        <p className="mt-2 text-body-sm text-ink-muted">
          It plays your own music and mixes it like a live set: coming in at each track's hook, giving
          it about a minute and a quarter, then blending, cutting or rewinding into the next one.
        </p>

        <Section title="Your music never leaves this computer">
          <p>
            The page reads your files directly off your disk with your permission and does everything
            in the browser. Nothing is uploaded, to us or to anyone — there is no server to upload it
            to. What gets saved is only what the app worked out: tempo, key, waveform shape, your cue
            points, ratings and playlists. All of it lives in this browser, on this machine.
          </p>
          <p>Clearing your browser's site data erases it. That is the "start over" button.</p>
        </Section>

        <Section title="Common questions">
          <Question q="Which browser do I need?">
            Chrome or Edge. They are the only ones that can open a folder and remember it. Firefox and
            Safari work, but you have to add your music again each visit.
          </Question>
          <Question q="Does it work on my phone?">
            It plays, but phone browsers cannot open a folder — use <strong>Pick individual songs</strong>.
            The two-deck view is cramped on a small screen; it is built for a laptop.
          </Question>
          <Question q="What files can I use?">
            {PLAYABLE_EXTENSIONS.map((extension) => `.${extension}`).join(', ')}. Video files work too —
            it takes the audio and ignores the picture. Anything longer than 20 minutes is listed but
            not played: a decoded hour-long mix needs more memory than the browser can spare.
          </Question>
          <Question q="Why does a track say it will not play?">
            Chrome refused to decode it, which usually means the file is damaged or is not really the
            format its name claims. Re-downloading it normally fixes it. The set skips it and carries on.
          </Question>
          <Question q="Why did my added songs disappear?">
            A browser can remember a folder but not a loose file, so individually added tracks last for
            one visit. Your cue points and ratings survive though — they are tied to the file itself, so
            adding the same track again brings its settings back.
          </Question>
          <Question q="How many tracks can it hold?">
            {MAX_LIBRARY_TRACKS}. Past that, the collection stops being something a person browses and
            the DJ's choices get no better for it.
          </Question>
          <Question q="Does it need the internet?">
            Only to load the page. After that everything runs locally — but keep the tab open, because
            closing it stops the music.
          </Question>
        </Section>

        <Section title="Keyboard">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-mono text-mono text-ink">Space</dt>
            <dd>Play / pause</dd>
            <dt className="font-mono text-mono text-ink">Tab</dt>
            <dd>Move between controls</dd>
            <dt className="font-mono text-mono text-ink">Esc</dt>
            <dd>Close this panel</dd>
          </dl>
        </Section>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-3 text-caption text-ink-tertiary">
          <span className="font-mono">v{__APP_VERSION__}</span>
          <a href={REPO} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            Source code on GitHub
          </a>
          <a
            href={`${REPO}/blob/main/GUIDE.md`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Full guide
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-eyebrow uppercase text-ink-subtle">{title}</h3>
      <div className="mt-2 flex flex-col gap-2 text-body-sm text-ink-muted">{children}</div>
    </section>
  );
}

function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-ink">{q}</p>
      <p className="text-ink-subtle">{children}</p>
    </div>
  );
}
