import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../constants';

const enKeys = Object.keys(TRANSLATIONS.en).sort();
const srKeys = Object.keys(TRANSLATIONS.sr).sort();

describe('translation tables', () => {
  it('defines every key in both English and Serbian', () => {
    expect(srKeys.filter(key => !(key in TRANSLATIONS.en))).toEqual([]);
    expect(enKeys.filter(key => !(key in TRANSLATIONS.sr))).toEqual([]);
  });

  it('has no empty values', () => {
    for (const [language, table] of Object.entries(TRANSLATIONS)) {
      for (const [key, value] of Object.entries(table)) {
        expect(typeof value === 'string' && value.trim().length > 0, `${language}.${key}`).toBe(true);
      }
    }
  });

  it('keeps interpolation placeholders consistent between languages', () => {
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort();
    for (const key of enKeys) {
      const en = (TRANSLATIONS.en as Record<string, string>)[key];
      const sr = (TRANSLATIONS.sr as Record<string, string>)[key];
      expect(placeholders(sr), key).toEqual(placeholders(en));
    }
  });
});
