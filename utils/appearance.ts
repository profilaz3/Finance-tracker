import type { Appearance, AccentName, GlassLevel, NamedAccent, ThemeName } from '../types';
import { CONFIG } from '../config';

export const DEFAULT_APPEARANCE: Appearance = { mode: 'system', theme: 'paper', accent: 'teal', glass: 'frosted' };

/** Palettes live in src/theme.css (`paper-theme-<name>`); this is only the list and each one's default accent. */
export const THEME_NAMES: ThemeName[] = ['paper', 'midnight', 'sand', 'forest', 'ocean', 'rose'];
export const THEME_DEFAULT_ACCENT: Record<ThemeName, NamedAccent> = {
  paper: 'teal',
  midnight: 'iris',
  sand: 'ember',
  forest: 'moss',
  ocean: 'sky',
  rose: 'berry',
};

/** Accent colours live in src/theme.css (`accent-<name>`); swatches render with those classes. */
export const ACCENT_NAMES: NamedAccent[] = ['teal', 'moss', 'sky', 'iris', 'grape', 'berry', 'ember', 'amber', 'cocoa', 'ink'];
export const GLASS_LEVELS: GlassLevel[] = ['frosted', 'clear', 'solid'];
export const DEFAULT_CUSTOM_ACCENT = '#0F766E';

const isTheme = (value: unknown): value is ThemeName => THEME_NAMES.includes(value as ThemeName);
const isAccent = (value: unknown): value is AccentName =>
  value === 'custom' || ACCENT_NAMES.includes(value as NamedAccent);
const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** Fills gaps and drops unknown values, so old saves and values from newer versions still load. */
export const resolveAppearance = (appearance?: Partial<Appearance> | null): Appearance => {
  const mode = appearance?.mode === 'light' || appearance?.mode === 'dark' || appearance?.mode === 'system'
    ? appearance.mode
    : DEFAULT_APPEARANCE.mode;
  const glass = GLASS_LEVELS.includes(appearance?.glass as GlassLevel) ? (appearance!.glass as GlassLevel) : DEFAULT_APPEARANCE.glass;
  const theme = isTheme(appearance?.theme) ? appearance.theme : 'paper';
  const customAccent = isHex(appearance?.customAccent) ? appearance.customAccent.toUpperCase() : undefined;
  let accent: AccentName = isAccent(appearance?.accent) ? appearance.accent : THEME_DEFAULT_ACCENT[theme];
  if (accent === 'custom' && !customAccent) accent = THEME_DEFAULT_ACCENT[theme];
  return { mode, theme, accent, glass, ...(customAccent ? { customAccent } : {}) };
};

/**
 * Picking a theme also moves the accent to that theme's own, unless the user chose an accent
 * of their own (anything other than the current theme's default).
 */
export const withTheme = (appearance: Appearance, theme: ThemeName): Appearance => {
  const current = appearance.theme ?? 'paper';
  const keepAccent = appearance.accent !== THEME_DEFAULT_ACCENT[current];
  return { ...appearance, theme, accent: keepAccent ? appearance.accent : THEME_DEFAULT_ACCENT[theme] };
};

export const isDarkAppearance = (appearance: Appearance, systemPrefersDark: boolean): boolean =>
  appearance.mode === 'dark' || (appearance.mode === 'system' && systemPrefersDark);

/** Root classes for the paper design. */
export function getAppearanceClasses(appearance: Appearance, systemPrefersDark: boolean): string[] {
  const theme = appearance.theme ?? 'paper';
  const classes = ['theme-paper', `accent-${appearance.accent}`, `glass-${appearance.glass}`];
  if (theme !== 'paper') classes.push(`paper-theme-${theme}`);
  if (isDarkAppearance(appearance, systemPrefersDark)) classes.push('paper-dark');
  return classes;
}

/** Classes that draw an element with another theme's tokens (theme gallery previews). */
export function getThemeScopeClasses(theme: ThemeName, accent: AccentName, dark: boolean): string[] {
  const classes = ['theme-paper', `accent-${accent}`];
  if (theme !== 'paper') classes.push(`paper-theme-${theme}`);
  if (dark) classes.push('paper-dark');
  return classes;
}

// The derivation is loaded on demand to keep it out of the startup bundle; the last result is
// cached so a custom accent paints on the first frame after a reload.
const CUSTOM_CACHE_KEY = `${CONFIG.STORAGE_KEY}:custom-accent`;
let wantedCustomHex: string | null = null;

