import { afterEach, describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMediumDate,
  formatMoney,
  formatMonthYear,
  formatNumber,
  formatShortDate,
  getAppLanguage,
  getIntlLocale,
  setAppLanguage,
} from '../utils/locale';
import { formatCurrency } from '../utils/formatters';

// Intl may use a narrow no-break space (U+202F) or no-break space (U+00A0); normalise for assertions.
const n = (value: string) => value.replace(/[  ]/g, ' ');

// Noon local time avoids any timezone edge in the date assertions.
const SAMPLE_DATE = new Date(2026, 10, 13, 14, 5);

describe('locale mapping', () => {
  afterEach(() => setAppLanguage('en'));

  it('maps app languages to Intl locales', () => {
    expect(getIntlLocale('en')).toBe('en-GB');
    expect(getIntlLocale('sr')).toBe('sr-Latn-RS');
  });

  it('tracks the current app language', () => {
    setAppLanguage('sr');
    expect(getAppLanguage()).toBe('sr');
    expect(getIntlLocale()).toBe('sr-Latn-RS');
  });
});

describe('formatMoney', () => {
  it('formats EUR in English and Serbian', () => {
    expect(n(formatMoney(1234.5, 'EUR', 'en'))).toBe('€1,234.50');
    expect(n(formatMoney(1234.5, 'EUR', 'sr'))).toBe('1.234,50 €');
  });

  it('formats RSD in English and Serbian', () => {
    expect(n(formatMoney(98765.4, 'RSD', 'en'))).toBe('RSD 98,765.40');
    expect(n(formatMoney(98765.4, 'RSD', 'sr'))).toBe('98.765,40 RSD');
  });

  it('uses a plain $ symbol for USD in both languages', () => {
    expect(n(formatMoney(10, 'USD', 'en'))).toBe('$10.00');
    expect(n(formatMoney(10, 'USD', 'sr'))).toBe('10,00 $');
  });

  it('formats negatives and guards against non-finite input', () => {
    expect(n(formatMoney(-5, 'EUR', 'en'))).toBe('-€5.00');
    expect(n(formatMoney(Number.NaN, 'EUR', 'sr'))).toBe('0,00 €');
  });

  it('formatCurrency follows the current app language by default', () => {
    setAppLanguage('sr');
    expect(n(formatCurrency(1234.5, 'EUR'))).toBe('1.234,50 €');
    setAppLanguage('en');
    expect(n(formatCurrency(1234.5, 'EUR'))).toBe('€1,234.50');
  });
});

describe('formatNumber', () => {
  it('uses locale grouping and decimal separators', () => {
    expect(formatNumber(1234567.891, { maximumFractionDigits: 2 }, 'en')).toBe('1,234,567.89');
    expect(formatNumber(1234567.891, { maximumFractionDigits: 2 }, 'sr')).toBe('1.234.567,89');
  });
});

describe('date formatting', () => {
  it('formats short dates', () => {
    expect(formatShortDate(SAMPLE_DATE, 'en')).toBe('13 Nov');
    expect(formatShortDate(SAMPLE_DATE, 'sr')).toBe('13. nov');
  });

  it('formats medium dates', () => {
    expect(formatMediumDate(SAMPLE_DATE, 'en')).toBe('13 Nov 2026');
    expect(n(formatMediumDate(SAMPLE_DATE, 'sr'))).toBe('13. nov 2026.');
  });

  it('formats month and year with Serbian month names in Latin script', () => {
    expect(formatMonthYear(SAMPLE_DATE, 'en')).toBe('November 2026');
    expect(formatMonthYear(SAMPLE_DATE, 'sr')).toBe('novembar 2026.');
  });

  it('formats date and time with a 24-hour clock in both languages', () => {
    expect(n(formatDateTime(SAMPLE_DATE, 'en'))).toBe('13 Nov 2026, 14:05');
    expect(n(formatDateTime(SAMPLE_DATE, 'sr'))).toBe('13. 11. 2026. 14:05');
  });

  it('accepts ISO strings and returns an empty string for invalid dates', () => {
    expect(formatDate('2026-11-13T12:00:00', { weekday: 'long' }, 'sr')).toBe('petak');
    expect(formatDate('not a date', undefined, 'en')).toBe('');
  });
});
