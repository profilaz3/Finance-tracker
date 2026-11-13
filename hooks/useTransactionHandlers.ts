import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { convertAmount } from '../services/currencyService';
import { getSyncManager } from '../services/runtimeServices';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { AppState, Transaction } from '../types';
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
  const [deletedTransaction, setDeletedTransaction] = useState<Transaction | null>(null);

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
      addToast(getTranslations().transactionSavedSyncFailed, 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);
    addToast(getTranslations().transactionAdded, 'success');
  }, [addToast, setState]);

  const undoDelete = useCallback(() => {
    if (!deletedTransaction) {
      return;
    }

    setState(prev => {
      const transactions = [deletedTransaction, ...prev.transactions];
      let updatedPeople = [...prev.people];

      if (deletedTransaction.splitDetails) {
        deletedTransaction.splitDetails.shares.forEach(share => {
          const personIndex = updatedPeople.findIndex(person => person.id === share.personId);
          if (personIndex !== -1) {
            const person = updatedPeople[personIndex];
            const currency = deletedTransaction.currency;
            updatedPeople[personIndex] = {
              ...person,
              balances: {
                ...person.balances,
                [currency]: Math.round(((person.balances[currency] || 0) + share.amount) * 100) / 100,
              },
            };
          }
        });
      }

      return { ...prev, transactions, people: updatedPeople };
    });

    if (deletedTransaction.splitDetails) {
      deletedTransaction.splitDetails.shares.forEach(async share => {
        const person = state.people.find(entry => entry.id === share.personId);
        if (!person) {
          return;
        }

        try {
          const currency = deletedTransaction.currency;
          await withSyncManager(syncManager => syncManager.syncPerson({
            ...person,
            balances: {
              ...person.balances,
              [currency]: Math.round(((person.balances[currency] || 0) + share.amount) * 100) / 100,
            },
          }));
        } catch (error) {
          console.error('Failed to sync person balance after undo:', error);
        }
      });
    }

    setDeletedTransaction(null);
    addToast(getTranslations().transactionRestored, 'success');
  }, [addToast, deletedTransaction, setState, state.people]);

  const deleteTransaction = useCallback(async (id: string) => {
    const transaction = state.transactions.find(entry => entry.id === id);
    if (!transaction) {
      return;
    }

    setDeletedTransaction(transaction);
    setState(prev => ({ ...prev, transactions: prev.transactions.filter(entry => entry.id !== id) }));

    const splitDetails = transaction.splitDetails;
    if (splitDetails) {
      setState(prev => {
        const updatedPeople = [...prev.people];
        splitDetails.shares.forEach(share => {
          const personIndex = updatedPeople.findIndex(person => person.id === share.personId);
          if (personIndex !== -1) {
            const person = updatedPeople[personIndex];
            const currency = transaction.currency;
            updatedPeople[personIndex] = {
              ...person,
              balances: {
                ...person.balances,
                [currency]: Math.round(((person.balances[currency] || 0) - share.amount) * 100) / 100,
              },
            };
          }
        });
        return { ...prev, people: updatedPeople };
      });

      splitDetails.shares.forEach(async share => {
        const person = state.people.find(entry => entry.id === share.personId);
        if (!person) {
          return;
        }

        try {
          const currency = transaction.currency;
          await withSyncManager(syncManager => syncManager.syncPerson({
            ...person,
            balances: {
              ...person.balances,
              [currency]: Math.round(((person.balances[currency] || 0) - share.amount) * 100) / 100,
            },
          }));
        } catch (error) {
          console.error('Failed to sync person balance after delete:', error);
        }
      });
    }

    try {
      await withSyncManager(syncManager => syncManager.deleteTransaction(id));
    } catch (error) {
      console.error('Failed to delete transaction from Supabase:', error);
      addToast(getTranslations().transactionDeletedSyncFailed, 'error');
    }

    vibrate(HAPTIC_PATTERNS.success);
    addToast(getTranslations().transactionDeleted, 'info', {
      label: getTranslations().undo,
      onClick: undoDelete,
    });
  }, [addToast, setState, state.people, state.transactions, undoDelete]);

  const restoreBatchDeletedTransactions = useCallback(async (transactions: Transaction[]) => {
    if (transactions.length === 0) {
      return;
    }

    setState(prev => ({
      ...prev,
      transactions: [...transactions, ...prev.transactions],
    }));

    try {
      await withSyncManager(syncManager =>
        Promise.all(transactions.map(transaction => syncManager.syncTransaction(transaction))).then(() => undefined)
      );
    } catch (error) {
      console.error('Failed to sync batch restore:', error);
      addToast(getTranslations().transactionsRestoredSyncFailed, 'error');
    }

    addToast(getTranslations().batchRestored, 'success');
  }, [addToast, setState]);

  const batchDeleteTransactions = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    const deletedTransactions = state.transactions.filter(transaction => idSet.has(transaction.id));
    const canUndoBatchDelete = deletedTransactions.length > 0 && deletedTransactions.every(transaction => (
      !transaction.personId && !transaction.splitDetails
    ));

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

    if (canUndoBatchDelete) {
      addToast(getTranslations(state.language).transactionsDeletedCount.replace('{count}', String(ids.length)), 'info', {
        label: getTranslations(state.language).undo,
        onClick: () => {
          void restoreBatchDeletedTransactions(deletedTransactions);
        },
      });
      return;
    }

    addToast(getTranslations(state.language).transactionsDeletedCount.replace('{count}', String(ids.length)), 'success');
  }, [addToast, restoreBatchDeletedTransactions, setState, state.language, state.transactions]);

  const updateTransaction = useCallback(async (updated: Transaction, targetAccountId?: string) => {
    const isNewTransaction = !state.transactions.find(transaction => transaction.id === updated.id);

    setState(prev => {
      const oldTx = prev.transactions.find(transaction => transaction.id === updated.id);
      const transactions = prev.transactions.map(transaction => transaction.id === updated.id ? updated : transaction);
      const finalTransactions = oldTx ? transactions : [...prev.transactions, updated];

      let updatedPeople = [...prev.people];
      const peopleToSyncSet = new Set<string>();

      if (oldTx?.personId) {
        const personIndex = updatedPeople.findIndex(person => person.id === oldTx.personId);
        if (personIndex !== -1) {
          const person = updatedPeople[personIndex];
          const oldAmount = convertAmount(oldTx.amount, oldTx.currency, person.defaultCurrency, prev.rates);
          const balanceChange = oldTx.type === 'expense' ? oldAmount : -oldAmount;
          updatedPeople[personIndex] = {
            ...person,
            balances: {
              ...person.balances,
              [person.defaultCurrency]: Math.round(((person.balances[person.defaultCurrency] || 0) - balanceChange) * 100) / 100,
            },
          };
          peopleToSyncSet.add(person.id);
        }
      }

      if (oldTx?.splitDetails) {
        oldTx.splitDetails.shares.forEach(share => {
          const personIndex = updatedPeople.findIndex(person => person.id === share.personId);
          if (personIndex !== -1) {
            const person = updatedPeople[personIndex];
            const currency = oldTx.currency;
            updatedPeople[personIndex] = {
              ...person,
              balances: {
                ...person.balances,
                [currency]: Math.round(((person.balances[currency] || 0) - share.amount) * 100) / 100,
              },
            };
            peopleToSyncSet.add(person.id);
          }
        });
      }

      if (updated.personId) {
        const personIndex = updatedPeople.findIndex(person => person.id === updated.personId);
        if (personIndex !== -1) {
          const person = updatedPeople[personIndex];
          const newAmount = convertAmount(updated.amount, updated.currency, person.defaultCurrency, prev.rates);
          const balanceChange = updated.type === 'expense' ? newAmount : -newAmount;
          updatedPeople[personIndex] = {
            ...person,
            balances: {
              ...person.balances,
              [person.defaultCurrency]: Math.round(((person.balances[person.defaultCurrency] || 0) + balanceChange) * 100) / 100,
            },
          };
          peopleToSyncSet.add(person.id);
        }
      }

      if (updated.splitDetails) {
        updated.splitDetails.shares.forEach(share => {
          const personIndex = updatedPeople.findIndex(person => person.id === share.personId);
          if (personIndex !== -1) {
            const person = updatedPeople[personIndex];
            const currency = updated.currency;
            updatedPeople[personIndex] = {
              ...person,
              balances: {
                ...person.balances,
                [currency]: Math.round(((person.balances[currency] || 0) + share.amount) * 100) / 100,
              },
            };
            peopleToSyncSet.add(person.id);
          }
        });
      }

      peopleToSyncSet.forEach(async personId => {
        const person = updatedPeople.find(entry => entry.id === personId);
        if (!person) {
          return;
        }

        try {
          await withSyncManager(syncManager => syncManager.syncPerson(person));
        } catch (error) {
          console.error('Failed to sync person balance after update:', error);
        }
      });

      return {
        ...prev,
        transactions: finalTransactions,
        people: updatedPeople,
      };
    });

    try {
      await withSyncManager(syncManager => syncManager.syncTransaction(updated));
    } catch (error) {
      console.error('Failed to sync transaction update:', error);
      addToast(getTranslations().transactionUpdatedSyncFailed, 'error');
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
        const toRate = state.rates.rates[targetAccount.currency];
        const fromRate = state.rates.rates[updated.currency];
        const rate = (toRate && fromRate && fromRate !== 0) ? toRate / fromRate : 1;
        const rawAmount = updated.amount * rate;
        const convertedAmount = Number.isFinite(rawAmount) ? parseFloat(rawAmount.toFixed(2)) : updated.amount;

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
    addToast(getTranslations().transactionUpdated, 'success');
  }, [addToast, addTransaction, closeEditModal, closeReceiptModal, createId, setSelectedTransaction, setState, state.accounts, state.rates, state.transactions]);

  return {
    addTransaction,
    deleteTransaction,
    batchDeleteTransactions,
    updateTransaction,
  };
}
