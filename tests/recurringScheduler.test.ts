import { describe, expect, it } from 'vitest';
import { RecurringTransaction } from '../types';
import {
  buildRecurringProcessingKey,
  getRecurringTransactionsToProcess,
  pruneProcessedRecurringKeys,
} from '../utils/recurringScheduler';

const createRecurring = (overrides: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: overrides.id ?? 'rec-1',
  name: overrides.name ?? 'Rent',
  amount: overrides.amount ?? 1200,
  currency: overrides.currency ?? 'EUR',
  categoryId: overrides.categoryId ?? 'housing',
  accountId: overrides.accountId ?? 'bank',
  type: overrides.type ?? 'expense',
  note: overrides.note,
  subcategory: overrides.subcategory,
  frequency: overrides.frequency ?? 'monthly',
  startDate: overrides.startDate ?? '2026-01-01',
  endDate: overrides.endDate,
  lastGenerated: overrides.lastGenerated,
  nextDue: overrides.nextDue ?? '2026-04-05',
  isActive: overrides.isActive ?? true,
});

describe('getRecurringTransactionsToProcess', () => {
  const now = new Date('2026-04-05T12:00:00.000Z');

  it('returns due recurring transactions that have not been processed yet', () => {
    const recurring = createRecurring();

    expect(getRecurringTransactionsToProcess([recurring], new Set(), now)).toEqual([recurring]);
  });

  it('skips due transactions that already have a processed key for the same due date', () => {
    const recurring = createRecurring();
    const processedKeys = new Set([buildRecurringProcessingKey(recurring)]);

    expect(getRecurringTransactionsToProcess([recurring], processedKeys, now)).toEqual([]);
  });

  it('allows the same recurring transaction to run again after its next due date changes', () => {
    const recurring = createRecurring({ nextDue: '2026-04-06' });
    const processedKeys = new Set([buildRecurringProcessingKey(createRecurring({ nextDue: '2026-04-05' }))]);

    expect(getRecurringTransactionsToProcess([recurring], processedKeys, new Date('2026-04-06T12:00:00.000Z'))).toEqual([recurring]);
  });

  it('filters out inactive and future recurring transactions', () => {
    const inactive = createRecurring({ id: 'inactive', isActive: false });
    const future = createRecurring({ id: 'future', nextDue: '2026-04-07' });

    expect(getRecurringTransactionsToProcess([inactive, future], new Set(), now)).toEqual([]);
  });
});

describe('pruneProcessedRecurringKeys', () => {
  it('drops processed keys that no longer match any recurring next-due pair', () => {
    const recurring = createRecurring({ nextDue: '2026-04-06' });
    const processedKeys = new Set([
      buildRecurringProcessingKey(createRecurring({ nextDue: '2026-04-05' })),
      buildRecurringProcessingKey(recurring),
    ]);

    expect(pruneProcessedRecurringKeys([recurring], processedKeys)).toEqual(
      new Set([buildRecurringProcessingKey(recurring)])
    );
  });
});
