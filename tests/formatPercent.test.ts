import { describe, expect, it } from 'vitest';
import { formatDecimal, formatPercent } from '../utils/locale';

describe('formatPercent / formatDecimal', () => {
  it('uses the locale decimal separator', () => {
    expect(formatPercent(12.345, 1, 'en')).toBe('12.3%');
    expect(formatPercent(12.345, 1, 'sr')).toBe('12,3%');
    expect(formatDecimal(1234.5, 2, 'sr')).toBe('1.234,50');
    expect(formatDecimal(1234.5, 2, 'en')).toBe('1,234.50');
  });

  it('treats non-finite input as zero', () => {
    expect(formatPercent(Number.NaN, 0, 'en')).toBe('0%');
  });
});
