import { describe, expect, it } from 'vitest';
import { countDueRecurringTransactions, getRecurringStatus } from '../utils/recurringSelectors';
import type { RecurringTransaction } from '../types';

const createRecurring = (overrides: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: 'recurring-1',
  name: 'Gym',
  amount: 25,
  currency: 'EUR',
  categoryId: 'fitness',
  accountId: 'cash',
  type: 'expense',
  frequency: 'monthly',
  startDate: '2026-04-01',
  nextDue: '2026-04-05',
  isActive: true,
  ...overrides,
});

describe('recurring selectors', () => {
  it('counts only due and active recurring transactions', () => {
    const referenceDate = new Date('2026-04-06T12:00:00.000Z');

    const recurringTransactions: RecurringTransaction[] = [
      createRecurring({ id: 'due-now', nextDue: '2026-04-05', isActive: true }),
      createRecurring({ id: 'due-today', nextDue: '2026-04-06', isActive: true }),
      createRecurring({ id: 'future', nextDue: '2026-04-09', isActive: true }),
      createRecurring({ id: 'paused', nextDue: '2026-04-05', isActive: false }),
      createRecurring({ id: 'ended', nextDue: '2026-04-05', endDate: '2026-04-04', isActive: true }),
    ];

    expect(countDueRecurringTransactions(recurringTransactions, referenceDate)).toBe(2);
  });

  it('builds recurring status metadata for today, overdue, and future states', () => {
    const referenceDate = new Date('2026-04-06T12:00:00.000Z');

    expect(getRecurringStatus(createRecurring({ nextDue: '2026-04-06' }), 'en', referenceDate)).toMatchObject({
      daysUntil: 0,
      isOverdue: false,
      isDueToday: true,
      countdownText: 'Today',
    });

    expect(getRecurringStatus(createRecurring({ nextDue: '2026-04-04' }), 'en', referenceDate)).toMatchObject({
      daysUntil: -2,
      isOverdue: true,
      isDueToday: false,
      countdownText: 'Overdue 2 days',
    });

    expect(getRecurringStatus(createRecurring({ nextDue: '2026-04-09' }), 'en', referenceDate)).toMatchObject({
      daysUntil: 3,
      isOverdue: false,
      isDueToday: false,
      countdownText: 'in 3 days',
    });
  });
});
