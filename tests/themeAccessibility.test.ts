import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/theme.css', 'utf8');

type Rgb = [number, number, number];

const parseThemes = (): Record<string, Record<string, Rgb>> => {
  const themes: Record<string, Record<string, Rgb>> = {};
  for (const block of css.matchAll(/(:root|\.theme-[a-z-]+)\s*\{([^}]*)\}/g)) {
    const tokens: Record<string, Rgb> = {};
    for (const decl of block[2].matchAll(/--md-sys-color-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)/g)) {
      tokens[decl[1]] = [Number(decl[2]), Number(decl[3]), Number(decl[4])];
    }
    if (Object.keys(tokens).length) themes[block[1]] = tokens;
  }
  return themes;
};

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text pairs need 4.5:1 and UI boundaries (outline, focus ring) 3:1 (WCAG 1.4.3 / 1.4.11).
// outline-variant is MD3's decorative divider colour and is intentionally not checked.
const PAIRS: Array<[string, string, number]> = [
  ['on-surface', 'surface', 4.5],
  ['on-surface-variant', 'surface', 4.5],
  ['on-surface-variant', 'surface-container', 4.5],
  ['on-surface-variant', 'surface-container-high', 4.5],
  ['on-surface-variant', 'surface-container-highest', 4.5],
  ['primary', 'surface', 4.5],
  ['primary', 'surface-container', 4.5],
  ['primary', 'surface-container-high', 4.5],
  ['secondary', 'surface', 4.5],
  ['tertiary', 'surface', 4.5],
  ['tertiary', 'surface-container', 4.5],
  ['error', 'surface', 4.5],
  ['error', 'surface-container', 4.5],
  ['warning', 'surface', 4.5],
  ['on-primary', 'primary', 4.5],
  ['on-primary-container', 'primary-container', 4.5],
  ['on-secondary', 'secondary', 4.5],
  ['on-secondary-container', 'secondary-container', 4.5],
  ['on-tertiary-container', 'tertiary-container', 4.5],
  ['on-error', 'error', 4.5],
  ['on-error-container', 'error-container', 4.5],
  ['on-warning', 'warning', 4.5],
  ['outline', 'surface', 3],
  ['outline', 'surface-container', 3],
];

describe('theme accessibility (H12)', () => {
  it('meets WCAG contrast for text and UI boundaries in every theme', () => {
    const themes = parseThemes();
    expect(Object.keys(themes).length).toBeGreaterThanOrEqual(16);

    const failures: string[] = [];
    for (const [selector, own] of Object.entries(themes)) {
      const tokens = { ...themes[':root'], ...own };
      for (const [fg, bg, min] of PAIRS) {
        if (!tokens[fg] || !tokens[bg]) continue;
        const ratio = contrast(tokens[fg], tokens[bg]);
        if (ratio < min) failures.push(`${selector} ${fg}/${bg} ${ratio.toFixed(2)} < ${min}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('shows a focus-visible ring and does not strip focus styles from form fields', () => {
    expect(css).toContain(':focus-visible {\n  outline: 2px solid rgb(var(--md-sys-color-primary));');
    expect(css).not.toMatch(/input:focus,\s*textarea:focus,\s*select:focus\s*\{[^}]*box-shadow:\s*none/);
    expect(css).not.toMatch(/\*:focus\s*\{\s*outline:\s*none/);
  });
});
