import type { Appearance, AccentName, GlassLevel } from '../types';

export const DEFAULT_APPEARANCE: Appearance = { mode: 'system', accent: 'teal', glass: 'frosted' };

export const ACCENT_NAMES: AccentName[] = ['teal', 'ember', 'iris', 'ink'];
export const GLASS_LEVELS: GlassLevel[] = ['frosted', 'clear', 'solid'];

/** Swatches for pickers: [light, dark]. Mirrors the accent tokens in src/theme.css. */
export const ACCENT_SWATCHES: Record<AccentName, [string, string]> = {
  teal: ['#0F766E', '#2DD4BF'],
  ember: ['#B43A0A', '#FF8A5B'],
  iris: ['#4F46E5', '#9C95FF'],
  ink: ['#121212', '#F2F1EE'],
};

export const resolveAppearance = (appearance?: Partial<Appearance> | null): Appearance => ({
  mode: appearance?.mode ?? DEFAULT_APPEARANCE.mode,
  accent: appearance?.accent ?? DEFAULT_APPEARANCE.accent,
  glass: appearance?.glass ?? DEFAULT_APPEARANCE.glass,
});

export const isDarkAppearance = (appearance: Appearance, systemPrefersDark: boolean): boolean =>
  appearance.mode === 'dark' || (appearance.mode === 'system' && systemPrefersDark);

/** Root classes for the paper design; every old `theme-*` class is replaced. */
export function getAppearanceClasses(appearance: Appearance, systemPrefersDark: boolean): string[] {
  const classes = ['theme-paper', `accent-${appearance.accent}`, `glass-${appearance.glass}`];
  if (isDarkAppearance(appearance, systemPrefersDark)) classes.push('paper-dark');
  return classes;
}

const MANAGED_PREFIXES = ['theme-', 'accent-', 'glass-', 'paper-'];

export function applyAppearanceToRoot(root: HTMLElement, appearance: Appearance, systemPrefersDark: boolean): void {
  [...root.classList].forEach(cls => {
    if (MANAGED_PREFIXES.some(prefix => cls.startsWith(prefix))) root.classList.remove(cls);
  });
  root.classList.add(...getAppearanceClasses(appearance, systemPrefersDark));

  const dark = isDarkAppearance(appearance, systemPrefersDark);
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="theme-color"]') : null;
  meta?.setAttribute('content', dark ? '#0C0C0D' : '#F3F2EE');
  syncSystemBars(dark);
}

/** On Android, match the status and navigation bar icons to the app theme, not the system's. */
function syncSystemBars(dark: boolean): void {
  if (typeof window === 'undefined') return;
  import('@capacitor/core')
    .then(({ Capacitor, SystemBars, SystemBarsStyle }) => {
      if (!Capacitor.isNativePlatform()) return;
      return SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
    })
    .catch(() => {
      // Cosmetic only.
    });
}
