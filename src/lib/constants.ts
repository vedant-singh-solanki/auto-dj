/** Formats the browser can decode with `decodeAudioData`. */
export const PLAYABLE_EXTENSIONS = ['mp3', 'm4a', 'mp4', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus'];

/** Recognised as music, but not decodable — listed with a reason, never played. */
export const UNPLAYABLE_EXTENSIONS = ['wma', 'aiff', 'aif', 'alac', 'ape', 'wv'];

/** Waveform drawing resolution. 40/s is smooth at any sane zoom and stays small. */
export const PEAKS_PER_SECOND = 40;
/** Energy curve resolution — coarse on purpose, it describes sections. */
export const ENERGY_PER_SECOND = 4;

/** Tempo search range. Anything outside is almost certainly a detection error. */
export const MIN_BPM = 70;
export const MAX_BPM = 180;

/** Beyond this the pitch shift is audible, so we plain-fade instead. */
export const MAX_TEMPO_STRETCH = 0.08;
/** Below this we don't trust the beat grid enough to align to it. */
export const CONFIDENCE_FLOOR = 0.35;

/** Default blend length, in beats. 32 beats = 8 bars. */
export const DEFAULT_MIX_BEATS = 32;
/** How far ahead the next track is decoded so the mix never waits on disk. */
export const PRELOAD_LEAD_SEC = 60;

/** Don't repeat a track until this many others have played. */
export const ROTATION_WINDOW = 40;
/** Don't repeat an artist until this many others have played. */
export const ARTIST_WINDOW = 8;

/**
 * Longest track the auto-DJ will load. Decoded audio is roughly 10MB a minute
 * per channel, and the mixer holds two decks at once, so an hour-long DJ mix or
 * podcast would need well over a gigabyte and take the tab down with it.
 *
 * Anything past this is kept in the library and labelled, not played — a
 * sixty-minute continuous mix is not a track you beat-match anyway.
 */
export const MAX_MIXABLE_SEC = 20 * 60;

/** True for anything too long to hold in memory alongside a second deck. */
export function tooLongToMix(seconds: number | undefined): boolean {
  return seconds !== undefined && seconds > MAX_MIXABLE_SEC;
}
