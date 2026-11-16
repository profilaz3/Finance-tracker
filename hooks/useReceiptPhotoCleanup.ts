import { useEffect, useRef } from 'react';
import type { Transaction } from '../types';
import { referencedReceiptPhotos } from '../domain/receiptPhoto';
import { readPhotoCleanupQueue } from '../services/receiptPhotoCleanup';

const FIRST_RUN_MS = 10_000;
const EVERY_MS = 60_000;

/**
 * Deletes receipt photos whose entry was deleted (or whose photo was removed) once the undo window
 * has passed. Takes every transaction, not the workspace's, so switching workspace never makes a
 * photo look unused. The Storage code loads only when something is queued.
 */
export const useReceiptPhotoCleanup = (transactions: Transaction[], userId: string | null): void => {
  const latest = useRef(transactions);
  latest.current = transactions;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const run = () => {
      if (cancelled || readPhotoCleanupQueue().length === 0) return;
      void import('../services/receiptPhotoService')
        .then(({ flushReceiptPhotoCleanup }) =>
          cancelled ? undefined : flushReceiptPhotoCleanup(referencedReceiptPhotos(latest.current), userId))
        .catch(() => undefined);
    };
    const first = window.setTimeout(run, FIRST_RUN_MS);
    const timer = window.setInterval(run, EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [userId]);
};
