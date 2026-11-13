import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppState, RecurringTransaction, Transaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { getSyncManager } from '../services/runtimeServices';
import { isDue, calculateNextDueDate } from '../utils/recurringUtils';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UseRecurringHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  addTransaction: (transaction: Transaction) => Promise<void>;
  addToast: AddToast;
}

export function useRecurringHandlers({
  state,
  setState,
  addTransaction,
  addToast,
}: UseRecurringHandlersOptions) {
  const handleAddRecurring = useCallback(async (recurring: RecurringTransaction) => {
    setState(prev => ({
      ...prev,
      recurringTransactions: [...prev.recurringTransactions, recurring],
    }));
    addToast(TRANSLATIONS[state.language].recurringAdded, 'success');

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncRecurring(recurring);
    } catch (error) {
      console.error('Failed to sync recurring transaction:', error);
    }
  }, [addToast, setState, state.language]);

  const handleUpdateRecurring = useCallback(async (id: string, updates: Partial<RecurringTransaction>) => {
    const updatedRecurring = state.recurringTransactions.find(r => r.id === id);
    if (!updatedRecurring) return;

    const newRecurring = { ...updatedRecurring, ...updates };
    setState(prev => ({
      ...prev,
      recurringTransactions: prev.recurringTransactions.map(r =>
        r.id === id ? newRecurring : r
      ),
    }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncRecurring(newRecurring);
    } catch (error) {
      console.error('Failed to sync recurring transaction:', error);
    }
  }, [setState, state.recurringTransactions]);

  const handleDeleteRecurring = useCallback(async (id: string) => {
    setState(prev => ({
      ...prev,
      recurringTransactions: prev.recurringTransactions.filter(r => r.id !== id),
    }));
    addToast(TRANSLATIONS[state.language].recurringDeleted, 'success');

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteRecurring(id);
    } catch (error) {
      console.error('Failed to delete recurring transaction:', error);
    }
  }, [addToast, setState, state.language]);

  const handleToggleRecurring = useCallback(async (id: string) => {
    const recurring = state.recurringTransactions.find(r => r.id === id);
    if (!recurring) return;

    const updatedRecurring = { ...recurring, isActive: !recurring.isActive };
    setState(prev => ({
      ...prev,
      recurringTransactions: prev.recurringTransactions.map(r =>
        r.id === id ? updatedRecurring : r
      ),
    }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncRecurring(updatedRecurring);
    } catch (error) {
      console.error('Failed to sync recurring transaction:', error);
    }
  }, [setState, state.recurringTransactions]);

  const processRecurringTransactions = useCallback((dueRecurrings = state.recurringTransactions.filter(recurring => isDue(recurring))) => {
    if (dueRecurrings.length === 0) return;

    dueRecurrings.forEach(recurring => {
      const newTransaction: Transaction = {
        id: uuidv4(),
        date: new Date().toISOString(),
        amount: recurring.amount,
        currency: recurring.currency,
        categoryId: recurring.categoryId,
        accountId: recurring.accountId,
        type: recurring.type,
        note: recurring.note || `[Auto] ${recurring.name}`,
        subcategory: recurring.subcategory,
      };

      addTransaction(newTransaction);

      const newNextDue = calculateNextDueDate(recurring.nextDue, recurring.frequency);
      handleUpdateRecurring(recurring.id, {
        lastGenerated: new Date().toISOString(),
        nextDue: newNextDue,
      });
    });

    addToast(
      TRANSLATIONS[state.language].recurringGenerated.replace('{count}', String(dueRecurrings.length)),
      'success'
    );
  }, [addToast, addTransaction, handleUpdateRecurring, state.language, state.recurringTransactions]);

  return {
    handleAddRecurring,
    handleUpdateRecurring,
    handleDeleteRecurring,
    handleToggleRecurring,
    processRecurringTransactions,
  };
}
