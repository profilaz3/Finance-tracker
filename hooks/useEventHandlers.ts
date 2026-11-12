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
import { normalizeParticipantEmail } from '../utils/eventParticipants';

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
      addToast('Event created successfully', 'success');
    } catch (error) {
      console.error('Failed to sync event:', error);
      addToast('Event created locally, but sync failed', 'error');
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
    if (!window.confirm('Are you sure you want to delete this event?')) return;

    setState(prev => ({ ...prev, events: deleteEventFromCollection(prev.events, id) }));
    if (selectedEvent?.id === id) setSelectedEvent(null);

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteEvent(id);
      addToast('Event deleted', 'info');
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  }, [addToast, selectedEvent?.id, setSelectedEvent, setState]);

  const handleAddSharedExpense = useCallback(async (expense: SharedExpense) => {
    const { expenses, isUpdate } = upsertSharedExpenseInCollection(state.sharedExpenses, expense);

    setState(prev => ({ ...prev, sharedExpenses: expenses }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncSharedExpense(expense);
      addToast(isUpdate ? 'Shared expense updated' : 'Shared expense added', 'success');
    } catch (error) {
      console.error('Failed to sync shared expense:', error);
      addToast('Saved locally, but sync failed', 'error');
    }
  }, [addToast, setState, state.sharedExpenses]);

  const handleDeleteSharedExpense = useCallback(async (id: string) => {
    setState(prev => ({ ...prev, sharedExpenses: deleteSharedExpenseFromCollection(prev.sharedExpenses, id) }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteSharedExpense(id);
    } catch (error) {
      console.error('Failed to delete shared expense:', error);
    }
  }, [setState]);

  const handleShareEvent = useCallback(async (id: string, email: string) => {
    const event = state.events.find(e => e.id === id);
    if (!event) {
      throw new Error('Event not found');
    }

    const normalizedEmail = normalizeParticipantEmail(email);
    if (!normalizedEmail) {
      throw new Error('Email is required');
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
