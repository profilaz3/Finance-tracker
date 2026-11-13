import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppState } from '../types';
import { getSyncManager } from '../services/runtimeServices';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UseAccountHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  addToast: AddToast;
  /** True once the server accounts are loaded; order changes are only synced after that. */
  isHydrated?: boolean;
}

/**
 * Accounts whose `order` differs from the last synced snapshot. Accounts that
 * are new to the snapshot are skipped: they are synced by the add flow.
 */
export function findReorderedAccounts(
  accounts: AppState['accounts'],
  baseline: ReadonlyMap<string, number | undefined>
): AppState['accounts'] {
  return accounts.filter(account => baseline.has(account.id) && baseline.get(account.id) !== account.order);
}

const snapshotOrder = (accounts: AppState['accounts']) =>
  new Map(accounts.map(account => [account.id, account.order] as const));

export function useAccountHandlers({ state, setState, addToast, isHydrated = false }: UseAccountHandlersOptions) {
  const orderBaselineRef = useRef<Map<string, number | undefined> | null>(null);

  // Drag-to-reorder only updates local state; persist the new order_index for each moved account.
  useEffect(() => {
    if (!isHydrated) {
      orderBaselineRef.current = null;
      return;
    }

    const baseline = orderBaselineRef.current;
    orderBaselineRef.current = snapshotOrder(state.accounts);
    if (!baseline) return;

    const reordered = findReorderedAccounts(state.accounts, baseline);
    if (reordered.length === 0) return;

    void getSyncManager().then(syncManager => Promise.all(
      reordered.map(account => syncManager.syncAccount(account))
    )).catch(error => {
      console.error('Failed to sync account order:', error);
    });
  }, [isHydrated, state.accounts]);

  const handleUpdateAccount = useCallback(async (id: string, updates: Partial<AppState['accounts'][number]>) => {
    const account = state.accounts.find(entry => entry.id === id);
    if (!account) {
      return;
    }

    const updatedAccount = { ...account, ...updates };
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(entry => entry.id === id ? updatedAccount : entry),
    }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncAccount(updatedAccount);
    } catch (error) {
      console.error('Failed to sync account update:', error);
      addToast('Account updated locally, but sync failed', 'error');
    }
  }, [addToast, setState, state.accounts]);

  return {
    handleUpdateAccount,
  };
}
