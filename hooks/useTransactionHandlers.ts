import { useCallback } from 'react';
import { withAccountTeam } from '../domain/teams';
import type { Dispatch, SetStateAction } from 'react';
import { convertAmount } from '../services/currencyService';
import { getSyncManager } from '../services/runtimeServices';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { AppState, Currency, ExchangeRates, Transaction } from '../types';
import { getTranslations } from '../utils/i18n';

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

/**
 * Records a plain transaction in its account's currency at today's rate (the
 * amount the account is actually charged). Debts and splits keep the currency
 * they were agreed in, because person balances are kept per currency.
 */
const convertToAccountCurrency = (
  transaction: Transaction,
  accountCurrency: Currency | undefined,
  rates: ExchangeRates,
): Transaction => {
  if (!accountCurrency || transaction.currency === accountCurrency || transaction.personId || transaction.splitDetails) {
    return transaction;
  }
  const fromRate = rates.rates[transaction.currency];
  const toRate = rates.rates[accountCurrency];
  if (!fromRate || !toRate) {
    return transaction;
  }
  const converted = convertAmount(transaction.amount, transaction.currency, accountCurrency, rates);
  if (!Number.isFinite(converted)) {
    return transaction;
  }
  return { ...transaction, amount: Math.round(converted * 100) / 100, currency: accountCurrency };
};

/** The transaction plus the other leg(s) of its transfer, if it has a transferId. */
const withTransferLegs = (transactions: Transaction[], selected: Transaction[]): Transaction[] => {
  const transferIds = new Set(selected.map(entry => entry.transferId).filter((id): id is string => !!id));
  if (transferIds.size === 0) {
    return selected;
  }
  const selectedIds = new Set(selected.map(entry => entry.id));
  const partners = transactions.filter(entry => (
    !selectedIds.has(entry.id) && !!entry.transferId && transferIds.has(entry.transferId)
  ));
  return [...selected, ...partners];
};

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
  const addTransaction = useCallback(async (transaction: Transaction, options?: { silent?: boolean }) => {
    // Computed before setState so the synced row is the stored row (an updater
    // is not guaranteed to have run by the time the sync below starts).
    const account = state.accounts.find(entry => entry.id === transaction.accountId);
    const finalTransaction = withAccountTeam(convertToAccountCurrency(transaction, account?.currency, state.rates), state.accounts);
    setState(prev => ({ ...prev, transactions: [finalTransaction, ...prev.transactions] }));

    try {
      await withSyncManager(syncManager => syncManager.syncTransaction(finalTransaction));
    } catch (error) {
      console.error('Failed to sync transaction:', error);
      addToast(getTranslations().transactionSavedSyncFailed, 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);
    // Callers that show their own confirmation (settle up) pass silent.
    if (!options?.silent) addToast(getTranslations().transactionAdded, 'success');
  }, [addToast, setState, state.accounts, state.rates]);

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
      addToast(getTranslations().transactionsRestoredSyncFailed, 'error');
      return;
    }

    addToast(message, 'success');
  }, [addToast, setState]);

  const deleteTransaction = useCallback(async (id: string) => {
    const transaction = state.transactions.find(entry => entry.id === id);
    if (!transaction) {
      return;
    }

    // Captured per deletion: each toast's undo restores exactly what it deleted
    // (both legs of a transfer).
    const deleted = withTransferLegs(state.transactions, [transaction]);
    const deletedIds = new Set(deleted.map(entry => entry.id));
    setState(prev => ({ ...prev, transactions: prev.transactions.filter(entry => !deletedIds.has(entry.id)) }));

    try {
      await withSyncManager(syncManager =>
        Promise.all(deleted.map(entry => syncManager.deleteTransaction(entry.id))).then(() => undefined)
      );
    } catch (error) {
      console.error('Failed to delete transaction from Supabase:', error);
      addToast(getTranslations().transactionDeletedSyncFailed, 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);
    addToast(getTranslations().transactionDeleted, 'info', {
      label: getTranslations().undo,
      onClick: () => {
        void restoreTransactions(deleted, getTranslations().transactionRestored);
      },
    });
  }, [addToast, restoreTransactions, setState, state.transactions]);

  const batchDeleteTransactions = useCallback(async (requestedIds: string[]) => {
    const requestedIdSet = new Set(requestedIds);
    const deletedTransactions = withTransferLegs(
      state.transactions,
      state.transactions.filter(transaction => requestedIdSet.has(transaction.id)),
    );
    // Unknown ids are still deleted remotely; transfer partners are added.
    const idSet = new Set([...requestedIds, ...deletedTransactions.map(transaction => transaction.id)]);
    const ids = [...idSet];

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
      addToast(getTranslations().transactionsDeletedSyncFailed, 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);

    const message = getTranslations(state.language).transactionsDeletedCount.replace('{count}', String(ids.length));
    if (deletedTransactions.length === 0) {
      addToast(message, 'success');
      return;
    }

    // Balances are derived from transactions, so every batch can be undone safely.
    addToast(message, 'info', {
      label: getTranslations(state.language).undo,
      onClick: () => {
        void restoreTransactions(deletedTransactions, getTranslations(state.language).batchRestored);
      },
    });
  }, [addToast, restoreTransactions, setState, state.language, state.transactions]);

  const updateTransaction = useCallback(async (updated: Transaction, targetAccountId?: string) => {
    const isNewTransaction = !state.transactions.find(transaction => transaction.id === updated.id);

    // Editing one leg of a transfer keeps the other leg in step (date, amount).
    const partnerLegs = updated.transferId
      ? state.transactions
        .filter(transaction => transaction.transferId === updated.transferId && transaction.id !== updated.id)
        .map(partner => {
          const rawAmount = convertAmount(updated.amount, updated.currency, partner.currency, state.rates);
          return {
            ...partner,
            date: updated.date,
            amount: Number.isFinite(rawAmount) ? Math.round(rawAmount * 100) / 100 : partner.amount,
          };
        })
      : [];
    const changed = [updated, ...partnerLegs];
    const changedById = new Map(changed.map(transaction => [transaction.id, transaction]));

    // Person balances follow from the transaction itself (see domain/balances.ts),
    // so editing only replaces the row: no balance bookkeeping, no currency drift.
    setState(prev => {
      const exists = prev.transactions.some(transaction => transaction.id === updated.id);
      const transactions = prev.transactions.map(transaction => changedById.get(transaction.id) ?? transaction);
      return {
        ...prev,
        transactions: exists ? transactions : [...transactions, updated],
      };
    });

    try {
      await withSyncManager(syncManager =>
        Promise.all(changed.map(transaction => syncManager.syncTransaction(transaction))).then(() => undefined)
      );
    } catch (error) {
      console.error('Failed to sync transaction update:', error);
      addToast(getTranslations().transactionUpdatedSyncFailed, 'error');
    }

    if (isNewTransaction && targetAccountId && updated.categoryId === 'internal-transfer') {
      // Both legs share a transferId so they are edited and deleted together.
      const transferId = updated.transferId ?? createId();
      const outflowTx = { ...updated, type: 'expense' as const, transferId };

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
          transferId,
        };

        await addTransaction(inflowTx);
      }
    }

    closeEditModal();
    closeReceiptModal();
    setSelectedTransaction(null);
    addToast(getTranslations().transactionUpdated, 'success');
  }, [addToast, addTransaction, closeEditModal, closeReceiptModal, createId, setSelectedTransaction, setState, state.accounts, state.rates, state.transactions]);

  return {
    addTransaction,
    deleteTransaction,
    batchDeleteTransactions,
    updateTransaction,
  };
}
