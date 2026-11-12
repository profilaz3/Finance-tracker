import { describe, expect, it } from 'vitest';
import { calculateNextDueDate } from '../utils/recurringUtils';

describe('calculateNextDueDate', () => {
  it('keeps the same day-of-month for normal monthly recurrences', () => {
    expect(calculateNextDueDate('2026-04-05', 'monthly')).toBe('2026-05-05');
  });

  it('clamps monthly recurrences to the last valid day when the next month is shorter', () => {
    expect(calculateNextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });

  it('clamps yearly recurrences for leap day anniversaries', () => {
    expect(calculateNextDueDate('2024-02-29', 'yearly')).toBe('2025-02-28');
  });
});
