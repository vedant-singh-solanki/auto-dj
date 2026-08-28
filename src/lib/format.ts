/** 214 -> "3:34". Negative and non-finite values read as "0:00". */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/** Short countdown used on the "next up in" line. */
export function countdown(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'now';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return clock(seconds);
}

export function bpmLabel(bpm: number | undefined, rate = 1): string {
  if (!bpm || !Number.isFinite(bpm)) return '—';
  return String(Math.round(bpm * rate));
}
