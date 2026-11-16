import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCENT_NAMES, THEME_NAMES } from '../utils/appearance';
import { contrastRatio, parseHex, type Rgb } from '../utils/colorContrast';
import type { ThemeName } from '../types';

const css = readFileSync('src/theme.css', 'utf8');

/** Declarations of every rule whose selector is exactly `selector` (later rules win). */
const declarations = (selector: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const block of css.matchAll(new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const decl of block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) result[decl[1]] = decl[2].trim();
  }
  return result;
};

/** The cascade for one theme, mode and accent on the root element, in specificity order. */
const tokensFor = (theme: ThemeName, dark: boolean, accent: string): Record<string, string> => {
  const layers = [
    declarations('.theme-paper'),
    dark ? declarations('.theme-paper.paper-dark') : {},
    declarations(`.accent-${accent}`),
    dark ? declarations(`.paper-dark.accent-${accent}`) : {},
  ];
  if (theme !== 'paper') {
    layers.push(declarations(dark ? `.theme-paper.paper-dark.paper-theme-${theme}` : `.theme-paper.paper-theme-${theme}:not(.paper-dark)`));
  }
  return Object.assign({}, ...layers);
};

const resolve = (tokens: Record<string, string>, name: string, depth = 0): Rgb | null => {
  const value = tokens[name];
  if (!value || depth > 5) return null;
  const variable = /^var\((--[a-z0-9-]+)(?:,\s*(.+))?\)$/.exec(value);
  if (variable) {
    const inner = resolve(tokens, variable[1], depth + 1);
    if (inner) return inner;
    return variable[2] ? resolve({ fallback: variable[2] }, 'fallback', depth + 1) : null;
  }
  const triplet = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(value);
  if (triplet) return [Number(triplet[1]), Number(triplet[2]), Number(triplet[3])];
  const hex = value.length === 4 ? `#${[...value.slice(1)].map(c => c + c).join('')}` : value;
  return parseHex(hex);
};

/**
 * A background token, or `--top@--under` for a translucent rgba() token (the chip) painted over
 * an opaque one (the tile), composited the way the browser does.
 */
const resolveBackground = (tokens: Record<string, string>, spec: string): Rgb | null => {
  const [top, under] = spec.split('@');
  if (!under) return resolve(tokens, top);
  const base = resolve(tokens, under);
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(tokens[top] ?? '');
  if (!base || !rgba) return null;
  const alpha = Number(rgba[4]);
  return [0, 1, 2].map(i => Math.round(Number(rgba[i + 1]) * alpha + base[i] * (1 - alpha))) as Rgb;
};

// Text needs 4.5:1, UI parts 3:1 (WCAG 1.4.3 / 1.4.11). line and outline-variant are decorative.
// faint carries small text (captions, hints, chevrons), on tiles and on chips laid over a tile.
const MD = (name: string) => `--md-sys-color-${name}`;
const PAIRS: Array<[string, string, number]> = [
  ['--paper-text', '--paper-bg', 4.5],
  ['--paper-text', '--paper-tile', 4.5],
  ['--paper-muted', '--paper-tile', 4.5],
  ['--paper-muted', '--paper-bg', 4.5],
  ['--paper-faint', '--paper-tile', 4.5],
  ['--paper-faint', '--paper-chip@--paper-tile', 4.5],
  ['--paper-pos', '--paper-tile', 4.5],
  ['--paper-neg', '--paper-tile', 4.5],
  ['--paper-on-accent', '--accent-rgb', 4.5],
  ['--accent-rgb', '--paper-tile', 3],
  ['--accent-rgb', '--paper-bg', 3],
  [MD('on-surface'), MD('surface'), 4.5],
  [MD('on-surface-variant'), MD('surface'), 4.5],
  [MD('on-surface-variant'), MD('surface-container'), 4.5],
  [MD('on-surface-variant'), MD('surface-container-high'), 4.5],
  [MD('on-background'), MD('background'), 4.5],
  [MD('on-primary'), MD('primary'), 4.5],
  [MD('on-primary-container'), MD('primary-container'), 4.5],
  [MD('on-secondary-container'), MD('secondary-container'), 4.5],
  [MD('on-tertiary-container'), MD('tertiary-container'), 4.5],
  [MD('on-error-container'), MD('error-container'), 4.5],
  [MD('error'), MD('surface'), 4.5],
  [MD('tertiary'), MD('surface'), 4.5],
  [MD('outline'), MD('surface'), 3],
  [MD('outline'), MD('surface-container'), 3],
];

describe('theme accessibility', () => {
  it('defines a light and a dark block for every theme', () => {
    for (const theme of THEME_NAMES.filter(name => name !== 'paper')) {
      expect(Object.keys(declarations(`.theme-paper.paper-theme-${theme}:not(.paper-dark)`)).length).toBeGreaterThan(20);
      expect(Object.keys(declarations(`.theme-paper.paper-dark.paper-theme-${theme}`)).length).toBeGreaterThan(20);
    }
    for (const accent of ACCENT_NAMES) {
      expect(declarations(`.accent-${accent}`)['--accent-rgb']).toBeTruthy();
      expect(declarations(`.paper-dark.accent-${accent}`)['--accent-rgb']).toBeTruthy();
    }
  });

  it('meets WCAG contrast for every theme, mode and accent', () => {
    const failures: string[] = [];
    let checked = 0;
    for (const theme of THEME_NAMES) {
      for (const dark of [false, true]) {
        for (const accent of [...ACCENT_NAMES, 'custom']) {
          const tokens = tokensFor(theme, dark, accent);
          for (const [fg, bg, min] of PAIRS) {
            const a = resolve(tokens, fg);
            const b = resolveBackground(tokens, bg);
            if (!a || !b) {
              failures.push(`${theme}/${dark ? 'dark' : 'light'}/${accent} cannot resolve ${!a ? fg : bg}`);
              continue;
            }
            checked += 1;
            const ratio = contrastRatio(a, b);
            if (ratio < min) failures.push(`${theme}/${dark ? 'dark' : 'light'}/${accent} ${fg} on ${bg} ${ratio.toFixed(2)} < ${min}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBe(THEME_NAMES.length * 2 * (ACCENT_NAMES.length + 1) * PAIRS.length);
  });

  it('keeps the old Material theme classes out of the stylesheet', () => {
    expect(css).not.toMatch(/\.theme-(?!paper)[a-z-]+\s*[{,]/);
    expect(css).not.toMatch(/^:root\s*\{[^}]*--md-sys-color-primary:/m);
  });

  it('shows a focus-visible ring and does not strip focus styles from form fields', () => {
    expect(css).toContain(':focus-visible {\n  outline: 2px solid rgb(var(--md-sys-color-primary));');
    expect(css).not.toMatch(/input:focus,\s*textarea:focus,\s*select:focus\s*\{[^}]*box-shadow:\s*none/);
    expect(css).not.toMatch(/\*:focus\s*\{\s*outline:\s*none/);
  });
});
