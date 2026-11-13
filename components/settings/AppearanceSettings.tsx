import React from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { AccentName, AppState, Appearance, AppearanceMode, GlassLevel } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { ACCENT_NAMES, ACCENT_SWATCHES, GLASS_LEVELS, isDarkAppearance, resolveAppearance } from '../../utils/appearance';
import { Segmented } from '../ui/Segmented';

interface AppearanceSettingsProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

const MODES: AppearanceMode[] = ['light', 'dark', 'system'];
const MODE_KEYS = { light: 'modeLight', dark: 'modeDark', system: 'modeSystem' } as const;

/** Mode, accent, glass and language. Used in Settings and in the Appearance sheet. */
export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ state, setState }) => {
  const t = TRANSLATIONS[state.language];
  const appearance = resolveAppearance(state.appearance);
  const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = isDarkAppearance(appearance, systemDark);

  const update = (changes: Partial<Appearance>) =>
    setState(prev => ({ ...prev, appearance: { ...resolveAppearance(prev.appearance), ...changes } }));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-muted">{t.modeLabel}</h3>
        <Segmented<AppearanceMode>
          ariaLabel={t.modeLabel}
          value={appearance.mode}
          onChange={mode => update({ mode })}
          options={MODES.map(mode => ({ value: mode, label: t[MODE_KEYS[mode]] }))}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 id="appearance-accent" className="text-[13px] font-semibold text-muted">{t.accentLabel}</h3>
        <div role="radiogroup" aria-labelledby="appearance-accent" className="grid grid-cols-4 gap-2">
          {ACCENT_NAMES.map((accent: AccentName) => {
            const selected = appearance.accent === accent;
            const swatch = ACCENT_SWATCHES[accent][dark ? 1 : 0];
            return (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ accent })}
                className={clsx(
                  'flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[13px] font-semibold',
                  selected ? 'bg-tile shadow-[0_0_0_2px_rgb(var(--accent-rgb))]' : 'bg-chip text-muted',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: swatch }} aria-hidden="true">
                  {selected && <Check size={18} strokeWidth={3} className={accent === 'ink' && dark ? 'text-black' : 'text-white'} />}
                </span>
                {t[`accent_${accent}` as const]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-muted">{t.glassLabel}</h3>
        <Segmented<GlassLevel>
          ariaLabel={t.glassLabel}
          value={appearance.glass}
          onChange={glass => update({ glass })}
          options={GLASS_LEVELS.map(glass => ({ value: glass, label: t[`glass_${glass}` as const] }))}
        />
        <p className="text-[13px] text-muted">{t.glassHint}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-muted">{t.languageLabel}</h3>
        <Segmented<AppState['language']>
          ariaLabel={t.languageLabel}
          value={state.language}
          onChange={language => setState(prev => ({ ...prev, language }))}
          options={[
            { value: 'en', label: 'English' },
            { value: 'sr', label: 'Srpski' },
          ]}
        />
      </section>
    </div>
  );
};
