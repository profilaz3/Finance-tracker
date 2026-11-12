import { useCallback, useEffect, useRef } from 'react';
import { RecurringTransaction } from '../types';
import {
  buildRecurringProcessingKey,
  getRecurringTransactionsToProcess,
  pruneProcessedRecurringKeys,
} from '../utils/recurringScheduler';

interface UseRecurringProcessorOptions {
  isAuthenticated: boolean | null;
  recurringTransactions: RecurringTransaction[];
  processRecurringTransactions: (dueRecurrings?: RecurringTransaction[]) => void;
  pollIntervalMs?: number;
}

export function useRecurringProcessor({
  isAuthenticated,
  recurringTransactions,
  processRecurringTransactions,
  pollIntervalMs = 60_000,
}: UseRecurringProcessorOptions) {
  const processedKeysRef = useRef<Set<string>>(new Set());
  const recurringRef = useRef(recurringTransactions);

  useEffect(() => {
    recurringRef.current = recurringTransactions;
    processedKeysRef.current = pruneProcessedRecurringKeys(
      recurringTransactions,
      processedKeysRef.current
    );
  }, [recurringTransactions]);

  const runIfNeeded = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }

    const dueRecurrings = getRecurringTransactionsToProcess(
      recurringRef.current,
      processedKeysRef.current
    );

    if (dueRecurrings.length === 0) {
      return;
    }

    processRecurringTransactions(dueRecurrings);

    const nextProcessedKeys = new Set(processedKeysRef.current);
    dueRecurrings.forEach(recurring => {
      nextProcessedKeys.add(buildRecurringProcessingKey(recurring));
    });
    processedKeysRef.current = nextProcessedKeys;
  }, [isAuthenticated, processRecurringTransactions]);

  useEffect(() => {
    if (!isAuthenticated) {
      processedKeysRef.current = new Set();
      return;
    }

    runIfNeeded();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runIfNeeded();
      }
    };

    window.addEventListener('focus', runIfNeeded);
    window.addEventListener('pageshow', runIfNeeded);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(runIfNeeded, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', runIfNeeded);
      window.removeEventListener('pageshow', runIfNeeded);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, pollIntervalMs, runIfNeeded]);
}
