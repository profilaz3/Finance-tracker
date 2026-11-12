import { RecurringTransaction } from '../types';
import { isDue } from './recurringUtils';

export const buildRecurringProcessingKey = (
  recurring: Pick<RecurringTransaction, 'id' | 'nextDue'>
): string => `${recurring.id}:${recurring.nextDue}`;

export const getRecurringTransactionsToProcess = (
  recurringTransactions: RecurringTransaction[],
  processedKeys: ReadonlySet<string>,
  now: Date = new Date()
): RecurringTransaction[] =>
  recurringTransactions.filter(
    recurring =>
      isDue(recurring, now) &&
      !processedKeys.has(buildRecurringProcessingKey(recurring))
  );

export const pruneProcessedRecurringKeys = (
  recurringTransactions: RecurringTransaction[],
  processedKeys: ReadonlySet<string>
): Set<string> => {
  const currentKeys = new Set(
    recurringTransactions.map(recurring => buildRecurringProcessingKey(recurring))
  );

  return new Set(
    Array.from(processedKeys).filter(processedKey => currentKeys.has(processedKey))
  );
};