/** `--custom-*` properties on <html> feed `.accent-custom` in src/theme.css. */
const setProperties = (root: HTMLElement, properties: Record<string, unknown>) => {
  for (const [name, value] of Object.entries(properties)) {
    if (name.startsWith('--custom-') && typeof value === 'string') root.style.setProperty(name, value);
  }
};

function applyCustomAccent(root: HTMLElement, hex: string | null): void {
  wantedCustomHex = hex;
  if (!hex) {
    [...root.style].filter(name => name.startsWith('--custom-')).forEach(name => root.style.removeProperty(name));
    return;
  }
  try {
    const cached = JSON.parse(localStorage.getItem(CUSTOM_CACHE_KEY) || 'null');
    if (cached?.hex === hex && cached.properties && typeof cached.properties === 'object') {
      setProperties(root, cached.properties);
      return;
    }
  } catch {
    // Derive below.
  }
  import('./colorContrast')
    .then(({ deriveCustomAccent, customAccentProperties }) => {
      const derived = deriveCustomAccent(hex);
      if (!derived || wantedCustomHex !== hex) return;
      const properties = customAccentProperties(derived);
      setProperties(root, properties);
      try {
        localStorage.setItem(CUSTOM_CACHE_KEY, JSON.stringify({ hex, properties }));
      } catch {
        // The cache only saves a frame.
      }
    })
    .catch(() => {
      // The stylesheet falls back to teal.
    });
}

const MANAGED_PREFIXES = ['theme-', 'accent-', 'glass-', 'paper-'];
const FALLBACK_BAR = { light: '#F3F2EE', dark: '#0C0C0D' };

export function applyAppearanceToRoot(root: HTMLElement, appearance: Appearance, systemPrefersDark: boolean): void {
  const next = getAppearanceClasses(appearance, systemPrefersDark);
  const current = [...root.classList].filter(cls => MANAGED_PREFIXES.some(prefix => cls.startsWith(prefix)));
  const unchanged = current.length === next.length && next.every(cls => root.classList.contains(cls));
  if (!unchanged) {
    current.forEach(cls => root.classList.remove(cls));
    root.classList.add(...next);
  }

  applyCustomAccent(root, appearance.accent === 'custom' && appearance.customAccent ? appearance.customAccent : null);

  const dark = isDarkAppearance(appearance, systemPrefersDark);
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="theme-color"]');
    // The stylesheet owns the colours: read the active theme's background back.
    const background = typeof getComputedStyle === 'function' ? getComputedStyle(root).getPropertyValue('--paper-bg').trim() : '';
    meta?.setAttribute('content', background || FALLBACK_BAR[dark ? 'dark' : 'light']);
  }
  syncSystemBars(dark);
}

/** The preferences segment in localStorage, read before React renders so the first paint has the right theme. */
export function readStoredAppearance(storageKey: string): Appearance {
  try {
    const raw = localStorage.getItem(`${storageKey}:preferences`);
    const parsed = raw ? JSON.parse(raw) : null;
    return resolveAppearance(parsed && typeof parsed === 'object' ? parsed.appearance : null);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

let barsDark = false;
let statusBarOverColour = false;
let barsQueue: Promise<unknown> = Promise.resolve();

/**
 * The Home header runs under the status bar on phones: while it does, the status bar gets light
 * icons and the paper scrim steps aside (`html[data-hero-bar]`). Off restores the theme's icons.
 */
export function setStatusBarOverColour(on: boolean): void {
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-hero-bar', on);
  if (statusBarOverColour === on) return;
  statusBarOverColour = on;
  syncSystemBars(barsDark);
}

/** On Android, match the status and navigation bar icons to the app theme, not the system's. */
function syncSystemBars(dark: boolean): void {
  barsDark = dark;
  if (typeof window === 'undefined') return;
  // Calls run in order, so a quick on/off never leaves the older style on top.
  barsQueue = barsQueue
    .then(() => import('@capacitor/core'))
    .then(async ({ Capacitor, SystemBars, SystemBarsStyle, SystemBarType }) => {
      if (!Capacitor.isNativePlatform()) return;
      await SystemBars.setStyle({ style: barsDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
      if (statusBarOverColour && !barsDark) {
        await SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar });
      }
    })
    .catch(() => {
      // Cosmetic only.
    });
}
