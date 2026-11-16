import { describe, expect, it } from 'vitest';
import type { RecurringTransaction } from '../types';
import { dayKey, getRecurringOccurrences, heatLevel, monthGrid } from '../domain/calendar';

process.env.TZ = 'Europe/Belgrade';

const rule = (overrides: Partial<RecurringTransaction>): RecurringTransaction => ({
  id: 'r1',
  name: 'Rent',
  amount: 55000,
  currency: 'RSD',
  categoryId: 'housing',
  accountId: 'bank',
  type: 'expense',
  frequency: 'monthly',
  startDate: '2026-01-05',
  nextDue: '2026-12-05',
  isActive: true,
  ...overrides,
});

describe('calendar month grid', () => {
  it('runs Monday to Sunday around the month', () => {
    const days = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(dayKey(days[0])).toBe('2026-10-26');
    expect(dayKey(days[days.length - 1])).toBe('2026-12-06');
    expect(days).toHaveLength(42);
    expect(days.every((day, index) => index === 0 || day.getTime() > days[index - 1].getTime())).toBe(true);
  });

  it('needs no padding when the month starts on a Monday and ends on a Sunday', () => {
    const days = monthGrid(2027, 1); // February 2027: Monday 1st to Sunday 28th
    expect(dayKey(days[0])).toBe('2027-02-01');
    expect(dayKey(days[days.length - 1])).toBe('2027-02-28');
    expect(days).toHaveLength(28);
  });

  it('has one cell per day across the DST change', () => {
    const days = monthGrid(2026, 2); // March 2026, clocks go forward on the 29th
    expect(new Set(days.map(dayKey)).size).toBe(days.length);
    expect(days.map(dayKey)).toContain('2026-03-29');
    expect(days.map(dayKey)).toContain('2026-03-30');
  });
});

describe('recurring occurrences', () => {
  it('lists every weekly occurrence in range, starting at nextDue', () => {
    const occurrences = getRecurringOccurrences(
      [rule({ id: 'gym', name: 'Gym', frequency: 'weekly', startDate: '2026-11-02', nextDue: '2026-11-16' })],
      new Date(2026, 10, 15),
      new Date(2026, 11, 6),
    );
    expect(occurrences.map(item => dayKey(item.due))).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
  });

  it('keeps the anchor day for monthly rules and sorts across rules', () => {
    const occurrences = getRecurringOccurrences(
      [
        rule({ id: 'rent', nextDue: '2026-11-30', startDate: '2026-01-31' }),
        rule({ id: 'salary', name: 'Salary', type: 'income', nextDue: '2026-12-01', startDate: '2026-01-01' }),
      ],
      new Date(2026, 10, 15),
      new Date(2027, 1, 28),
    );
    expect(occurrences.map(item => `${item.recurring.id}:${dayKey(item.due)}`)).toEqual([
      'rent:2026-11-30',
      'salary:2026-12-01',
      'rent:2026-12-31',
      'salary:2027-01-01',
      'rent:2027-01-31',
      'salary:2027-02-01',
      'rent:2027-02-28',
    ]);
  });

  it('skips paused rules, stops at the end date and leaves out days before the range', () => {
    const occurrences = getRecurringOccurrences(
      [
        rule({ id: 'paused', isActive: false, nextDue: '2026-11-20' }),
        rule({ id: 'ending', frequency: 'weekly', nextDue: '2026-11-10', startDate: '2026-11-03', endDate: '2026-11-24' }),
      ],
      new Date(2026, 10, 15),
      new Date(2026, 11, 31),
    );
    expect(occurrences.map(item => `${item.recurring.id}:${dayKey(item.due)}`)).toEqual(['ending:2026-11-17', 'ending:2026-11-24']);
  });

  it('ignores rules without a readable next date', () => {
    expect(getRecurringOccurrences([rule({ nextDue: '' }), rule({ id: 'x', nextDue: 'soon' })], new Date(2026, 10, 1), new Date(2026, 11, 31))).toEqual([]);
  });
});

describe('heat level', () => {
  it('is 0 for days without spending and 4 for the biggest day', () => {
    expect(heatLevel(0, 1000)).toBe(0);
    expect(heatLevel(500, 0)).toBe(0);
    expect(heatLevel(1000, 1000)).toBe(4);
  });

  it('uses a square-root scale so small days still show', () => {
    expect(heatLevel(10, 40000)).toBe(1);
    expect(heatLevel(5000, 40000)).toBe(2);
    expect(heatLevel(15000, 40000)).toBe(3);
    expect(heatLevel(30000, 40000)).toBe(4);
  });
});
