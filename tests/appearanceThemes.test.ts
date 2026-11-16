import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_NAMES,
  DEFAULT_APPEARANCE,
  THEME_DEFAULT_ACCENT,
  THEME_NAMES,
  getAppearanceClasses,
  getThemeScopeClasses,
  resolveAppearance,
  withTheme,
} from '../utils/appearance';
import {
  DARK_SURFACES,
  LIGHT_SURFACES,
  contrastRatio,
  customAccentProperties,
  deriveCustomAccent,
  hslToRgb,
  parseHex,
  rgbToHsl,
  toHex,
  toTriplet,
} from '../utils/colorContrast';
import { parseSettingsPrefs } from '../utils/settingsPrefs';
import { buildSettingsSyncPayload } from '../utils/settingsSync';
import type { Appearance } from '../types';

const WHITE = parseHex('#FFFFFF')!;
const surfaces = (list: readonly string[]) => list.map(hex => parseHex(hex)!);

describe('colorContrast', () => {
  it('parses and formats hex', () => {
    expect(parseHex('#0f766e')).toEqual([15, 118, 110]);
    expect(parseHex('0F766E')).toEqual([15, 118, 110]);
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('red')).toBeNull();
    expect(toHex([15, 118, 110])).toBe('#0F766E');
    expect(toHex([300, -4, 127.6])).toBe('#FF0080');
    expect(toTriplet([15.4, 118, 110])).toBe('15 118 110');
  });

  it('matches known WCAG ratios', () => {
    expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    expect(contrastRatio(parseHex('#767676')!, WHITE)).toBeCloseTo(4.54, 2);
  });

  it('round trips HSL', () => {
    for (const hex of ['#0F766E', '#E5484D', '#6E56CF', '#808080']) {
      expect(toHex(hslToRgb(rgbToHsl(parseHex(hex)!)))).toBe(hex);
    }
  });

  it.each(['#0F766E', '#FFF176', '#FFFFFF', '#000000', '#00FF00', '#1A1A1A', '#FF00FF', '#7F7F7F'])(
    'derives a readable custom accent from %s',
    hex => {
      const derived = deriveCustomAccent(hex)!;
      for (const surface of surfaces(LIGHT_SURFACES)) expect(contrastRatio(derived.light.accent, surface)).toBeGreaterThanOrEqual(3);
      for (const surface of surfaces(DARK_SURFACES)) expect(contrastRatio(derived.dark.accent, surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(derived.light.onAccent, derived.light.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.dark.onAccent, derived.dark.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.light.onContainer, derived.light.container)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.dark.onContainer, derived.dark.container)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(WHITE, derived.card[0])).toBeGreaterThanOrEqual(3);
    },
  );

  it('says when it had to move the colour', () => {
    const pale = deriveCustomAccent('#FFF176')!;
    expect(pale.light.adjusted).toBe(true);
    expect(pale.dark.adjusted).toBe(false);
    const deep = deriveCustomAccent('#1A237E')!;
    expect(deep.light.adjusted).toBe(false);
    expect(deep.dark.adjusted).toBe(true);
    expect(deriveCustomAccent('#0A62A6')!.light.adjusted).toBe(false);
    expect(deriveCustomAccent('nope')).toBeNull();
  });

  it('emits every custom property the stylesheet reads', () => {
    const properties = customAccentProperties(deriveCustomAccent('#C23B78')!);
    const css = readFileSync('src/theme.css', 'utf8');
    const read = [...new Set([...css.matchAll(/var\((--custom-[a-z-]+)/g)].map(match => match[1]))].sort();
    expect(Object.keys(properties).sort()).toEqual(read);
    expect(properties['--custom-accent']).toMatch(/^\d+ \d+ \d+$/);
    expect(properties['--custom-on']).toMatch(/^#[0-9A-F]{6}$/);
    expect(properties['--custom-card']).toMatch(/^linear-gradient\(150deg, #[0-9A-F]{6} 0%, #[0-9A-F]{6} 100%\)$/);
  });
});

describe('appearance', () => {
  it('loads old saves without a theme as paper, unchanged otherwise', () => {
    expect(resolveAppearance({ mode: 'dark', accent: 'iris', glass: 'clear' })).toEqual({
      mode: 'dark',
      theme: 'paper',
      accent: 'iris',
      glass: 'clear',
    });
    expect(resolveAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it('drops unknown values', () => {
    const resolved = resolveAppearance({ mode: 'neon', theme: 'vapor', accent: 'gold', glass: 'mirror' } as unknown as Appearance);
    expect(resolved).toEqual({ mode: 'system', theme: 'paper', accent: 'teal', glass: 'frosted' });
    expect(resolveAppearance({ theme: 'forest', accent: 'gold' } as unknown as Appearance).accent).toBe('moss');
  });

  it('needs a valid hex for the custom accent', () => {
    expect(resolveAppearance({ theme: 'ocean', accent: 'custom' }).accent).toBe('sky');
    expect(resolveAppearance({ accent: 'custom', customAccent: 'blue' }).accent).toBe('teal');
    expect(resolveAppearance({ accent: 'custom', customAccent: '#ff8800' })).toMatchObject({ accent: 'custom', customAccent: '#FF8800' });
  });

  it('moves the accent with the theme only when it was the theme default', () => {
    const base = resolveAppearance({ theme: 'paper', accent: 'teal' });
    expect(withTheme(base, 'rose')).toMatchObject({ theme: 'rose', accent: 'berry' });
    expect(withTheme(withTheme(base, 'rose'), 'forest')).toMatchObject({ theme: 'forest', accent: 'moss' });
    const chosen = resolveAppearance({ theme: 'paper', accent: 'amber' });
    expect(withTheme(chosen, 'ocean')).toMatchObject({ theme: 'ocean', accent: 'amber' });
    const custom = resolveAppearance({ accent: 'custom', customAccent: '#123456' });
    expect(withTheme(custom, 'sand')).toMatchObject({ accent: 'custom', customAccent: '#123456' });
  });

  it('has a named default accent for every theme', () => {
    for (const theme of THEME_NAMES) expect(ACCENT_NAMES).toContain(THEME_DEFAULT_ACCENT[theme]);
    expect(ACCENT_NAMES).toHaveLength(10);
  });

  it('builds root and preview classes', () => {
    expect(getAppearanceClasses(DEFAULT_APPEARANCE, false)).toEqual(['theme-paper', 'accent-teal', 'glass-frosted']);
    expect(getAppearanceClasses(DEFAULT_APPEARANCE, true)).toContain('paper-dark');
    expect(getAppearanceClasses({ mode: 'light', theme: 'midnight', accent: 'custom', customAccent: '#112233', glass: 'solid' }, true)).toEqual([
      'theme-paper',
      'accent-custom',
      'glass-solid',
      'paper-theme-midnight',
    ]);
    expect(getThemeScopeClasses('sand', 'ember', true)).toEqual(['theme-paper', 'accent-ember', 'paper-theme-sand', 'paper-dark']);
    expect(getThemeScopeClasses('paper', 'teal', false)).toEqual(['theme-paper', 'accent-teal']);
  });

  it('round trips theme and custom accent through settings sync', () => {
    const appearance: Appearance = { mode: 'dark', theme: 'midnight', accent: 'custom', customAccent: '#A0640A', glass: 'clear' };
    const payload = buildSettingsSyncPayload({
      baseCurrency: 'RSD',
      language: 'sr',
      userProfile: undefined,
      appearance,
      homeLayout: undefined,
      budget: null,
      paymentDetails: null,
    } as Parameters<typeof buildSettingsSyncPayload>[0]);
    const parsed = parseSettingsPrefs(JSON.parse(JSON.stringify(payload.prefs)));
    expect(parsed.appearance).toEqual(appearance);
  });

  it('keeps an old synced appearance and repairs a bad theme', () => {
    expect(parseSettingsPrefs({ appearance: { mode: 'light', accent: 'ember', glass: 'solid' } }).appearance).toEqual({
      mode: 'light',
      accent: 'ember',
      glass: 'solid',
    });
    const repaired = parseSettingsPrefs({ appearance: { mode: 'light', theme: 'vapor', accent: 'sky', glass: 'solid' } }).appearance;
    expect(resolveAppearance(repaired)).toMatchObject({ theme: 'paper', accent: 'sky' });
  });
});
