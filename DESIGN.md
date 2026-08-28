# Design System — Auto DJ

Black and gold. A booth, not a dashboard.

The reference points are professional DJ software — Rekordbox, Serato,
VirtualDJ — but those are engineering tools, and they look it: grey chrome,
rainbow waveforms, a control for everything. This app has one job and almost no
controls, so it borrows their *structure* (dark room, hard-edged panels, big
mono readouts, waveform as the hero) and drops their clutter.

The finish is the part that has to be right. Gold on black goes wrong in one of
two ways: too little and it is just a dark app with a yellow button; too much
and it is a casino. The rule below — **gold is light, not paint** — is what
keeps it on the right side.

---

## Principles

1. **The room is dark.** True black canvas. This gets used in a dim room with
   the music up; a light interface would be wrong even if it were prettier.
2. **Gold is light, not paint.** Gold appears where something is live, active,
   or being measured — a playing waveform, a level, the primary action, a focus
   ring. It never fills a large area, never sits behind body text, and never
   decorates something inert. A gold surface reads as cheap; gold *emitted* by
   something reads as expensive.
3. **The waveform is the hero.** It is the largest, brightest, most detailed
   thing on screen. Everything else is chrome around it.
4. **Numbers are instruments.** BPM, key, elapsed, remaining, level — always
   monospace, always tabular, never re-flowing as they tick.
5. **Edges, not shadows.** Depth comes from a surface ladder plus 1px hairlines
   with a warm cast. Drop shadows on black do nothing; a lit top edge does.
6. **Nothing moves that is not playing.** Animation is reserved for things that
   represent live audio. No decorative motion.

---

## Colour

### The black ladder

Panels are separated by lift, not by borders alone. Each step is small — the
whole range lives in the bottom 10% of the scale, which is what makes it read as
"expensive dark" rather than "grey app".

| Token | Value | Use |
|---|---|---|
| `--color-canvas` | `#000000` | The page. True black, deliberately. |
| `--color-surface-1` | `#0a0908` | Panels sitting on the canvas. |
| `--color-surface-2` | `#121110` | Wells inside panels — waveform beds, inputs. |
| `--color-surface-3` | `#1a1815` | Raised controls, hover states. |
| `--color-surface-4` | `#242019` | Pressed and selected states. |

The blacks are warm — a few points of red and green above blue. Next to gold, a
neutral or cool black reads as dead grey.

### Hairlines

| Token | Value | Use |
|---|---|---|
| `--color-hairline` | `#231f18` | Default 1px separation. |
| `--color-hairline-strong` | `#332c20` | Panel outlines, table headers. |
| `--color-gold-line` | `rgba(212,175,55,0.28)` | Edge of anything active. |

### Gold

A real metal ramp, not one flat yellow. Metal reads as metal because it has a
light side and a dark side.

| Token | Value | Use |
|---|---|---|
| `--color-gold` | `#d4af37` | The base. Primary action, focus ring, brand. |
| `--color-gold-bright` | `#f3d98b` | Highlight — the lit edge, hover, text on gold surfaces. |
| `--color-gold-deep` | `#8a6d1f` | Shadow side of the metal, gradient ends, inactive gold. |
| `--color-gold-glow` | `rgba(212,175,55,0.35)` | Focus rings and the halo under a playing deck. |

A gold *button* is a gradient from `--color-gold-bright` to `--color-gold`, with
`--color-gold-deep` as a 1px bottom edge, and black text. That three-part
treatment is the whole trick — a flat `#d4af37` rectangle looks like mustard.

### Deck identity

Two tracks play at once during every blend and the user must tell them apart
instantly. Gold alone cannot do that, so decks take the classic pairing:

| Token | Value | Deck |
|---|---|---|
| `--color-deck-a` | `#e8c25a` | Gold. |
| `--color-deck-b` | `#c8cdd6` | Platinum. |

Permitted **only** on: the waveform stroke, the 6px deck dot, and the matching
end of the crossfader. Never a fill, never a button, never body text.

### Text

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#f5f1e8` | Primary text. Warm white, not `#fff`. |
| `--color-ink-muted` | `#c9c2b2` | Secondary text. |
| `--color-ink-subtle` | `#8a8274` | Labels, metadata. |
| `--color-ink-tertiary` | `#5c574d` | Disabled, placeholder, units. |

Pure white on true black next to gold looks blue. Every ink value is warmed to
sit in the same family as the metal.

### Semantic

| Token | Value | Use |
|---|---|---|
| `--color-success` | `#4a9e5c` | Analysed, connected, ready. |
| `--color-warning` | `#d98324` | Mix point marker, clipping, over-length files. |

Used sparingly enough that they never compete with gold for attention.

