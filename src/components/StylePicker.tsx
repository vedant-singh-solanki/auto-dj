import { SET_STYLES } from '../lib/dj/styles';
import { useApp } from '../store';

/**
 * The set styles — presets for the character of a mix.
 *
 * They change four things at once: how long each track gets, how long the blend
 * is, how readily it cuts instead of blending, and where the energy goes over
 * the night. One control rather than four sliders, because those numbers only
 * make sense together.
 */
export function StylePicker() {
  const styleId = useApp((s) => s.styleId);
  const { setStyle } = useApp.getState();
  const current = SET_STYLES.find((style) => style.id === styleId) ?? SET_STYLES[0];

  return (
    <div>
      <span className="text-eyebrow uppercase text-ink-tertiary">Set style</span>
      <div className="mt-2 inline-flex flex-wrap rounded-md border border-hairline bg-surface-2 p-1">
        {SET_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            title={style.description}
            onClick={() => setStyle(style.id)}
            aria-pressed={styleId === style.id}
            className={`rounded-sm px-3 py-1.5 text-button transition-colors ${
              styleId === style.id ? 'bg-surface-4 text-primary' : 'text-ink-subtle hover:text-ink'
            }`}
          >
            {style.name}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-caption text-ink-tertiary">{current.description}</p>
    </div>
  );
}
