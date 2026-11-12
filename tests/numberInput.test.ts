import { describe, expect, it } from 'vitest';
import { parseOptionalNumberInput, parseRequiredNumberInput } from '../utils/numberInput';

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
