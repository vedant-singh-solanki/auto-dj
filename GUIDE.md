# Auto DJ — how to use it

Everything on screen, what it does, and what the app is doing behind it.

**The app:** <https://vedant-singh-solanki.github.io/auto-dj/>

Use **Chrome or Edge**. Your music never leaves your computer — the page reads
the files off your disk and does everything in the browser.

---

## Getting started

1. Open the link. You'll be asked to point it at your music.
2. **Choose music folder** — pick the folder your music is in. This is
   remembered, so next time it reconnects with one click.
   **Pick individual songs** — choose one or more files instead. These only last
   for the visit, because a browser isn't allowed to remember a loose file.
   You can also just **drag music onto the page**.
3. Press the green **play** button.

That's the whole thing. It picks what comes next and mixes it in on its own, and
it doesn't stop.

The first time it sees a track it works out the tempo — a few seconds. It does
the rest of your library quietly in the background while you listen, and
remembers the result forever. You never wait for it.

---

## The screen, top to bottom

### Top bar

| Control | What it does |
|---|---|
| **Add files** | Adds individual songs to what you already have. Nothing is replaced. |
| **Add folder** | Connects another folder alongside the current one. Your music can live in several places. |
| **Change folder** | Replaces the connected folders with one new one. |

### The two big waveforms

Deck A on top, deck B underneath. These are the two tracks the app has loaded —
one playing, one lined up. The white line down the middle is where you are now;
everything to the left has played, everything to the right hasn't. The faint
vertical lines are the beats.

### Deck A and Deck B

Two identical panels, side by side. Deck A is always on the left. The one with
the orange **MASTER** badge is the one you're hearing — that badge moves between
them at each mix; the decks never swap sides.

Each deck shows:

- **Artwork, title and artist**
- **The big number** — the tempo it is playing at right now. If the app has
  sped a track up slightly to match the other deck, this shows the sped-up
  figure, not the track's original.
- **The clock** — how far into the track, and how long it is.
- **The overview waveform** — **click anywhere on it to set where that track
  comes in.** A blue marker appears and the time is shown underneath as
  *mix-in*. Press **clear** to go back to letting the app choose.
- **The turntable** — spins at the real speed of the track. It slows, speeds up
  and stops exactly as the audio does, so it's a genuine readout, not decoration.
- **Hot cue pads A–H** — see below.

### Hot cues (A–H)

Eight saved spots per track.

- **Empty pad** (shows a dash) — click it to save wherever the deck is right now.
- **Filled pad** (shows a time) — click it to jump straight there.
- **The × in the corner** — hover a filled pad and click it to clear that slot.

The colours belong to the *slot*, not the track: A is always green, B always
blue, and so on, so your hand learns where things are.

Hot cues are saved forever, per track.

### Transport

| Control | What it does |
|---|---|
| **Play / Pause** (green) | Starts the set, or pauses and resumes it. **The space bar does the same thing.** |
| **Skip — mix the next one in now** | Doesn't cut. Starts the blend into the next track immediately. |
| **Volume** | Master volume. |
| **Next mix** | A live countdown to the next handover. |
| **− 15s** | Bring the next mix forward by fifteen seconds. |
| **+ 15s** | Hold this track fifteen seconds longer. |
| **Where next: Cool down / Hold / Lift** | Steers what it picks next — calmer, the same, or more upbeat. |

The − and + buttons can be pressed repeatedly. They won't let a mix be pushed
past the end of a track or dragged back before there's room to do it properly.

### Coming up

The queue, in order. **1** is next.

- **Play next** in the collection puts a track at the top of this list.
- **Queue** in the collection adds it to the bottom.
- **✕** removes an entry, and the app picks something else to fill the gap.
- **Re-pick** throws away the app's own suggestions and chooses again. Anything
  *you* put in the queue stays where it is — those are marked **your pick**.

### Playlists

Down the left of the collection.

- **+** makes a new one. Type a name and press Enter.
- **All music** is everything you've loaded.
- Click a playlist to select it. This does more than filter the view: **the DJ
  will only play from that playlist** until you switch back to All music.
