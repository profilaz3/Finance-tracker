import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { AccentName, AppState, Appearance, AppearanceMode, GlassLevel, ThemeName } from '../../types';
import { TRANSLATIONS } from '../../constants';
import {
  ACCENT_NAMES,
  DEFAULT_CUSTOM_ACCENT,
  GLASS_LEVELS,
  THEME_NAMES,
  getThemeScopeClasses,
  isDarkAppearance,
  resolveAppearance,
  withTheme,
} from '../../utils/appearance';
import { deriveCustomAccent, hslToHex, parseHex, rgbToHsl, toHex } from '../../utils/colorContrast';
import { Segmented } from '../ui/Segmented';

interface AppearanceSettingsProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  /** Settings has its own Language and currency page; the Appearance sheet keeps language here. */
  hideLanguage?: boolean;
}

type Strings = (typeof TRANSLATIONS)['en'];

const MODES: AppearanceMode[] = ['light', 'dark', 'system'];
const MODE_KEYS = { light: 'modeLight', dark: 'modeDark', system: 'modeSystem' } as const;
const SHADES = [30, 38, 46, 54, 64, 74];
const HUE_TRACK = 'linear-gradient(90deg, #E5484D, #F2A93B, #D6C431, #46A758, #12A594, #2E88D8, #6E56CF, #C2298A, #E5484D)';

const useSystemDark = () => {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const update = () => setDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [query]);
  return dark;
};

/** The accent currently painted on <html>, as a hex: the starting point for a custom colour. */
const currentAccentHex = (): string => {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return DEFAULT_CUSTOM_ACCENT;
  const parts = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? toHex(parts as [number, number, number]) : DEFAULT_CUSTOM_ACCENT;
};

const ThemeCard: React.FC<{
  theme: ThemeName;
  accent: AccentName;
  dark: boolean;
  selected: boolean;
  label: string;
  sample: { balance: string; up: string; down: string };
  onSelect: () => void;
}> = ({ theme, accent, dark, selected, label, sample, onSelect }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    className={clsx(
      'flex flex-col gap-1.5 rounded-[22px] p-1.5 text-left',
      selected ? 'shadow-[0_0_0_2px_rgb(var(--accent-rgb))]' : 'shadow-[0_0_0_1px_var(--paper-line)]',
    )}
  >
    {/* Drawn with the previewed theme's own tokens. */}
    <span
      className={clsx(getThemeScopeClasses(theme, accent, dark), 'block rounded-[17px] p-2')}
      style={{ background: 'var(--paper-bg)' }}
      aria-hidden="true"
    >
      <span className="block rounded-[12px] px-2 py-1.5" style={{ background: 'var(--paper-tile)', boxShadow: 'var(--paper-tile-shadow)' }}>
        <span className="block text-[14px] font-bold leading-tight tabular-nums" style={{ color: 'var(--paper-text)' }}>{sample.balance}</span>
        <span className="mt-0.5 flex gap-1.5 text-[10px] font-semibold tabular-nums">
          <span style={{ color: 'var(--paper-pos)' }}>{sample.up}</span>
          <span style={{ color: 'var(--paper-neg)' }}>{sample.down}</span>
        </span>
      </span>
      <span className="mt-1.5 flex items-center gap-1">
        <span className="h-2 w-8 rounded-full" style={{ background: 'rgb(var(--accent-rgb))' }} />
        <span className="h-2 w-5 rounded-full" style={{ background: 'var(--paper-chip)' }} />
      </span>
    </span>
    <span className="flex items-center justify-between px-1 pb-0.5 text-[13px] font-semibold">
      {label}
      {selected && <Check size={14} strokeWidth={3} className="text-accent" aria-hidden="true" />}
    </span>
  </button>
);

