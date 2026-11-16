import type { Dispatch, SetStateAction } from 'react';
import type { AppState, Transaction } from '../types';
import { getSyncManager } from './runtimeServices';

/**
 * Computes changed rows from the latest transactions (inside the state updater, so a toast's
 * undo clicked minutes later still sees current data), writes them, then syncs them.
 * Offline, the sync manager queues the rows.
 */
export const commitTransactionChanges = async (
  setState: Dispatch<SetStateAction<AppState>>,
  compute: (current: readonly Transaction[]) => Transaction[],
): Promise<{ rows: Transaction[]; synced: boolean }> => {
  const rows = await new Promise<Transaction[]>(resolve => {
    setState(prev => {
      const changed = compute(prev.transactions);
      resolve(changed);
      if (changed.length === 0) return prev;
      const byId = new Map(changed.map(row => [row.id, row]));
      return { ...prev, transactions: prev.transactions.map(row => byId.get(row.id) ?? row) };
    });
  });
  if (rows.length === 0) return { rows, synced: true };
  try {
    const syncManager = await getSyncManager();
    await Promise.all(rows.map(row => syncManager.syncTransaction(row)));
    return { rows, synced: true };
  } catch (error) {
    console.error('Failed to sync changed transactions:', error);
    return { rows, synced: false };
  }
};
