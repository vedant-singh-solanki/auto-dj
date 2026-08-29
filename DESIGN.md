# Design System — Auto DJ

Grey chrome, blue waveforms. Instrumentation, not decoration.

The reference is professional DJ software — Rekordbox, Serato, Traktor. Those
interfaces are grey for a reason: the operator needs to read a waveform, a
tempo and a clock in a dark room at a glance, and a chassis with opinions of its
own gets in the way of that. The chrome recedes; the audio is the only thing
allowed to be colourful.

> **Note on history.** This replaced a black-and-gold scheme. Nothing of it
> survives — if you find a gold token or a `btn-gold` class, it is a leftover
> and should go.

---

## Principles

1. **The interface is a chassis.** Neutral grey, low contrast between panels,
   no flourishes. Everything that draws the eye should be data.
2. **Colour belongs to the audio.** Waveforms, hot cue pads and the level meter
   are saturated. Buttons, panels and text are not.
3. **Density is a feature.** A DJ wants tempo, time, waveform, cues and the
   collection visible at once. Whitespace that costs a visible row is wrong.
4. **Decks have fixed positions.** Deck A is on the left, deck B on the right,
   always. The MASTER badge moves between them; the decks do not.
5. **Numbers are instruments.** Every measurement is monospace and tabular, so
   a running clock does not jitter.
6. **Nothing moves that is not playing.** Animation is reserved for things that
   represent live audio.

---

## Colour

### The grey ladder

Neutral, not warm — any tint here fights the blue of the waveforms, which is the
one colour that has to read cleanly.

| Token | Value | Use |
|---|---|---|
| `--color-canvas` | `#141414` | The window behind everything. |
| `--color-surface-1` | `#1e1e1e` | Panel base. |
| `--color-surface-2` | `#262626` | Panel top (panels are a gradient). |
| `--color-surface-3` | `#303030` | Raised controls, row hover. |
| `--color-surface-4` | `#3c3c3c` | Pressed and selected states. |
| `--color-hairline` | `#383838` | Default separation. |
| `--color-hairline-strong` | `#4a4a4a` | Control borders, lit top edges. |

### Blue

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#2f8fd8` | Primary action, selection, progress, focus. |
| `--color-primary-hover` | `#4aa8ec` | Gradient top and hover. |
| `--color-accent-line` | `rgba(47,143,216,0.4)` | Outline of the live deck. |
| `--color-accent-glow` | `rgba(47,143,216,0.35)` | Focus ring, live-deck glow. |

### Deck identity

Two tracks play at once during every blend and must be told apart instantly.

| Token | Value | Deck |
|---|---|---|
| `--color-deck-a` | `#29a8e0` | Cyan-blue. |
| `--color-deck-b` | `#9b7ff0` | Violet. |

Permitted on the waveform stroke, the deck label, the platter rim and the
matching end of the crossfader. Never a fill, never body text.

### Hot cue pads

Eight slots, eight fixed colours — `--color-cue-a` … `--color-cue-h`
(`#4caf50`, `#2f8fd8`, `#9c27b0`, `#f0a030`, `#e05252`, `#26c6da`, `#d4c220`,
`#ec6bb0`). The colour belongs to the **slot**, not the track: the whole value
of A–H is that position means the same thing every time.

### Text and semantic

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#ececec` | Primary text. |
| `--color-ink-muted` | `#b8b8b8` | Secondary. |
| `--color-ink-subtle` | `#8c8c8c` | Labels. |
| `--color-ink-tertiary` | `#6a6a6a` | Disabled, units, placeholders. |
| `--color-success` | `#4caf50` | Play button, "running". |
| `--color-warning` | `#f0a030` | MASTER badge, mix point, ratings, clipping. |
| `--color-danger` | `#e05252` | Destructive only. |

---

## Typography

Two families, and nothing is large. Small type is what lets everything fit.

- **`--font-sans`** — Inter. Everything that is language.
- **`--font-mono`** — JetBrains Mono, always `tabular-nums`. Every measurement:
  BPM, timecodes, counts.

`--text-mono-lg` (28px) is the deck tempo, and is the biggest thing on screen.
Panel labels use `--text-eyebrow` — 10px, uppercase, wide tracking — the way
every strip on a mixer is labelled.

---

## Shape and depth

- **Radius is 2–5px.** Equipment is barely rounded. Nothing is ever a pill.
- **`.panel`** — a top-lit gradient with a light top border and near-black
  bottom border. That inversion is what makes a grey rectangle read as a
  moulded panel rather than a flat div.
- **`.well`** — near-black with an inset shadow, lit from below. The inverse of
  a panel, and reads as cut into the surface. Waveform beds, displays, inputs
  and hot cue pads.
- **`.btn-gear`** — a pressable grey control. **`.btn-primary`** — the blue one,
  at most one per view. **`.btn-play`** — green, as on every piece of DJ gear.
- **`.deck-live`** — a blue outline and soft glow on the deck front of house.
  The only glow in the system, and it means "this is live", not "this is
  raised".

---

## Layout

A single full-viewport application shell, top to bottom:

1. Both decks' scrolling waveforms, full width and stacked.
2. Deck A and deck B channel strips, side by side.
3. The transition meter.
4. Transport and the queue.
5. Playlists sidebar and the collection table.
6. Master level.

- **≥1024px** — as above, decks side by side, playlists visible.
- **<1024px** — decks stack, playlists sidebar hides; the collection and the
  decks remain.

Touch targets are 44px minimum on anything a finger uses. Wide content scrolls
inside its own container — the page body never scrolls sideways.

---

## Do

- Keep panels close in value; let the waveform carry the contrast.
- Set every number in tabular mono.
- Use `.well` for anything that displays, `.panel` for anything that contains.
- Keep the deck colours to strokes and labels.

## Don't

- Add a third accent colour. Blue, the two deck colours, the eight cue colours
  and three semantic colours are the entire palette.
- Use large type. If something needs emphasis, it is probably a number, and it
  should be mono.
- Round anything past 5px, or make a pill.
- Animate anything that is not representing live audio.

---

## Dark only

There is no light theme and none is planned. This is used in a dark room.