const CustomAccentPanel: React.FC<{
  t: Strings;
  hex: string;
  dark: boolean;
  onChange: (hex: string) => void;
}> = ({ t, hex, dark, onChange }) => {
  const [draft, setDraft] = useState(hex);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(hex);
    setInvalid(false);
  }, [hex]);

  const [hue, saturation, lightness] = useMemo(() => rgbToHsl(parseHex(hex) ?? [15, 118, 110]), [hex]);
  const derived = useMemo(() => deriveCustomAccent(hex), [hex]);
  const adjusted = derived ? (dark ? derived.dark.adjusted : derived.light.adjusted) : false;
  const vivid = Math.max(saturation, 55);

  const commitDraft = () => {
    const value = draft.trim().startsWith('#') ? draft.trim() : `#${draft.trim()}`;
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      setInvalid(false);
      onChange(value.toUpperCase());
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-tile p-4" style={{ boxShadow: 'var(--paper-tile-shadow)' }}>
      <div className="flex items-center gap-3">
        <span className="glass-accent flex h-10 flex-1 items-center justify-center rounded-full text-[14px] font-semibold">
          {t.customAccentTitle}
        </span>
        <span className="h-10 w-10 flex-none rounded-full bg-accent" aria-hidden="true" />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-muted">{t.customAccentHue}</span>
        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(hue)}
          onChange={event => onChange(hslToHex([Number(event.target.value), vivid, Math.min(Math.max(lightness, 30), 70)]))}
          className="h-7 w-full cursor-pointer appearance-none rounded-full bg-transparent [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
          style={{ background: HUE_TRACK }}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span id="custom-accent-shade" className="text-[13px] font-semibold text-muted">{t.customAccentShade}</span>
        <div role="radiogroup" aria-labelledby="custom-accent-shade" className="grid grid-cols-6 gap-2">
          {SHADES.map(shade => {
            const value = hslToHex([hue, vivid, shade]);
            const selected = value === hex;
            return (
              <button
                key={shade}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={value}
                onClick={() => onChange(value)}
                className={clsx('h-10 rounded-full', selected && 'shadow-[0_0_0_2px_var(--paper-tile),0_0_0_4px_var(--paper-text)]')}
                style={{ background: value }}
              />
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-muted">{t.customAccentHex}</span>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={7}
          value={draft}
          onChange={event => {
            setDraft(event.target.value);
            const value = event.target.value.trim();
            if (/^#?[0-9a-f]{6}$/i.test(value)) {
              setInvalid(false);
              onChange((value.startsWith('#') ? value : `#${value}`).toUpperCase());
            }
          }}
          onBlur={commitDraft}
          onKeyDown={event => {
            if (event.key === 'Enter') commitDraft();
          }}
          aria-invalid={invalid}
          className="h-11 rounded-[14px] bg-chip px-3 font-mono text-[15px] uppercase"
        />
        {invalid && <span className="text-[13px] text-neg">{t.customAccentInvalid}</span>}
      </label>

      {adjusted && <p className="text-[13px] text-muted">{t.customAccentAdjusted}</p>}
    </div>
  );
};

/** Mode, theme, accent, glass and language. Used in Settings and in the Appearance sheet. */
export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ state, setState, hideLanguage }) => {
  const t = TRANSLATIONS[state.language];
  const appearance = resolveAppearance(state.appearance);
  const systemDark = useSystemDark();
  const dark = isDarkAppearance(appearance, systemDark);
  const theme = appearance.theme ?? 'paper';

  const update = (change: (current: Appearance) => Appearance) =>
    setState(prev => ({ ...prev, appearance: change(resolveAppearance(prev.appearance)) }));

  const locale = state.language === 'sr' ? 'sr-Latn-RS' : 'en-US';
  const sample = {
    balance: (12480).toLocaleString(locale),
    up: `+${(2.4).toLocaleString(locale)}%`,
    down: `-${(860).toLocaleString(locale)}`,
  };

  const customSwatch = appearance.customAccent ? deriveCustomAccent(appearance.customAccent) : null;
  const customColor = customSwatch ? toHex(dark ? customSwatch.dark.accent : customSwatch.light.accent) : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-muted">{t.modeLabel}</h3>
        <Segmented<AppearanceMode>
          ariaLabel={t.modeLabel}
          value={appearance.mode}
          onChange={mode => update(current => ({ ...current, mode }))}
          options={MODES.map(mode => ({ value: mode, label: t[MODE_KEYS[mode]] }))}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 id="appearance-theme" className="text-[13px] font-semibold text-muted">{t.themeLabel}</h3>
        <div role="radiogroup" aria-labelledby="appearance-theme" className="grid grid-cols-3 gap-2">
          {THEME_NAMES.map(name => (
            <ThemeCard
              key={name}
              theme={name}
              accent={theme === name ? appearance.accent : withTheme(appearance, name).accent}
              dark={dark}
              selected={theme === name}
              label={t[`theme_${name}` as const]}
              sample={sample}
              onSelect={() => update(current => withTheme(current, name))}
            />
          ))}
        </div>
        {theme === 'midnight' && <p className="text-[13px] text-muted">{t.themeMidnightHint}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 id="appearance-accent" className="text-[13px] font-semibold text-muted">{t.accentLabel}</h3>
        <div role="radiogroup" aria-labelledby="appearance-accent" className="grid grid-cols-4 gap-2">
          {ACCENT_NAMES.map(accent => {
            const selected = appearance.accent === accent;
            return (
              <button
                key={accent}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update(current => ({ ...current, accent }))}
                className={clsx(
                  'flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-semibold',
                  selected ? 'bg-tile shadow-[0_0_0_2px_rgb(var(--accent-rgb))]' : 'bg-chip text-muted',
                )}
              >
                <span
                  className={clsx(`accent-${accent}`, dark && 'paper-dark', 'flex h-9 w-9 items-center justify-center rounded-full')}
                  style={{ background: 'rgb(var(--accent-rgb))' }}
                  aria-hidden="true"
                >
                  {selected && <Check size={18} strokeWidth={3} className={dark ? 'text-black' : 'text-white'} />}
                </span>
                {t[`accent_${accent}` as const]}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={appearance.accent === 'custom'}
            onClick={() =>
              update(current => ({ ...current, accent: 'custom', customAccent: current.customAccent ?? currentAccentHex() }))
            }
            className={clsx(
              'flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-semibold',
              appearance.accent === 'custom' ? 'bg-tile shadow-[0_0_0_2px_rgb(var(--accent-rgb))]' : 'bg-chip text-muted',
            )}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: customColor
                  ? `radial-gradient(circle, ${customColor} 0 55%, transparent 56%), conic-gradient(#E5484D, #F2A93B, #46A758, #2E88D8, #6E56CF, #E5484D)`
                  : 'conic-gradient(#E5484D, #F2A93B, #46A758, #2E88D8, #6E56CF, #E5484D)',
              }}
              aria-hidden="true"
            >
              {appearance.accent === 'custom' && <Check size={16} strokeWidth={3} className="text-on-accent" />}
            </span>
            {t.accent_custom}
          </button>
        </div>
        {appearance.accent === 'custom' && (
          <CustomAccentPanel
            t={t}
            hex={appearance.customAccent ?? DEFAULT_CUSTOM_ACCENT}
            dark={dark}
            onChange={hex => update(current => ({ ...current, accent: 'custom', customAccent: hex }))}
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-muted">{t.glassLabel}</h3>
        <Segmented<GlassLevel>
          ariaLabel={t.glassLabel}
          value={appearance.glass}
          onChange={glass => update(current => ({ ...current, glass }))}
          options={GLASS_LEVELS.map(glass => ({ value: glass, label: t[`glass_${glass}` as const] }))}
        />
        <p className="text-[13px] text-muted">{t.glassHint}</p>
      </section>

      {!hideLanguage && <section className="flex flex-col gap-2">
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
      </section>}
    </div>
  );
};