- **×** next to a playlist deletes it (the tracks themselves are untouched).

To put a track in a playlist, use the **+ list** dropdown on its row in the
collection. When you're inside a playlist, the **−** button removes a track
from it.

### Collection

Every track, with a preview of its waveform, title, artist, genre, tempo, your
rating and its length. **Click any column heading to sort by it.** The search box
matches title, artist, album and genre.

- **Stars** — click to rate. Click the same star again to clear the rating.
- **Play** / **Next** — start the set with this track, or make it next.
- **Queue** — add to the end of the queue.

Some rows can't be played, and say why:

| It says | What it means |
|---|---|
| *would not play* | The file is damaged or mislabelled. Chrome refused it. Try re-downloading it. |
| *too long to mix* | Over 20 minutes — a DJ set or a podcast, not a track. Too big to hold in memory alongside a second deck. |
| *unsupported file* | A format no browser can decode, such as `.wma`. |
| *reconnect folder* | The app has lost permission to read the file. Reload and reconnect. |

Playable: `mp3`, `mp4`, `m4a`, `m4v`, `aac`, `wav`, `flac`, `ogg`, `opus`.
Video files work — it takes the audio and ignores the picture.

---

## How it mixes

It's built to behave like a DJ playing live, not a playlist with nice fades.

- **It comes in at the hook.** It finds the biggest sustained part of each
  track — the drop or the chorus — and starts there, rather than at the
  beginning. (The very first track of a set is the exception: it plays from
  0:00, because there's nothing to mix it against.)
- **Each track gets about 70–80 seconds**, then hands over. The exact length
  lands on a musical phrase, so it varies slightly with tempo.
- **It matches tempo** within about 8%, speeding one track up or slowing it
  down. Half and double time count as a match.
- **It lines up the phrasing**, not just the beat, so choruses land over
  choruses instead of over verses.
- **The transition** is a crossfade with three things over it: the bass swaps
  over in the middle so two kick drums never fight, a filter lifts the outgoing
  track out from underneath, and a short echo throws on the last beats so it
  rings away instead of stopping.
- **If two tracks can't be matched** — too far apart in tempo, or the beat isn't
  clear enough to trust — it does a plain crossfade rather than pitching a track
  until it sounds wrong.
- **After each mix** the new track slides gently back to its own tempo, so a
  long set can travel rather than getting stuck at one speed.
- **The set builds.** It aims for higher energy as the night goes on, levelling
  off after about 45 minutes. *Cool down* / *Hold* / *Lift* override it whenever
  you disagree.
- **Choosing what's next** is plain arithmetic, not AI: tempo compatibility,
  energy against the mood setting, and how recently that track and that artist
  were played. It picks with a bit of randomness from the top of the list, so
  the same folder doesn't give you the same set twice.

---

## Things worth knowing

- **Your music is never uploaded.** Everything happens in the browser. What it
  stores is what it worked out — tempo, waveform shape, your cues, ratings and
  playlists — and that stays on your computer.
- **Folders are remembered; individual files are not.** A browser can hold on to
  a folder, but not a loose file. Anything added file-by-file needs adding again
  next visit. Your cue points and ratings survive though — they're tied to the
  file itself, so re-adding a track brings its settings back.
- **Clearing your browser's site data** wipes the analysis, cues, ratings and
  playlists. That's the "start over" button.
- **It needs the tab open** to keep playing.

---

## If something goes wrong

**The music stopped and a message appeared.** The message says what to do. Most
often a file is damaged — the app skips it, marks it *would not play*, and
carries on.

**It won't start.** Check there are playable tracks: if every row says
*reconnect folder*, reload the page and reconnect your folder.

**A track comes in at the wrong moment.** Click its waveform where you want it
to enter. That overrides the app's guess for good.

**Transitions sound wrong between two particular tracks.** Their tempos are
probably too far apart to match, so it's crossfading rather than beat-mixing.
Check the BPM column — if they aren't within about 8% of each other (or double /
half), that's expected.
