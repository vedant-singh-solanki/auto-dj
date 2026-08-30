import { clock } from '../lib/format';
import { KEY_CONFIDENCE_FLOOR } from '../lib/constants';
import { HOT_CUE_LABELS } from '../types';
import { useApp } from '../store';
import { PreviewWave } from './PreviewWave';
import { Stars } from './Stars';

/**
 * The preparation desk for one track: everything the analyser worked out, and
 * everything you can overrule.
 *
 * This is why Export mode exists. Cueing a track properly means looking at its
 * waveform and deciding where it should come in — a judgement made in advance,
 * in silence, not something to be doing with one hand while a set runs.
 */
export function TrackPrep() {
  const selectedTrackId = useApp((s) => s.selectedTrackId);
  const tracks = useApp((s) => s.tracks);
  const analyses = useApp((s) => s.analyses);
  const cues = useApp((s) => s.cues);
  const hotCues = useApp((s) => s.hotCues);
  const ratings = useApp((s) => s.ratings);
  const crates = useApp((s) => s.crates);
  const { setCue, clearCue, setHotCue, setRating, addToCrate, removeFromCrate } = useApp.getState();

  const track = tracks.find((entry) => entry.id === selectedTrackId);
  if (!track) {
    return (
      <section className="panel flex items-center justify-center rounded-lg p-6">
        <p className="max-w-xs text-center text-body-sm text-ink-tertiary">
          Pick a track from the collection to see its waveform, set where it comes in, and rate it.
        </p>
      </section>
    );
  }

  const analysis = analyses.get(track.id);
  const cue = cues.get(track.id);
  const slots = hotCues.get(track.id);
  const memberOf = crates.filter((crate) => crate.trackIds.includes(track.id));

  return (
    <section className="panel flex flex-col gap-3 rounded-lg p-3">
      <div>
        <p className="truncate text-body text-ink">{track.title}</p>
        <p className="truncate text-body-sm text-ink-subtle">{track.artist}</p>
      </div>

      {/* Facts, and honest dashes where the analyser has not got there yet. */}
      <dl className="grid grid-cols-4 gap-2 text-center">
        {[
          ['BPM', analysis ? String(Math.round(analysis.bpm)) : '—'],
          ['Key', analysis?.key && analysis.key.confidence >= KEY_CONFIDENCE_FLOOR ? analysis.key.camelot : '—'],
          ['Length', clock(analysis?.durationSec ?? track.durationSec ?? 0)],
          ['Genre', track.genre ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="well rounded-sm px-1 py-1.5">
            <dt className="text-eyebrow uppercase text-ink-tertiary">{label}</dt>
            <dd className="truncate font-mono text-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <span className="text-eyebrow uppercase text-ink-tertiary">Where it comes in</span>
        <div className="well mt-1 overflow-hidden rounded-sm p-1">
          <PreviewWave
            analysis={analysis}
            width={360}
            height={64}
            cueSec={cue}
            hookSec={analysis?.hookSec}
            onSetCue={(seconds) => setCue(track.id, seconds)}
          />
        </div>
        <p className="mt-1 text-caption text-ink-tertiary">
          {analysis
            ? cue !== undefined
              ? 'Your cue point. Click again to move it.'
              : 'Click the waveform to set a cue point. The dashed line is where the app would come in.'
            : 'Not analysed yet — the waveform appears once this track has been read.'}
        </p>
        {cue !== undefined && (
          <button
            type="button"
            onClick={() => clearCue(track.id)}
            className="btn-gear mt-1 rounded-sm px-2 py-0.5 text-caption"
          >
            Clear cue ({clock(cue)})
          </button>
        )}
      </div>

      {/* Hot cues can be cleared here; setting one needs a deck to be at a
          position, which only happens in Performance mode. */}
      {slots?.some((slot) => slot !== null) && (
        <div>
          <span className="text-eyebrow uppercase text-ink-tertiary">Hot cues</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {slots.map((at, index) =>
              at === null ? null : (
                <button
                  key={index}
                  type="button"
                  onClick={() => setHotCue(track.id, index, null)}
                  title="Clear this hot cue"
                  className="well rounded-sm px-1.5 py-0.5 font-mono text-caption text-ink-subtle hover:text-ink"
                  style={{ borderColor: `var(--color-cue-${HOT_CUE_LABELS[index].toLowerCase()})` }}
                >
                  {HOT_CUE_LABELS[index]} {clock(at)} ×
                </button>
              ),
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-eyebrow uppercase text-ink-tertiary">Rating</span>
        <Stars value={ratings.get(track.id) ?? 0} onChange={(stars) => setRating(track.id, stars)} />
      </div>

      <div>
        <span className="text-eyebrow uppercase text-ink-tertiary">Playlists</span>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {memberOf.map((crate) => (
            <button
              key={crate.id}
              type="button"
              onClick={() => removeFromCrate(crate.id, track.id)}
              title="Remove from this playlist"
              className="btn-gear rounded-sm px-1.5 py-0.5 text-caption"
            >
              {crate.name} ×
            </button>
          ))}
          {crates.length > memberOf.length && (
            <select
              aria-label="Add to playlist"
              value=""
              onChange={(event) => event.target.value && addToCrate(event.target.value, track.id)}
              className="btn-gear rounded-sm px-1 py-0.5 text-caption"
            >
              <option value="">+ add to…</option>
              {crates
                .filter((crate) => !crate.trackIds.includes(track.id))
                .map((crate) => (
                  <option key={crate.id} value={crate.id}>
                    {crate.name}
                  </option>
                ))}
            </select>
          )}
          {crates.length === 0 && <span className="text-caption text-ink-tertiary">No playlists yet.</span>}
        </div>
      </div>
    </section>
  );
}
