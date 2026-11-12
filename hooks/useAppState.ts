import { useState, useEffect, useCallback } from 'react';
import { AppState, Category } from '../types';
import { flushSaveState, loadState, saveState, normalizeTheme } from '../services/storageService';
import { getSupabaseService } from '../services/runtimeServices';
import { INITIAL_CATEGORIES } from '../constants';

export function useAppState() {
  const [state, setState] = useState<AppState>(loadState());

  // Persist state to localStorage on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const flushPendingState = () => flushSaveState();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingState();
      }
    };

    window.addEventListener('beforeunload', flushPendingState);
    window.addEventListener('pagehide', flushPendingState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flushPendingState);
      window.removeEventListener('pagehide', flushPendingState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Ensure Internal Transfer category exists (migration)
  useEffect(() => {
    const hasInternalTransfer = state.categories.some(c => c.id === 'internal-transfer');
    if (!hasInternalTransfer) {
      const internalTransferCat: Category = {
        id: 'internal-transfer',
        name: 'Internal Transfer',
        type: 'income' as const,
        subcategories: ['Between Accounts'],
        color: '#9E9E9E'
      };
      setState(prev => ({
        ...prev,
        categories: [...prev.categories, internalTransferCat]
      }));
    }
  }, []);

  // Migrate old category names and types
  useEffect(() => {
    let needsUpdate = false;

    const correctIncoming = INITIAL_CATEGORIES.find(c => c.id === 'debt-repayment')!;
    const correctOutgoing = INITIAL_CATEGORIES.find(c => c.id === 'loan-repayment')!;

    const updatedCategories = state.categories.map(c => {
      if (c.id === 'debt-repayment' && (c.name !== correctIncoming.name || c.type !== correctIncoming.type)) {
        needsUpdate = true;
        return correctIncoming;
      }
      if (c.id === 'loan-repayment' && (c.name !== correctOutgoing.name || c.type !== correctOutgoing.type)) {
        needsUpdate = true;
        return correctOutgoing;
      }
      return c;
    });

    if (needsUpdate) {
      setState(prev => ({ ...prev, categories: updatedCategories }));
    }
  }, [state.categories]);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.forEach(cls => {
      if (cls.startsWith('theme-')) root.classList.remove(cls);
    });
    root.classList.add(`theme-${state.theme}`);
  }, [state.theme]);

  // Fetch remote state from Supabase
  const fetchRemoteState = useCallback(async () => {
    try {
      const supabaseService = await getSupabaseService();
      const remoteState = await supabaseService.fetchFullState();
      setState(prev => ({
        ...prev,
        ...remoteState,
        theme: normalizeTheme(remoteState.theme ?? prev.theme),
        transactions: remoteState.transactions || [],
        categories: remoteState.categories || [],
        accounts: remoteState.accounts || [],
        people: remoteState.people || [],
        events: remoteState.events || [],
        sharedExpenses: remoteState.sharedExpenses || []
      }));
      return remoteState;
    } catch (error) {
      console.error('Failed to load state:', error);
      return null;
    }
  }, []);

  return {
    state,
    setState,
    fetchRemoteState,
  };
}
