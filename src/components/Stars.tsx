/**
 * A five-star rating. Clicking the star you are already on clears it, which is
 * the only sensible way to get back to "unrated" without an extra control.
 */
export function Stars({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(value === star ? 0 : star)}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          className={`px-px text-caption leading-none transition-colors ${
            star <= value ? 'text-warning' : 'text-ink-tertiary hover:text-ink-subtle'
          }`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
