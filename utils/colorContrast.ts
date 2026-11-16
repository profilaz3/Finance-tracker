/**
 * WCAG contrast maths and the custom accent derivation. Pure, no DOM.
 *
 * A custom accent is one hex the user picks. From it we derive a light-mode and a dark-mode
 * accent that read well on every theme's tiles (3:1, WCAG 1.4.11 for UI parts), the text
 * colour on the accent (4.5:1), a soft container tint with its own readable text, and the
 * gradient for accent cards (white text and icons, 3:1 at the lighter end).
 */

export type Rgb = [number, number, number];

const HEX = /^#?([0-9a-f]{6})$/i;

export const parseHex = (hex: string): Rgb | null => {
  const match = HEX.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const toHex = (rgb: Rgb): string =>
  `#${rgb.map(channel => clampByte(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** `"15 118 110"`: the triplet form the stylesheet uses inside rgb(). */
export const toTriplet = (rgb: Rgb): string => rgb.map(clampByte).join(' ');

export const relativeLuminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map(value => {
    const channel = clampByte(value) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export const mixRgb = (a: Rgb, b: Rgb, amount: number): Rgb => [
  a[0] + (b[0] - a[0]) * amount,
  a[1] + (b[1] - a[1]) * amount,
  a[2] + (b[2] - a[2]) * amount,
];

export type Hsl = [number, number, number];

export const rgbToHsl = ([r, g, b]: Rgb): Hsl => {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s * 100, l * 100];
};

export const hslToRgb = ([h, s, l]: Hsl): Rgb => {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + (((h % 360) + 360) % 360) / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

export const hslToHex = (hsl: Hsl): string => toHex(hslToRgb(hsl));

/**
 * Tile and background colours of every theme (src/theme.css), so a custom accent is checked
 * against the worst case and keeps working when the theme changes.
 */
export const LIGHT_SURFACES: readonly string[] = [
  '#FFFFFF', '#F3F2EE', '#EDEFF3', '#FFFCF6', '#F0E9DD', '#FBFCF9', '#EAEEE7', '#FBFDFF', '#E8EEF4', '#FFFBFB', '#F5ECEC',
];
export const DARK_SURFACES: readonly string[] = [
  '#18181A', '#0C0C0D', '#000000', '#121316', '#211D17', '#14110D', '#151B16', '#0A0E0B', '#131B24', '#090E14', '#1F181A', '#120D0E',
];

const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [12, 12, 13];
export const UI_CONTRAST = 3;
export const TEXT_CONTRAST = 4.5;

const minContrast = (rgb: Rgb, surfaces: readonly Rgb[]) => Math.min(...surfaces.map(surface => contrastRatio(rgb, surface)));

/** Moves lightness (down for light mode, up for dark) in small steps until the accent reads on every surface. */
const fitLightness = (start: Rgb, surfaces: readonly Rgb[], direction: -1 | 1): { rgb: Rgb; adjusted: boolean } => {
  if (minContrast(start, surfaces) >= UI_CONTRAST) return { rgb: start, adjusted: false };
  const [h, s, l] = rgbToHsl(start);
  for (let step = 1; step <= 100; step += 1) {
    const candidate = hslToRgb([h, s, l + direction * step]);
    if (minContrast(candidate, surfaces) >= UI_CONTRAST) return { rgb: candidate.map(clampByte) as Rgb, adjusted: true };
  }
  return { rgb: direction < 0 ? NEAR_BLACK : WHITE, adjusted: true };
};

/** White or near black, whichever reads better (one of them always reaches 4.5:1). */
export const bestTextOn = (rgb: Rgb): Rgb => (contrastRatio(WHITE, rgb) >= contrastRatio(NEAR_BLACK, rgb) ? WHITE : NEAR_BLACK);

/** Darkens (or lightens) `fg` toward `target` until it reaches `min` against `bg`. */
const readableOn = (fg: Rgb, bg: Rgb, target: Rgb, min = TEXT_CONTRAST): Rgb => {
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const candidate = mixRgb(fg, target, amount);
    if (contrastRatio(candidate, bg) >= min) return candidate.map(clampByte) as Rgb;
  }
  return target;
};

export interface AccentVariant {
  accent: Rgb;
  onAccent: Rgb;
  container: Rgb;
  onContainer: Rgb;
  adjusted: boolean;
}

export interface CustomAccent {
  hex: string;
  light: AccentVariant;
  dark: AccentVariant;
  /** Accent card gradient (white text): lighter start, darker end. */
  card: [Rgb, Rgb];
}

const LIGHT_SURFACES_RGB = LIGHT_SURFACES.map(hex => parseHex(hex)!);
const DARK_SURFACES_RGB = DARK_SURFACES.map(hex => parseHex(hex)!);
const DARK_TILE: Rgb = [24, 24, 26];

export const deriveCustomAccent = (hex: string): CustomAccent | null => {
  const base = parseHex(hex);
  if (!base) return null;

  const lightFit = fitLightness(base, LIGHT_SURFACES_RGB, -1);
  const lightContainer = mixRgb(lightFit.rgb, WHITE, 0.82).map(clampByte) as Rgb;
  const light: AccentVariant = {
    accent: lightFit.rgb,
    onAccent: bestTextOn(lightFit.rgb),
    container: lightContainer,
    onContainer: readableOn(mixRgb(lightFit.rgb, NEAR_BLACK, 0.4), lightContainer, NEAR_BLACK),
    adjusted: lightFit.adjusted,
  };

  const darkFit = fitLightness(base, DARK_SURFACES_RGB, 1);
  const darkContainer = mixRgb(DARK_TILE, darkFit.rgb, 0.26).map(clampByte) as Rgb;
  const dark: AccentVariant = {
    accent: darkFit.rgb,
    onAccent: bestTextOn(darkFit.rgb),
    container: darkContainer,
    onContainer: readableOn(mixRgb(darkFit.rgb, WHITE, 0.6), darkContainer, WHITE),
    adjusted: darkFit.adjusted,
  };

  // Card: the light accent, darkened until white text reaches 3:1 at the lighter end.
  const cardStart = readableOn(mixRgb(lightFit.rgb, WHITE, 0.08), WHITE, NEAR_BLACK, UI_CONTRAST);
  const cardEnd = mixRgb(cardStart, NEAR_BLACK, 0.4).map(clampByte) as Rgb;

  return { hex: toHex(base), light, dark, card: [cardStart, cardEnd] };
};

/** CSS custom properties for `.accent-custom` (see src/theme.css). */
export const customAccentProperties = (accent: CustomAccent): Record<string, string> => ({
  '--custom-accent': toTriplet(accent.light.accent),
  '--custom-on': toHex(accent.light.onAccent),
  '--custom-on-rgb': toTriplet(accent.light.onAccent),
  '--custom-container': toTriplet(accent.light.container),
  '--custom-on-container': toTriplet(accent.light.onContainer),
  '--custom-accent-dark': toTriplet(accent.dark.accent),
  '--custom-on-dark': toHex(accent.dark.onAccent),
  '--custom-on-dark-rgb': toTriplet(accent.dark.onAccent),
  '--custom-container-dark': toTriplet(accent.dark.container),
  '--custom-on-container-dark': toTriplet(accent.dark.onContainer),
  '--custom-card': `linear-gradient(150deg, ${toHex(accent.card[0])} 0%, ${toHex(accent.card[1])} 100%)`,
  '--custom-card-shadow': `rgb(${toTriplet(accent.light.accent)} / 0.5)`,
});