---

## Typography

Two families. No third.

- **`--font-sans`** — Inter. Everything that is language.
- **`--font-mono`** — JetBrains Mono. Everything that is a measurement. BPM,
  timecodes, levels, counts. Always `font-variant-numeric: tabular-nums`, so a
  running clock does not jitter.

### Scale

| Token | Size | Use |
|---|---|---|
| `--text-display-lg` | 56px | Reserved. Empty states only. |
| `--text-display-md` | 40px | The now-playing title. |
| `--text-headline` | 28px | Section headings, onboarding. |
| `--text-card-title` | 22px | Panel titles. |
| `--text-subhead` | 20px | — |
| `--text-body-lg` | 18px | — |
| `--text-body` | 16px | Default. |
| `--text-body-sm` | 14px | Table rows, secondary lines. |
| `--text-caption` | 12px | Metadata. |
| `--text-eyebrow` | 13px | Uppercase labels. **Positive** tracking, 0.14em. |
| `--text-mono` | 13px | Readouts. |
| `--text-mono-lg` | 22px | The big BPM figure. |

Display and headline sizes take negative tracking; eyebrows take positive
tracking and are set in `--color-ink-subtle`, or gold when the thing they label
is live. That contrast — tight display type against wide, spaced small caps — is
most of the "luxury" in the type system.

---

## Shape and depth

- **Radius:** 4px on tags, 6px on buttons and inputs, 10px on panels, 14px on
  the main deck panel. Nothing is ever a pill — hardware is not pill-shaped.
- **The lit edge.** Every raised panel gets a 1px top highlight fading out at
  both ends (`.edge-lit`). On true black this is what separates a panel from a
  hole. Active panels use a gold-tinted version (`.edge-lit-gold`).
- **The active glow.** The panel containing the playing deck carries a soft
  `--color-gold-glow` outer shadow. It is the only shadow in the system, and it
  exists to say "this is live", not to create depth.
- **Inset wells.** Waveform beds and inputs sit at `--color-surface-2` with a 1px
  `--color-hairline` and no top highlight — the absence of the lit edge is what
  makes them read as recessed.

---

## Components

### Buttons

- **Primary** — the gold gradient described above, black text, 6px radius. There
  is at most one on screen: *Start the set*.
- **Secondary** — `--color-surface-3`, 1px `--color-hairline-strong`, warm white
  text. Hover lifts to `--color-surface-4` and the border warms to
  `--color-gold-line`.
- **Segmented** (the mood control) — a `--color-surface-2` trough with the
  selected segment raised to `--color-surface-4` and its label in gold.
- Disabled is 35% opacity. Never a different colour.

### Panels

`--color-surface-1`, 10px radius, 1px `--color-hairline`, `.edge-lit`. The deck
panel is 14px, takes `.edge-lit-gold`, and gains the glow while playing.

### The waveform bed

Full-bleed inside its panel, `--color-surface-2`, 1px hairline. Played audio is
drawn at full deck colour; unplayed at 42% alpha. The beat grid is
`--color-hairline` with bar lines at `--color-hairline-strong`. The playhead is
a 1.5px `--color-ink` line dead centre. The mix point is a dashed
`--color-warning` rule.

### Tables

No zebra striping. 1px `--color-hairline` between rows, hover to
`--color-surface-2`. Numeric columns are mono, right-aligned, tabular. Row
actions appear on hover only.

### Focus

One treatment everywhere: a 2px `--color-gold-glow` ring at 2px offset. It is
never removed, on any control.

---

## Do

- Let large areas be black and empty.
- Put gold on the thing that is currently happening.
- Set every number in tabular mono.
- Warm every neutral — blacks, whites and greys all lean amber.
- Use the surface ladder for hierarchy before reaching for a border.

## Don't

- Fill a panel, card or table row with gold.
- Put body text on a gold background, or gold body text on black.
- Add a second accent colour. Deck platinum and the two semantic colours are the
  entire remaining palette.
- Use drop shadows for depth. The only shadow is the live-deck glow.
- Use pure `#ffffff` or pure grey anywhere.
- Animate anything that is not representing live audio.

---

## Responsive

The app is a full-viewport shell, not a page: fixed header, scrolling library,
fixed deck column.

- **≥1024px** — two columns, library left, deck column right at 420px.
- **768–1023px** — single column, deck panel first, library beneath it.
- **<768px** — same, with the library table dropping its BPM and length columns.
  The deck panel never collapses; it is the app.

Touch targets are 44px minimum. Wide content scrolls inside its own container —
the page body never scrolls sideways.

---

## Dark mode only

There is no light theme and none is planned. A dark room is where this gets
used, and the entire palette is built on true black.
