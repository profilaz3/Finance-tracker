import { useCallback } from 'react';
import { withAccountTeam } from '../domain/teams';
import { alignTransferLeg, buildTransferPair, TRANSFER_CATEGORY_ID } from '../domain/transactions';
import type { Dispatch, SetStateAction } from 'react';
import { convertAmount } from '../services/currencyService';
import { getSyncManager } from '../services/runtimeServices';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { AppState, Currency, ExchangeRates, Transaction } from '../types';
import { getTranslations } from '../utils/i18n';
import { receiptPhotoOf } from '../domain/receiptPhoto';
import { cancelReceiptPhotoCleanup, queueReceiptPhotoCleanup } from '../services/receiptPhotoCleanup';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UseTransactionHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  addToast: AddToast;
  createId: () => string;
  setSelectedTransaction: Dispatch<SetStateAction<Transaction | null>>;
  closeEditModal: () => void;
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

    // The photos come back with their entries instead of being deleted after the undo window.
    cancelReceiptPhotoCleanup(restored.map(receiptPhotoOf));
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
    queueReceiptPhotoCleanup(deleted.map(receiptPhotoOf));

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
    queueReceiptPhotoCleanup(deletedTransactions.map(receiptPhotoOf));

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

  /**
   * Saves the entry form: a new entry, an edit, or a transfer. A new transfer (category
   * internal-transfer) needs `targetAccountId` and is booked as two legs; editing one leg of a
   * transfer keeps the other in step and, with `targetAccountId`, moves the incoming leg there.
   */
  /**
   * Saves an edited (or new) entry. `silent` is for changes made outside the edit form (a receipt
   * photo from the details card): the form stays as it is and no "updated" toast is shown.
   */
  const updateTransaction = useCallback(async (updated: Transaction, targetAccountId?: string, options: { silent?: boolean } = {}) => {
    const strings = getTranslations();
    const isNewTransaction = !state.transactions.some(transaction => transaction.id === updated.id);
    const isTransfer = updated.categoryId === TRANSFER_CATEGORY_ID;
    const convert = (amount: number, from: Currency, to: Currency) => convertAmount(amount, from, to, state.rates);
    const accountName = (accountId: string) => state.accounts.find(account => account.id === accountId)?.name || 'Account';

    let changed: Transaction[];
    if (isNewTransaction && isTransfer) {
      const toAccount = state.accounts.find(account => account.id === targetAccountId);
      if (!toAccount || toAccount.id === updated.accountId) {
        // The form requires two different wallets; never book half a transfer as income.
        addToast(strings.transferNeedsTwoWallets, 'error');
        return;
      }
      changed = buildTransferPair({
        outflow: updated,
        toAccount,
        fromAccountName: accountName(updated.accountId),
        transferId: updated.transferId ?? createId(),
        inflowId: createId(),
        convert,
      }).map(leg => withAccountTeam(leg, state.accounts));
    } else if (isNewTransaction) {
      changed = [withAccountTeam(updated, state.accounts)];
    } else {
      const toAccount = targetAccountId ? state.accounts.find(account => account.id === targetAccountId) : undefined;
      const partnerLegs = updated.transferId
        ? state.transactions
          .filter(transaction => transaction.transferId === updated.transferId && transaction.id !== updated.id)
          .map(partner => alignTransferLeg(updated, partner, {
            toAccount: updated.type === 'expense' ? toAccount : undefined,
            fromAccountName: updated.type === 'expense' ? accountName(updated.accountId) : undefined,
            convert,
          }))
        : [];
      changed = [updated, ...partnerLegs];
    }
    const changedById = new Map(changed.map(transaction => [transaction.id, transaction]));

    // Person balances follow from the transaction itself (see domain/balances.ts),
    // so editing only replaces the row: no balance bookkeeping, no currency drift.
    setState(prev => {
      const existingIds = new Set(prev.transactions.map(transaction => transaction.id));
      const added = changed.filter(transaction => !existingIds.has(transaction.id));
      const transactions = prev.transactions.map(transaction => changedById.get(transaction.id) ?? transaction);
      return { ...prev, transactions: [...added, ...transactions] };
    });

    try {
      await withSyncManager(syncManager =>
        Promise.all(changed.map(transaction => syncManager.syncTransaction(transaction))).then(() => undefined)
      );
    } catch (error) {
      console.error('Failed to sync transaction update:', error);
      addToast(isNewTransaction ? strings.transactionSavedSyncFailed : strings.transactionUpdatedSyncFailed, 'error');
    }

    if (options.silent) return;
    closeEditModal();
    setSelectedTransaction(null);
    addToast(
      !isNewTransaction ? strings.transactionUpdated : isTransfer ? strings.transferAdded : strings.transactionAdded,
      'success',
    );
  }, [addToast, closeEditModal, createId, setSelectedTransaction, setState, state.accounts, state.rates, state.transactions]);

  return {
    addTransaction,
    deleteTransaction,
    batchDeleteTransactions,
    updateTransaction,
  };
}
