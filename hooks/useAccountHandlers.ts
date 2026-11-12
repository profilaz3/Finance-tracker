import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppState } from '../types';
import { getSyncManager } from '../services/runtimeServices';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UseAccountHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  addToast: AddToast;
}

export function useAccountHandlers({ state, setState, addToast }: UseAccountHandlersOptions) {
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
