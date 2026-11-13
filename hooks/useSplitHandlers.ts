import { useCallback } from 'react';
import { withAccountTeam } from '../domain/teams';
import type { Dispatch, SetStateAction } from 'react';
import { getSyncManager } from '../services/runtimeServices';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { AppState, Currency, Transaction } from '../types';
import { applyPersonBalanceUpdates } from '../utils/balanceMutations';
import { getTranslations } from '../utils/i18n';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

type UnifiedSplitResult = {
  transactions: Transaction[];
  balanceUpdates: { personId: string; currency: Currency; delta: number }[];
};

interface UseSplitHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  selectedTransaction: Transaction | null;
  setSelectedTransaction: Dispatch<SetStateAction<Transaction | null>>;
  setSplitTransactionContext: Dispatch<SetStateAction<Transaction | undefined>>;
  addToast: AddToast;
  createId: () => string;
  closeSplitModal: () => void;
  closeSplitExpenseModal: () => void;
}

export function useSplitHandlers({
  state,
  setState,
  selectedTransaction,
  setSelectedTransaction,
  setSplitTransactionContext,
  addToast,
  createId,
  closeSplitModal,
  closeSplitExpenseModal,
}: UseSplitHandlersOptions) {
  const syncPersonBalanceUpdates = useCallback(async (
    updates: { personId: string; currency: Currency; delta: number }[],
    sourcePeople: AppState['people']
  ) => {
    if (updates.length === 0) {
      return;
    }

    const updatedPeople = applyPersonBalanceUpdates(sourcePeople, updates);
    const affectedIds = [...new Set(updates.map(update => update.personId))];

    for (const personId of affectedIds) {
      const updatedPerson = updatedPeople.find(person => person.id === personId);
      if (!updatedPerson) {
        continue;
      }

      try {
        const syncManager = await getSyncManager();
        await syncManager.syncPerson(updatedPerson);
      } catch (error) {
        console.error('Failed to sync person balance update:', error);
      }
    }
  }, []);

  const handleSplitTransaction = useCallback(async (
    splitAmount: number,
    splitCurrency: Currency,
    targetId: string,
    type: 'person' | 'account'
  ) => {
    if (!selectedTransaction) {
      return;
    }

    const originalId = selectedTransaction.id;
    let newTransaction: Transaction;
    let updatedOriginalTx: Transaction | null = null;

    if (type === 'account') {
      const transferCategory = state.categories.find(category => category.id === 'internal-transfer')
        || state.categories.find(category => category.name === 'Internal Transfer')
        || state.categories[0]
        || { id: 'unknown', name: 'Unknown', type: 'income' as const, subcategories: [], color: '#000000' };

      newTransaction = {
        id: createId(),
        date: selectedTransaction.date,
        amount: splitAmount,
        currency: splitCurrency,
        categoryId: transferCategory.id,
        subcategory: 'Between Accounts',
        accountId: targetId,
        type: 'income',
        note: `Transfer: ${selectedTransaction.note || 'Shared expense'}`,
      };
    } else {
      const fromRate = state.rates.rates[selectedTransaction.currency];
      const toRate = state.rates.rates[splitCurrency];
      const conversionRate = (fromRate && toRate && toRate !== 0) ? fromRate / toRate : 1;
      const rawSubtract = splitAmount * conversionRate;
      const amountToSubtract = Number.isFinite(rawSubtract) ? rawSubtract : splitAmount;
      const newOriginalAmount = selectedTransaction.amount - amountToSubtract;

      updatedOriginalTx = {
        ...selectedTransaction,
        amount: newOriginalAmount,
        note: `${selectedTransaction.note} (Split)`,
      };
      const category = state.categories.find(entry => entry.id === selectedTransaction.categoryId) || state.categories[0];

      newTransaction = {
        id: createId(),
        date: selectedTransaction.date,
        amount: splitAmount,
        currency: splitCurrency,
        categoryId: category.id,
        subcategory: 'Split Bill',
        accountId: selectedTransaction.accountId,
        personId: targetId,
        type: selectedTransaction.type,
        note: `Split: ${selectedTransaction.note}`,
      };
    }

    // The new person transaction carries the debt (personId); balances are derived from it.
    setState(prev => {
      return {
        ...prev,
        transactions: [
          newTransaction,
          ...(updatedOriginalTx
            ? prev.transactions.map(transaction => transaction.id === originalId ? updatedOriginalTx! : transaction)
            : prev.transactions),
        ],
      };
    });

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncTransaction(newTransaction);
      if (updatedOriginalTx) {
        await syncManager.syncTransaction(updatedOriginalTx);
      }
    } catch (error) {
      console.error('Failed to sync split transaction:', error);
      addToast(getTranslations().splitSavedSyncFailed, 'error');
    }

    closeSplitModal();
    setSelectedTransaction(null);
  }, [addToast, closeSplitModal, createId, selectedTransaction, setSelectedTransaction, setState, state.categories, state.rates]);

  const handleUnifiedSplit = useCallback(async (result: UnifiedSplitResult) => {
    for (const splitTransaction of result.transactions) {
      const transaction = withAccountTeam(splitTransaction, state.accounts);
      setState(prev => {
        const existingIndex = prev.transactions.findIndex(entry => entry.id === transaction.id);
        if (existingIndex !== -1) {
          const updatedTransactions = [...prev.transactions];
          updatedTransactions[existingIndex] = transaction;
          return { ...prev, transactions: updatedTransactions };
        }

        return { ...prev, transactions: [transaction, ...prev.transactions] };
      });

      try {
        const syncManager = await getSyncManager();
        await syncManager.syncTransaction(transaction);
      } catch (error) {
        console.error('Failed to sync split transaction:', error);
      }
    }

    // "I paid" splits: shares live in splitDetails and balances are derived from them,
    // so the informational balanceUpdates must not be written as well.
    // "They paid" debts have no transaction, so they are stored as manual offsets.
    const offsetUpdates = result.transactions.length === 0 ? result.balanceUpdates : [];
    if (offsetUpdates.length > 0) {
      setState(prev => ({ ...prev, people: applyPersonBalanceUpdates(prev.people, offsetUpdates) }));
      await syncPersonBalanceUpdates(offsetUpdates, state.people);
    }

    vibrate(HAPTIC_PATTERNS.success);
    const wasEditing = result.transactions.some(transaction =>
      state.transactions.some(existing => existing.id === transaction.id)
    );
    addToast(wasEditing ? getTranslations().splitExpenseUpdated : getTranslations().splitExpenseAdded, 'success');
    closeSplitExpenseModal();
    setSplitTransactionContext(undefined);
  }, [addToast, closeSplitExpenseModal, setSplitTransactionContext, setState, state.accounts, state.people, state.transactions, syncPersonBalanceUpdates]);

  return {
    handleSplitTransaction,
    handleUnifiedSplit,
  };
}
