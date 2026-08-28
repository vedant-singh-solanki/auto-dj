# Auto DJ

A DJ that plays your own music files and mixes them like a live set: it comes in
at each track's hook, gives it about a minute and a quarter, then blends out on
the beat with the bass swapped over so two tracks never turn to mud. It runs
entirely inside your browser. **Your music is never uploaded anywhere.**

Point it at the folder your music lives in, press start, and it keeps going on
its own: it picks what comes next and blends it in over the outro of what is
playing. Skip if you disagree, or nudge it with *Cool down* / *Hold* / *Lift*.

## Before you start

**Use Chrome or Edge.** They are the only browsers that can open a folder and
remember it for next time. Firefox and Safari still work, but you have to drag
your music onto the page each visit.

Playable: `mp3`, `mp4`, `m4a`, `m4v`, `aac`, `wav`, `flac`, `ogg`, `opus`.

`mp4` and `m4v` are video files, and they work: a lot of music arrives as a
downloaded video, so the app pulls the audio track out and ignores the picture.
A 720p music video mixes exactly like an mp3.

Listed but not playable: `wma` and a few others no browser can decode.

Anything **over 20 minutes** is listed but never played, and is marked "too long
to mix" in the library. A decoded hour-long DJ set or podcast needs well over a
gigabyte of memory, and the mixer holds two tracks at once — it would take the
tab down. It is not something you would beat-match anyway.

The first time a track comes up it gets analysed for tempo — a few seconds. That
happens quietly in the background for the rest of your library while you listen,
and the result is remembered, so it only ever happens once per track.

## Adding music

Two ways in, and you can mix them freely:

- **Choose music folder** — remembered between visits, so the app reconnects
  with one click next time. **Add folder** connects another one alongside it;
  your music does not have to live in one place.
- **Pick individual songs** / **Add files** — adds one or more tracks straight
  into the library without disturbing anything already there. These are only
  for the current visit, because a browser is not allowed to remember a loose
  file the way it remembers a folder.

Either button is available at any time from the top bar, and dragging music
onto the page works too.

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

It is built to behave like a DJ playing a live set, not like a playlist with
nice transitions. That distinction drives most of the decisions below.

- **Nothing leaves your computer.** The page reads the audio files directly off
  your disk with your permission, decodes them in memory, and stores only what
  it worked out about them — tempo, waveform shape, loudness — in your browser.
- **Analysis** happens in a Web Worker: waveform peaks for the display, an
  energy curve, a loudness figure so two tracks arrive at the mixer sounding
  equally loud, a confidence score for how much to trust the detected beat grid,
  and the position of the track's **hook**.
- **It comes in at the hook.** A DJ playing live does not start a record at bar
  one and let it run for five minutes. The analyser slides a window across the
  energy curve to find the biggest sustained section — the drop, or the chorus —
  and the set enters there.
- **Each track gets about 70–80 seconds.** Long enough to land, short enough to
  keep moving. The exact figure is snapped to whole musical phrases, so it varies
  a little with tempo; a set where every track lasted exactly 75 seconds would
  sound mechanical.
- **Mixing** runs on two decks through a shared limiter. The incoming track is
  pitched up to ±8% to match tempo (half and double time count as a match) and
  its entry is aligned to a **phrase** boundary, not just a bar — that is what
  makes a blend land chorus-over-chorus instead of chorus-over-verse, and it is
  most of the difference between sounding professional and sounding automatic.
- **The transition itself** is a crossfade with three things layered over it:
  the bass hands over in the middle so two kick drums never fight, a highpass
  filter sweeps the outgoing track up and out from underneath, and a half-beat
  echo throws on the last beats so it rings away instead of just stopping.
  Blend length varies with the pair — short and punchy into a big lift, longer
  between two calm tracks — because an auto-mix that always takes exactly
  sixteen beats announces itself as a machine within three tracks.
- When the tempos cannot meet, or the beat grid is not trustworthy, it falls
  back to a plain crossfade rather than making a track sound wrong.
- **After each mix** the new track slides gently back to its own tempo, so a long
  set can travel rather than staying stuck at the speed of whatever started it.
- **The set builds.** Target energy climbs from moderate to peak across the first
  45 minutes and then holds, the way a night does. *Cool down* / *Hold* / *Lift*
  override it whenever you disagree.
- **Choosing what is next** is plain arithmetic, not a model: tempo
  compatibility, energy against the mood setting, and how recently the track and
  the artist were played. It picks with weighted randomness from the top of the
  list, so the same folder does not produce the same set twice.

The look is black and gold — a booth, not a dashboard. `DESIGN.md` has the
rules; the short version is that gold marks whatever is live and never fills a
surface.
