import { useCallback, useEffect, useRef } from 'react';
import { RecurringTransaction } from '../types';
import { CONFIG } from '../config';
import { flushSaveState } from '../services/storageService';
import {
  buildRecurringProcessingKey,
  getRecurringTransactionsToProcess,
  pruneProcessedRecurringKeys,
} from '../utils/recurringScheduler';

interface UseRecurringProcessorOptions {
  isAuthenticated: boolean | null;
  /**
   * True once the server copy of transactions and recurring rules is loaded.
   * Generating before that works on stale `nextDue` values and duplicates
   * occurrences another device already generated.
   */
  isHydrated: boolean;
  recurringTransactions: RecurringTransaction[];
  processRecurringTransactions: (dueRecurrings?: RecurringTransaction[]) => void;
  pollIntervalMs?: number;
}

type LockManagerLike = {
  request: (
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void> | void
  ) => Promise<unknown>;
};

const getLockManager = (): LockManagerLike | null => {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
};

// Keep the lock long enough for the generated state to render and be persisted,
// so another tab that acquires it next sees the advanced `nextDue`.
const LOCK_HOLD_MS = CONFIG.SAVE_DEBOUNCE_MS + 200;

export function useRecurringProcessor({
  isAuthenticated,
  isHydrated,
  recurringTransactions,
  processRecurringTransactions,
  pollIntervalMs = CONFIG.RECURRING_POLL_INTERVAL_MS,
}: UseRecurringProcessorOptions) {
  const processedKeysRef = useRef<Set<string>>(new Set());
  const recurringRef = useRef(recurringTransactions);
  const processRef = useRef(processRecurringTransactions);
  processRef.current = processRecurringTransactions;
  const runningRef = useRef(false);

  useEffect(() => {
    recurringRef.current = recurringTransactions;
    processedKeysRef.current = pruneProcessedRecurringKeys(
      recurringTransactions,
      processedKeysRef.current
    );
  }, [recurringTransactions]);

  const processDue = useCallback((): boolean => {
    const dueRecurrings = getRecurringTransactionsToProcess(
      recurringRef.current,
      processedKeysRef.current
    );

    if (dueRecurrings.length === 0) {
      return false;
    }

    processRef.current(dueRecurrings);

    const nextProcessedKeys = new Set(processedKeysRef.current);
    dueRecurrings.forEach(recurring => {
      nextProcessedKeys.add(buildRecurringProcessingKey(recurring));
    });
    processedKeysRef.current = nextProcessedKeys;
    return true;
  }, []);

  const runIfNeeded = useCallback(() => {
    if (!isAuthenticated || !isHydrated || runningRef.current) {
      return;
    }

    const locks = getLockManager();
    if (!locks) {
      processDue();
      return;
    }

    // Only one tab generates at a time; a tab that cannot get the lock skips this round.
    runningRef.current = true;
    locks.request(CONFIG.RECURRING_LOCK_NAME, { ifAvailable: true }, async lock => {
      if (!lock) return;
      if (!processDue()) return;
      await new Promise(resolve => setTimeout(resolve, LOCK_HOLD_MS));
      flushSaveState();
    }).catch(error => {
      console.error('Recurring processor lock failed:', error);
    }).finally(() => {
      runningRef.current = false;
    });
  }, [isAuthenticated, isHydrated, processDue]);

  useEffect(() => {
    if (!isAuthenticated) {
      processedKeysRef.current = new Set();
      return;
    }
    if (!isHydrated) {
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
  }, [isAuthenticated, isHydrated, pollIntervalMs, runIfNeeded]);
}
