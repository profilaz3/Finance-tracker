import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppState, RecurringTransaction, Transaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { getSyncManager } from '../services/runtimeServices';
import { getDueOccurrences, getOccurrenceTimestamp, isDue } from '../utils/recurringUtils';
import { buildRecurringOccurrenceId } from '../utils/recurringOccurrence';

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
    // The database rejects negative amounts (recurring_amount_check); never report those as added.
    if (!Number.isFinite(recurring.amount) || recurring.amount <= 0) {
      addToast(TRANSLATIONS[state.language].amountAboveZero, 'error');
      return;
    }
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

  // Single-item delete: no confirm, an Undo toast puts the rule back where it was.
  const handleDeleteRecurring = useCallback(async (id: string) => {
    const index = state.recurringTransactions.findIndex(r => r.id === id);
    const deleted = index === -1 ? undefined : state.recurringTransactions[index];
    const t = TRANSLATIONS[state.language];

    setState(prev => ({
      ...prev,
      recurringTransactions: prev.recurringTransactions.filter(r => r.id !== id),
    }));
    addToast(t.recurringDeleted, 'info', deleted ? {
      label: t.undo,
      onClick: () => {
        setState(prev => {
          if (prev.recurringTransactions.some(r => r.id === deleted.id)) return prev;
          const recurringTransactions = [...prev.recurringTransactions];
          recurringTransactions.splice(Math.min(index, recurringTransactions.length), 0, deleted);
          return { ...prev, recurringTransactions };
        });
        void getSyncManager()
          .then(syncManager => syncManager.syncRecurring(deleted))
          .catch(error => console.error('Failed to sync restored recurring transaction:', error));
      },
    } : undefined);

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteRecurring(id);
    } catch (error) {
      console.error('Failed to delete recurring transaction:', error);
    }
  }, [addToast, setState, state.language, state.recurringTransactions]);

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

    const now = new Date();
    let generatedCount = 0;

    dueRecurrings.forEach(recurring => {
      // One transaction per missed occurrence, each dated on its own due date.
      const { dueDates, nextDue } = getDueOccurrences(recurring, now);
      if (dueDates.length === 0) return;

      dueDates.forEach(dueDate => {
        // Same id for the same occurrence everywhere, so another tab/device cannot duplicate it.
        const occurrenceId = buildRecurringOccurrenceId(recurring.id, dueDate);
        if (state.transactions.some(transaction => transaction.id === occurrenceId)) return;

        const newTransaction: Transaction = {
          id: occurrenceId,
          date: getOccurrenceTimestamp(dueDate, now),
          amount: recurring.amount,
          currency: recurring.currency,
          categoryId: recurring.categoryId,
          accountId: recurring.accountId,
          type: recurring.type,
          note: recurring.note || `[Auto] ${recurring.name}`,
          subcategory: recurring.subcategory,
        };

        addTransaction(newTransaction);
        generatedCount += 1;
      });

      handleUpdateRecurring(recurring.id, {
        lastGenerated: now.toISOString(),
        nextDue,
      });
    });

    if (generatedCount === 0) return;

    addToast(
      TRANSLATIONS[state.language].recurringGenerated.replace('{count}', String(generatedCount)),
      'success'
    );
  }, [addToast, addTransaction, handleUpdateRecurring, state.language, state.recurringTransactions, state.transactions]);

  return {
    handleAddRecurring,
    handleUpdateRecurring,
    handleDeleteRecurring,
    handleToggleRecurring,
    processRecurringTransactions,
  };
}
