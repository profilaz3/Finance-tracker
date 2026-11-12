import { describe, expect, it } from 'vitest';
import { convertCurrency } from '../utils/currencyUtils';

describe('convertCurrency', () => {
  it('returns the original amount when converting within the same currency', () => {
    expect(convertCurrency(42, 'EUR', 'EUR', { EUR: 1, USD: 1.08, RSD: 117 })).toBe(42);
  });

  it('converts through the base rates table when both rates exist', () => {
    expect(convertCurrency(100, 'USD', 'RSD', { EUR: 1, USD: 1.08, RSD: 117 })).toBeCloseTo(10833.333333333334);
  });

  it('returns the original amount when either conversion rate is missing or zero', () => {
    expect(convertCurrency(100, 'USD', 'RSD', { EUR: 1, USD: 0, RSD: 117 })).toBe(100);
    expect(convertCurrency(100, 'USD', 'RSD', { EUR: 1, RSD: 117 } as Record<'EUR' | 'USD' | 'RSD', number>)).toBe(100);
    expect(convertCurrency(100, 'USD', 'RSD', { EUR: 1, USD: 1.08, RSD: 0 })).toBe(100);
  });
});
