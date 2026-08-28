/**
 * Shapes shared across the library, analysis, audio and DJ layers.
 *
 * A TrackId is derived from the file itself (name + size + mtime), not from its
 * path — moving or renaming a folder keeps the cached analysis, and editing a
 * file invalidates it.
 */
export type TrackId = string;

export function trackIdFor(file: { name: string; size: number; lastModified: number }): TrackId {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export interface Track {
  id: TrackId;
  /** Path relative to the chosen folder, e.g. "House/Artist/track.mp3". */
  path: string;
  fileName: string;
  size: number;
  lastModified: number;

  title: string;
  artist: string;
  album: string;
  year?: number;
  /** Duration from the file's tags; the analysed value supersedes it. */
  durationSec?: number;
  /** BPM written into the file's tags, if any. Analysis still overrides it. */
  tagBpm?: number;

  /** False for formats the browser cannot decode (wma). Listed, never played. */
  supported: boolean;
  addedAt: number;
}

/** Bump when the analysis maths changes, to invalidate every cached result. */
export const ANALYSIS_VERSION = 3;

export interface Analysis {
  id: TrackId;
  version: number;

  durationSec: number;
  /** Detected tempo. `beatAt(n) = beatOffset + n * 60 / bpm`. */
  bpm: number;
  beatOffset: number;
  /** 0..1. Below CONFIDENCE_FLOOR we refuse to beat-match and plain-fade. */
  bpmConfidence: number;

  /** Absolute peak per bucket, 0..1, at PEAKS_PER_SECOND buckets/second. */
  peaks: Float32Array;
  /** RMS per bucket, 0..1, at ENERGY_PER_SECOND buckets/second. */
  energy: Float32Array;
  /** Mean loudness in dBFS, used to trim decks to a matched level. */
  loudnessDb: number;
  /** 0..1 summary of how energetic the track's body is. Drives selection. */
  energyScore: number;

  /** Seconds. Where the incoming track should start so the mix lands on beat. */
  mixInSec: number;
  /**
   * Seconds. The start of the track's biggest sustained section — the drop or
   * the chorus. This, not the intro, is where a live set comes in.
   */
  hookSec: number;
  /** Seconds. Where the outgoing track should begin handing over. */
  mixOutSec: number;

  analyzedAt: number;
}

export type DeckId = 'a' | 'b';

/** What the user is asking the DJ to do next. */
export type Mood = 'hold' | 'lift' | 'cool';

export interface HistoryEntry {
  id: TrackId;
  playedAt: number;
}

/** Why a transition could not be beat-matched, for the UI to explain. */
export type MixKind = 'beatmatched' | 'plain';

export interface TransitionPlan {
  fromId: TrackId;
  toId: TrackId;
  kind: MixKind;
  /** AudioContext time at which the incoming deck starts. */
  startAt: number;
  /** Length of the blend in seconds. */
  durationSec: number;
  /** Playback rate applied to the incoming deck to match tempo. */
  rate: number;
  beats: number;
}
