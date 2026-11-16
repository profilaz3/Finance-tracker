import { describe, expect, it } from 'vitest';
import { formatAmountForInput, parseAmountInput, parseOptionalNumberInput, parseRequiredNumberInput } from '../utils/numberInput';

describe('number input parsing', () => {
  describe('parseRequiredNumberInput', () => {
    it('returns the parsed finite number for valid input', () => {
      expect(parseRequiredNumberInput('12.34')).toBe(12.34);
      expect(parseRequiredNumberInput('-5')).toBe(-5);
    });

    it('returns 0 for empty input', () => {
      expect(parseRequiredNumberInput('')).toBe(0);
      expect(parseRequiredNumberInput('   ')).toBe(0);
    });

    it('returns 0 for invalid input', () => {
      expect(parseRequiredNumberInput('not-a-number')).toBe(0);
      expect(parseRequiredNumberInput('Infinity')).toBe(0);
    });
  });

  describe('parseOptionalNumberInput', () => {
    it('returns the parsed finite number for valid input', () => {
      expect(parseOptionalNumberInput('12.34')).toBe(12.34);
      expect(parseOptionalNumberInput('-5')).toBe(-5);
    });

    it('returns undefined for empty input', () => {
      expect(parseOptionalNumberInput('')).toBeUndefined();
      expect(parseOptionalNumberInput('   ')).toBeUndefined();
    });

    it('returns undefined for invalid input', () => {
      expect(parseOptionalNumberInput('not-a-number')).toBeUndefined();
      expect(parseOptionalNumberInput('Infinity')).toBeUndefined();
    });
  });
});

describe('parseAmountInput', () => {
  it('reads plain, comma and dot decimals', () => {
    expect(parseAmountInput('1500')).toBe(1500);
    expect(parseAmountInput('1500,50')).toBe(1500.5);
    expect(parseAmountInput('1500.50')).toBe(1500.5);
    expect(parseAmountInput('-20')).toBe(-20);
    expect(parseAmountInput('−20,5')).toBe(-20.5);
    expect(parseAmountInput('+7')).toBe(7);
  });

  it('reads thousands separators in either convention', () => {
    expect(parseAmountInput('1.500,50')).toBe(1500.5);
    expect(parseAmountInput('1,500.50')).toBe(1500.5);
    expect(parseAmountInput('1 500,50')).toBe(1500.5);
    expect(parseAmountInput('1 500')).toBe(1500);
    expect(parseAmountInput('1.234.567')).toBe(1234567);
    expect(parseAmountInput('1,234,567')).toBe(1234567);
  });

  it('rejects empty or unreadable text', () => {
    expect(parseAmountInput('')).toBeUndefined();
    expect(parseAmountInput('  ')).toBeUndefined();
    expect(parseAmountInput('abc')).toBeUndefined();
    expect(parseAmountInput('12a')).toBeUndefined();
    expect(parseAmountInput(',')).toBeUndefined();
    expect(parseAmountInput('1,2.3,4')).toBeUndefined();
  });
});

describe('parseAmountInput with a language', () => {
  it('reads a lone grouping mark before three digits as thousands', () => {
    expect(parseAmountInput('2.000', 'sr')).toBe(2000);
    expect(parseAmountInput('60.000', 'sr')).toBe(60000);
    expect(parseAmountInput('1,500', 'en')).toBe(1500);
  });

  it('keeps decimals that are not three digits, and the other mark as a decimal', () => {
    expect(parseAmountInput('1.5', 'sr')).toBe(1.5);
    expect(parseAmountInput('32,40', 'en')).toBe(32.4);
    expect(parseAmountInput('1,500', 'sr')).toBe(1.5);
    expect(parseAmountInput('1.500', 'en')).toBe(1.5);
    expect(parseAmountInput('1500,50', 'sr')).toBe(1500.5);
    expect(parseAmountInput('1.500,50', 'en')).toBe(1500.5);
  });
});

describe('formatAmountForInput', () => {
  it('uses the language decimal mark and trims trailing zeros', () => {
    expect(formatAmountForInput(13550, 'en')).toBe('13550');
    expect(formatAmountForInput(2887.6, 'en')).toBe('2887.6');
    expect(formatAmountForInput(2887.6, 'sr')).toBe('2887,6');
    expect(formatAmountForInput(-12.346, 'en')).toBe('-12.35');
  });
});
