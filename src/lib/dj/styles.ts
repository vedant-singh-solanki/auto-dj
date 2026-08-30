/**
 * Set styles — the presets.
 *
 * Everything here was previously a constant, which meant the app had exactly
 * one idea of what a set sounds like: club-length segments and punchy blends.
 * That is right for a party and wrong for a dinner, and there is no single
 * correct answer, so it becomes a choice.
 *
 * A style is the handful of numbers that actually change the character of a
 * mix: how long each track gets, how long the blend is, how readily it cuts
 * instead of blending, and where the energy goes over the night.
 */
export interface SetStyle {
  id: string;
  name: string;
  /** One line, in plain language, for the picker. */
  description: string;
  /** How long each track plays before handing over. */
  segmentSec: number;
  /** Default blend length in beats; the pair still shortens or lengthens it. */
  blendBeats: number;
  /** 0..1 — how often a big energy lift is cut to rather than blended into. */
  cutChance: number;
  /** Where the energy starts, where it peaks, and how long it takes. */
  openingEnergy: number;
  peakEnergy: number;
  climbMin: number;
}

export const SET_STYLES: SetStyle[] = [
  {
    id: 'club',
    name: 'Club',
    description: 'Short segments, punchy blends, builds over the night.',
    segmentSec: 75,
    blendBeats: 16,
    cutChance: 0.5,
    openingEnergy: 0.5,
    peakEnergy: 0.9,
    climbMin: 45,
  },
  {
    id: 'party',
    name: 'Party',
    description: 'Fast and relentless. Cuts hard on the drop, high from the off.',
    segmentSec: 55,
    blendBeats: 8,
    cutChance: 0.8,
    openingEnergy: 0.65,
    peakEnergy: 0.95,
    climbMin: 25,
  },
  {
    id: 'lounge',
    name: 'Lounge',
    description: 'Long tracks, long blends, stays calm. Music to talk over.',
    segmentSec: 150,
    blendBeats: 32,
    cutChance: 0.05,
    openingEnergy: 0.3,
    peakEnergy: 0.55,
    climbMin: 90,
  },
  {
    id: 'radio',
    name: 'Radio',
    description: 'Close to whole tracks, always blended, energy held steady.',
    segmentSec: 190,
    blendBeats: 16,
    cutChance: 0,
    openingEnergy: 0.55,
    peakEnergy: 0.65,
    climbMin: 60,
  },
];

export const DEFAULT_STYLE_ID = 'club';

export function styleById(id: string): SetStyle {
  return SET_STYLES.find((style) => style.id === id) ?? SET_STYLES[0];
}
