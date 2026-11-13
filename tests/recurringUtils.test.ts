import { describe, expect, it } from 'vitest';
import { calculateNextDueDate, getDueOccurrences, getOccurrenceTimestamp, isDue } from '../utils/recurringUtils';
import type { RecurringTransaction } from '../types';

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

  it('returns to the anchor day after a short month instead of drifting (M7)', () => {
    let date = '2026-01-31';
    const sequence = [date];
    for (let i = 0; i < 4; i++) {
      date = calculateNextDueDate(date, 'monthly', '2026-01-31');
      sequence.push(date);
    }
    expect(sequence).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('keeps leap-day yearly anchors on Feb 29 in leap years', () => {
    expect(calculateNextDueDate('2027-02-28', 'yearly', '2024-02-29')).toBe('2028-02-29');
  });

  it('accepts full ISO strings as anchors', () => {
    expect(calculateNextDueDate('2026-02-28', 'monthly', '2026-01-31T00:00:00.000Z')).toBe('2026-03-31');
  });
});

describe('catch-up occurrences', () => {
  const recurring = (overrides: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
    id: 'r',
    name: 'Rent',
    amount: 100,
    currency: 'EUR',
    categoryId: 'c3',
    accountId: 'acc',
    type: 'expense',
    frequency: 'monthly',
    startDate: '2026-01-31',
    nextDue: '2026-01-31',
    isActive: true,
    ...overrides,
  } as RecurringTransaction);

  it('returns every missed occurrence with its real due date', () => {
    const result = getDueOccurrences(recurring(), new Date(2026, 3, 30, 9));
    expect(result.dueDates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(result.nextDue).toBe('2026-05-31');
  });

  it('stops at the end date but still catches up occurrences before it', () => {
    const r = recurring({ endDate: '2026-03-15' });
    expect(isDue(r, new Date(2026, 5, 1))).toBe(true);
    expect(getDueOccurrences(r, new Date(2026, 5, 1)).dueDates).toEqual(['2026-01-31', '2026-02-28']);
    expect(isDue({ ...r, nextDue: '2026-03-31' }, new Date(2026, 5, 1))).toBe(false);
  });

  it('dates past occurrences on their own local day', () => {
    const now = new Date(2026, 3, 30, 9);
    const stamp = new Date(getOccurrenceTimestamp('2026-02-28', now));
    expect([stamp.getFullYear(), stamp.getMonth(), stamp.getDate()]).toEqual([2026, 1, 28]);
    expect(getOccurrenceTimestamp('2026-04-30', now)).toBe(now.toISOString());
  });
});
