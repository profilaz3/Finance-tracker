import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppState, Event, SharedExpense } from '../types';
import { getSupabaseService, getSyncManager } from '../services/runtimeServices';
import {
  addEventToCollection,
  deleteEventFromCollection,
  deleteSharedExpenseFromCollection,
  shareEventInCollection,
  upsertEventInCollection,
  upsertSharedExpenseInCollection,
} from '../domain/events';
import { isSettlementExpense } from '../domain/settle';
import { normalizeParticipantEmail } from '../utils/eventParticipants';
import { getTranslations } from '../utils/i18n';
import { TRANSLATIONS } from '../constants';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UseEventHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  selectedEvent: Event | null;
  setSelectedEvent: Dispatch<SetStateAction<Event | null>>;
  addToast: AddToast;
}

export function useEventHandlers({
  state,
  setState,
  selectedEvent,
  setSelectedEvent,
  addToast,
}: UseEventHandlersOptions) {
  const handleCreateEvent = useCallback(async (event: Event) => {
    setState(prev => ({ ...prev, events: addEventToCollection(prev.events, event) }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.syncEvent(event);
      addToast(getTranslations().eventCreated, 'success');
    } catch (error) {
      console.error('Failed to sync event:', error);
      addToast(getTranslations().eventCreatedSyncFailed, 'error');
    }
  }, [addToast, setState]);

  const handleUpdateEvent = useCallback(async (id: string, updates: Partial<Event>) => {
    const { events, updatedEvent } = upsertEventInCollection(state.events, id, updates);
    if (!updatedEvent) return;

    setState(prev => ({ ...prev, events }));

    if (selectedEvent?.id === id) {
      setSelectedEvent(updatedEvent);
    }

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncEvent(updatedEvent);
    } catch (error) {
      console.error('Failed to sync event update:', error);
    }
  }, [selectedEvent?.id, setSelectedEvent, setState, state.events]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    // Cascading delete (removes its shared expenses): EventHeader confirms with ConfirmDialog first.
    setState(prev => ({ ...prev, events: deleteEventFromCollection(prev.events, id) }));
    if (selectedEvent?.id === id) setSelectedEvent(null);

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteEvent(id);
      addToast(getTranslations().eventDeleted, 'info');
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  }, [addToast, selectedEvent?.id, setSelectedEvent, setState]);

  const handleAddSharedExpense = useCallback(async (expense: SharedExpense) => {
    const { expenses, isUpdate } = upsertSharedExpenseInCollection(state.sharedExpenses, expense);

    setState(prev => ({ ...prev, sharedExpenses: expenses }));

    const settlement = !isUpdate && isSettlementExpense(expense);
    if (settlement) {
      // Recording a payment is one tap, so it gets an Undo right away (sync failures still toast).
      const t = TRANSLATIONS[state.language];
      addToast(t.settlementRecorded, 'success', {
        label: t.undo,
        onClick: () => {
          setState(prev => ({ ...prev, sharedExpenses: deleteSharedExpenseFromCollection(prev.sharedExpenses, expense.id) }));
          addToast(t.settlementRemoved, 'info');
          void getSyncManager()
            .then(syncManager => syncManager.deleteSharedExpense(expense.id))
            .catch(error => console.error('Failed to undo settlement:', error));
        },
      });
    }

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncSharedExpense(expense);
      if (!settlement) {
        addToast(isUpdate ? getTranslations().sharedExpenseUpdated : getTranslations().sharedExpenseAdded, 'success');
      }
    } catch (error) {
      console.error('Failed to sync shared expense:', error);
      addToast(getTranslations().savedLocallySyncFailed, 'error');
    }
  }, [addToast, setState, state.language, state.sharedExpenses]);

  // Single-item delete: no confirm, an Undo toast restores the expense.
  const handleDeleteSharedExpense = useCallback(async (id: string) => {
    const deleted = state.sharedExpenses.find(expense => expense.id === id);

    setState(prev => ({ ...prev, sharedExpenses: deleteSharedExpenseFromCollection(prev.sharedExpenses, id) }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteSharedExpense(id);
    } catch (error) {
      console.error('Failed to delete shared expense:', error);
    }

    if (!deleted) return;
    const t = TRANSLATIONS[state.language];
    addToast(t.sharedExpenseDeleted, 'info', {
      label: t.undo,
      onClick: () => {
        setState(prev => ({
          ...prev,
          sharedExpenses: upsertSharedExpenseInCollection(prev.sharedExpenses, deleted).expenses,
        }));
        void getSyncManager()
          .then(syncManager => syncManager.syncSharedExpense(deleted))
          .catch(error => console.error('Failed to sync restored shared expense:', error));
      },
    });
  }, [addToast, setState, state.language, state.sharedExpenses]);

  const handleShareEvent = useCallback(async (id: string, email: string) => {
    const event = state.events.find(e => e.id === id);
    if (!event) {
      throw new Error(getTranslations().eventNotFound);
    }

    const normalizedEmail = normalizeParticipantEmail(email);
    if (!normalizedEmail) {
      throw new Error(getTranslations().emailRequired);
    }

    const supabaseService = await getSupabaseService();
    await supabaseService.shareEventByEmail(id, normalizedEmail);

    const { events, updatedEvent } = shareEventInCollection(state.events, id, normalizedEmail);
    setState(prev => ({ ...prev, events }));

    if (selectedEvent?.id === id && updatedEvent) {
      setSelectedEvent(updatedEvent);
    }
  }, [selectedEvent?.id, setSelectedEvent, setState, state.events]);

  return {
    handleCreateEvent,
    handleUpdateEvent,
    handleDeleteEvent,
    handleAddSharedExpense,
    handleDeleteSharedExpense,
    handleShareEvent,
  };
}
