import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { convertAmount } from '../services/currencyService';
import { getSyncManager } from '../services/runtimeServices';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { AppState, Transaction } from '../types';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UseTransactionHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  addToast: AddToast;
  createId: () => string;
  setSelectedTransaction: Dispatch<SetStateAction<Transaction | null>>;
  closeEditModal: () => void;
  closeReceiptModal: () => void;
}

type SyncManagerInstance = Awaited<ReturnType<typeof getSyncManager>>;

const withSyncManager = async <T,>(run: (syncManager: SyncManagerInstance) => Promise<T>): Promise<T> =>
  run(await getSyncManager());

export function useTransactionHandlers({
  state,
  setState,
  addToast,
  createId,
  setSelectedTransaction,
  closeEditModal,
  closeReceiptModal,
}: UseTransactionHandlersOptions) {
  const addTransaction = useCallback(async (transaction: Transaction) => {
    let finalTransaction = { ...transaction };

    setState(prev => {
      let txToAdd = { ...transaction };
      if (txToAdd.accountId === 'acc3' && txToAdd.currency !== 'USD') {
        const fromRate = prev.rates.rates[txToAdd.currency];
        const toRate = prev.rates.rates.USD;
        if (fromRate && toRate && fromRate !== 0) {
          const rate = toRate / fromRate;
          const convertedAmount = txToAdd.amount * rate;
          if (Number.isFinite(convertedAmount)) {
            txToAdd.amount = parseFloat(convertedAmount.toFixed(2));
            txToAdd.currency = 'USD';
          }
        }
      }
      finalTransaction = txToAdd;
      return { ...prev, transactions: [txToAdd, ...prev.transactions] };
    });

    try {
      await withSyncManager(syncManager => syncManager.syncTransaction(finalTransaction));
    } catch (error) {
      console.error('Failed to sync transaction:', error);
      addToast('Transaction saved locally, but sync failed', 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);
    addToast('Transaction added successfully', 'success');
  }, [addToast, setState]);

  /**
   * Puts deleted transactions back and re-syncs them (upsert). Person balances
   * are derived from transactions, so restoring the rows restores their
   * balance effects too. Uses functional state so it is safe to call from a
   * toast created several renders ago.
   */
  const restoreTransactions = useCallback(async (restored: Transaction[], message: string) => {
    if (restored.length === 0) {
      return;
    }

    setState(prev => {
      const existingIds = new Set(prev.transactions.map(transaction => transaction.id));
      const missing = restored.filter(transaction => !existingIds.has(transaction.id));
      return missing.length === 0 ? prev : { ...prev, transactions: [...missing, ...prev.transactions] };
    });

    try {
      await withSyncManager(syncManager =>
        Promise.all(restored.map(transaction => syncManager.syncTransaction(transaction))).then(() => undefined)
      );
    } catch (error) {
      console.error('Failed to sync restored transactions:', error);
      addToast('Restored locally, but sync failed', 'error');
      return;
    }

    addToast(message, 'success');
  }, [addToast, setState]);

  const deleteTransaction = useCallback(async (id: string) => {
    const transaction = state.transactions.find(entry => entry.id === id);
    if (!transaction) {
      return;
    }

    // Captured per deletion: each toast's undo restores exactly what it deleted.
    const deleted = [transaction];
    const deletedIds = new Set(deleted.map(entry => entry.id));
    setState(prev => ({ ...prev, transactions: prev.transactions.filter(entry => !deletedIds.has(entry.id)) }));

    try {
      await withSyncManager(syncManager =>
        Promise.all(deleted.map(entry => syncManager.deleteTransaction(entry.id))).then(() => undefined)
      );
    } catch (error) {
      console.error('Failed to delete transaction from Supabase:', error);
      addToast('Transaction deleted locally, but sync failed', 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);
    addToast('Transaction deleted', 'info', {
      label: 'Undo',
      onClick: () => {
        void restoreTransactions(deleted, 'Transaction restored');
      },
    });
  }, [addToast, restoreTransactions, setState, state.transactions]);

  const batchDeleteTransactions = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    const deletedTransactions = state.transactions.filter(transaction => idSet.has(transaction.id));

    setState(prev => ({
      ...prev,
      transactions: prev.transactions.filter(transaction => !idSet.has(transaction.id)),
    }));

    try {
      await withSyncManager(syncManager =>
        Promise.all(ids.map(id => syncManager.deleteTransaction(id))).then(() => undefined)
      );
    } catch (error) {
      console.error('Failed to sync batch deletion:', error);
      addToast('Transactions deleted locally, but sync failed', 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);

    const message = `${ids.length} ${state.language === 'sr' ? 'transakcija obrisano' : 'transactions deleted'}`;
    if (deletedTransactions.length === 0) {
      addToast(message, 'success');
      return;
    }

    // Balances are derived from transactions, so every batch can be undone safely.
    addToast(message, 'info', {
      label: state.language === 'sr' ? 'Vrati' : 'Undo',
      onClick: () => {
        void restoreTransactions(deletedTransactions, 'Batch restored');
      },
    });
  }, [addToast, restoreTransactions, setState, state.language, state.transactions]);

  const updateTransaction = useCallback(async (updated: Transaction, targetAccountId?: string) => {
    const isNewTransaction = !state.transactions.find(transaction => transaction.id === updated.id);

    // Person balances follow from the transaction itself (see domain/balances.ts),
    // so editing only replaces the row: no balance bookkeeping, no currency drift.
    setState(prev => {
      const exists = prev.transactions.some(transaction => transaction.id === updated.id);
      return {
        ...prev,
        transactions: exists
          ? prev.transactions.map(transaction => transaction.id === updated.id ? updated : transaction)
          : [...prev.transactions, updated],
      };
    });

    try {
      await withSyncManager(syncManager => syncManager.syncTransaction(updated));
    } catch (error) {
      console.error('Failed to sync transaction update:', error);
      addToast('Transaction updated locally, but sync failed', 'error');
    }

    if (isNewTransaction && targetAccountId && updated.categoryId === 'internal-transfer') {
      const outflowTx = { ...updated, type: 'expense' as const };

      setState(prev => ({
        ...prev,
        transactions: prev.transactions.map(transaction => transaction.id === updated.id ? outflowTx : transaction),
      }));

      try {
        await withSyncManager(syncManager => syncManager.syncTransaction(outflowTx));
      } catch (error) {
        console.error('Failed to sync outflow transaction correction:', error);
      }

      const targetAccount = state.accounts.find(account => account.id === targetAccountId);
      if (targetAccount) {
        const rawAmount = convertAmount(updated.amount, updated.currency, targetAccount.currency, state.rates);
        const convertedAmount = Number.isFinite(rawAmount) ? Math.round(rawAmount * 100) / 100 : updated.amount;

        const inflowTx: Transaction = {
          id: createId(),
          date: updated.date,
          amount: convertedAmount,
          currency: targetAccount.currency,
          categoryId: 'internal-transfer',
          accountId: targetAccountId,
          type: 'income',
          note: `Transfer from ${state.accounts.find(account => account.id === updated.accountId)?.name || 'Account'}`,
          subcategory: 'Transfer In',
        };

        await addTransaction(inflowTx);
      }
    }

    closeEditModal();
    closeReceiptModal();
    setSelectedTransaction(null);
    addToast('Transaction updated', 'success');
  }, [addToast, addTransaction, closeEditModal, closeReceiptModal, createId, setSelectedTransaction, setState, state.accounts, state.rates, state.transactions]);

  return {
    addTransaction,
    deleteTransaction,
    batchDeleteTransactions,
    updateTransaction,
  };
}
