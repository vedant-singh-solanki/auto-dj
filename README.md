# Auto DJ

A DJ that plays your own music files and mixes them together — beat-matched,
with the bass swapped over so two tracks never turn to mud. It runs entirely
inside your browser. **Your music is never uploaded anywhere.**

Point it at the folder your music lives in, press start, and it keeps going on
its own: it picks what comes next and blends it in over the outro of what is
playing. Skip if you disagree, or nudge it with *Cool down* / *Hold* / *Lift*.

## Before you start

**Use Chrome or Edge.** They are the only browsers that can open a folder and
remember it for next time. Firefox and Safari still work, but you have to drag
your music onto the page each visit.

Playable: `mp3`, `m4a`, `aac`, `wav`, `flac`, `ogg`, `opus`.
Listed but not playable: `wma` and a few others no browser can decode.

The first time a track comes up it gets analysed for tempo — a few seconds. That
happens quietly in the background for the rest of your library while you listen,
and the result is remembered, so it only ever happens once per track.

## Putting it online (one-time setup)

1. Create a repository on GitHub and push this folder to it.
2. In the repository, go to **Settings → Pages**.
3. Under **Source**, choose **GitHub Actions**.

That is all. Every push to `main` rebuilds the site and publishes it at
`https://<your-username>.github.io/<repository-name>/`.

The build gets the folder name from GitHub automatically, so the repository can
be called whatever you like.

## Running it on this computer

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints (`http://localhost:5173/auto-dj/`).

Other commands:

```bash
npm run typecheck
```

```bash
npm run build
```

`npm run typecheck` is the only automated check in this project — there is no
test suite and no linter, so run it after any change.

### Trying it without your own music

The folder picker is a system dialog, which cannot be driven from a test. So in
development, `http://localhost:5173/auto-dj/?demo` adds a **Load demo set**
button that generates four short synthetic tracks at known tempos and feeds them
through the real code path — real WAV files, real tag reading, real tempo
detection, real beat-matched mixing. They are 25 seconds each, so a complete
transition can be watched in under a minute.

`window.__autoDj` exposes the store and the mixer in development for poking at
from the browser console. Neither exists in a build.

## How it works

- **Nothing leaves your computer.** The page reads the audio files directly off
  your disk with your permission, decodes them in memory, and stores only what
  it worked out about them — tempo, waveform shape, loudness — in your browser.
- **Analysis** happens in a Web Worker: waveform peaks for the display, an
  energy curve to find the intro and outro, a loudness figure so two tracks
  arrive at the mixer sounding equally loud, and a confidence score for how much
  to trust the detected beat grid.
- **Mixing** runs on two decks through a shared limiter. The incoming track is
  pitched up to ±8% to match tempo (half and double time count as a match), its
  first downbeat is scheduled to land exactly on a downbeat of the outgoing
  track, and the two are crossfaded over 32 beats while the bass hands over in
  the middle. When the tempos cannot meet, or the beat grid is not trustworthy,
  it falls back to a plain crossfade rather than making a track sound wrong.
- **After each mix** the new track slides gently back to its own tempo, so a long
  set can travel rather than staying stuck at the speed of whatever started it.
- **Choosing what is next** is plain arithmetic, not a model: tempo
  compatibility, energy against the mood setting, and how recently the track and
  the artist were played. It picks with weighted randomness from the top of the
  list, so the same folder does not produce the same set twice.

See `DESIGN.md` for the visual rules.
