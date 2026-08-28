/**
 * Formats the browser can decode with `decodeAudioData`.
 *
 * mp4 and m4v are video containers, and are deliberately included: a lot of
 * music arrives as a downloaded video, and the decoder pulls out the audio
 * track and ignores the picture.
 */
export const PLAYABLE_EXTENSIONS = ['mp3', 'm4a', 'mp4', 'm4v', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus'];

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

/**
 * Blend length in beats. 16 beats is 4 bars — short and punchy, the way a live
 * club set moves. Long 8-bar blends sound polished but read as background
 * music rather than a set.
 */
export const DEFAULT_MIX_BEATS = 16;

/**
 * How long each track gets before it hands over.
 *
 * A DJ playing live almost never plays a whole song — they come in at the hook,
 * ride it, and move on. This is the single thing that separates a set from a
 * playlist with nice transitions. The figure is snapped to a whole musical
 * phrase per track, so the real segment varies with tempo.
 */
export const SEGMENT_TARGET_SEC = 75;
export const SEGMENT_MIN_SEC = 55;
export const SEGMENT_MAX_SEC = 95;
/** Beats in a phrase. Transitions and segment lengths both land on these. */
export const PHRASE_BEATS = 32;

/** How far ahead of the handover the next track is decoded and analysed. */
export const PREPARE_LEAD_SEC = 25;

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

/**
 * Width of the window used to find a track's hook. Roughly a chorus: long
 * enough not to latch onto a single loud bar, short enough to sit inside one
 * section.
 */
export const HOOK_WINDOW_SEC = 20;

/**
 * The shape of a set's energy over time. A DJ opens at a moderate level, builds
 * across the night, and then holds the peak rather than climbing for ever.
 *
 * These are targets on the same 0..1 scale as `Analysis.energyScore`, and the
 * mood buttons still shift them either way whenever the user disagrees.
 */
export const SET_OPENING_ENERGY = 0.5;
export const SET_PEAK_ENERGY = 0.9;
/** Minutes taken to climb from opening to peak. */
export const SET_CLIMB_MIN = 45;
