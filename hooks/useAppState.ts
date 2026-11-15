import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { applyAppearanceToRoot, resolveAppearance } from '../utils/appearance';
import { AppState, Category } from '../types';
import { applyExternalSegmentChange, flushSaveState, loadState, saveState } from '../services/storageService';
import { getOfflineQueue, getSupabaseService, getSyncManager } from '../services/runtimeServices';
import { collectSeedRecords, mergeRemoteState } from '../services/hydration';
import type { RemoteSlice } from '../services/hydration';
import { INITIAL_CATEGORIES } from '../constants';

/**
 * - `idle`: not signed in / not attempted
 * - `hydrating`: replaying the queue and fetching
 * - `hydrated`: every slice fetched; server-dependent work (settings sync, recurring generation) may run
 * - `partial`: some slices failed and kept their local value; retried when back online
 * - `failed`: the fetch failed entirely (offline); local data is untouched
 */
export type HydrationStatus = 'idle' | 'hydrating' | 'hydrated' | 'partial' | 'failed';

export function useAppState(isAuthenticated: boolean | null = null) {
  const [state, setState] = useState<AppState>(loadState);
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>('idle');
  const [failedSlices, setFailedSlices] = useState<RemoteSlice[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inflightRef = useRef<Promise<Partial<AppState> | null> | null>(null);
  // Bumped on sign-out so a fetch that resolves afterwards is discarded.
  const sessionGenerationRef = useRef(0);

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

  // Another tab saved a state segment: load it instead of overwriting it later.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea && typeof localStorage !== 'undefined' && event.storageArea !== localStorage) return;
      setState(prev => applyExternalSegmentChange(prev, event.key, event.newValue) ?? prev);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Transfers between wallets are booked on the Internal Transfer category, so it must exist:
  // after load and again whenever a sync replaced the categories with a list that lacks it.
  const hasInternalTransfer = state.categories.some(c => c.id === 'internal-transfer');
  useEffect(() => {
    if (hasInternalTransfer) return;
    const internalTransferCat: Category = INITIAL_CATEGORIES.find(c => c.id === 'internal-transfer') ?? {
      id: 'internal-transfer',
      name: 'Internal Transfer',
      type: 'income' as const,
      subcategories: ['Between Accounts'],
      color: '#808080',
    };
    setState(prev => (
      prev.categories.some(c => c.id === 'internal-transfer')
        ? prev
        : { ...prev, categories: [...prev.categories, { ...internalTransferCat }] }
    ));
  }, [hasInternalTransfer]);

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

  // Apply the paper appearance (mode, theme, accent, glass) to <html> before paint; follow the OS in "system" mode.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const appearance = resolveAppearance(state.appearance);
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const apply = () => applyAppearanceToRoot(root, appearance, media?.matches ?? false);
    apply();
    if (appearance.mode !== 'system' || !media) return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state.appearance]);

  /**
   * Hydrate from Supabase without losing local work:
   * 1. push pending debounced writes into the queue and replay the queue;
   * 2. fetch the server snapshot (failed slices are reported, not emptied);
   * 3. merge, re-applying writes that are still pending on top.
   */
  const fetchRemoteState = useCallback((): Promise<Partial<AppState> | null> => {
    if (inflightRef.current) return inflightRef.current;

    const generation = sessionGenerationRef.current;
    setHydrationStatus('hydrating');

    const run = async (): Promise<Partial<AppState> | null> => {
      try {
        const [supabaseService, syncManager, offlineQueue] = await Promise.all([
          getSupabaseService(),
          getSyncManager(),
          getOfflineQueue(),
        ]);

        await syncManager.flushPending();
        if (offlineQueue.online) {
          await offlineQueue.processQueue();
        }

        const remote = await supabaseService.fetchFullState();
        if (generation !== sessionGenerationRef.current) return null;

        const pending = [...offlineQueue.getQueue(), ...syncManager.getPendingWrites()];
        const seeds = collectSeedRecords(stateRef.current, remote);

        setState(prev => mergeRemoteState(prev, remote, pending));
        setFailedSlices(remote.failedSlices);
        setHydrationStatus(remote.failedSlices.length === 0 ? 'hydrated' : 'partial');

        // New account: push the locally generated defaults.
        seeds.categories.forEach(category => {
          syncManager.syncCategory(category).catch(error => console.error('Failed to seed category:', error));
        });
        seeds.accounts.forEach(account => {
          syncManager.syncAccount(account).catch(error => console.error('Failed to seed account:', error));
        });

        return remote.state;
      } catch (error) {
        console.error('Failed to load state:', error);
        if (generation === sessionGenerationRef.current) setHydrationStatus('failed');
        return null;
      }
    };

    const promise = run().finally(() => {
      if (inflightRef.current === promise) inflightRef.current = null;
    });
    inflightRef.current = promise;
    return promise;
  }, []);

  // Signed out: forget hydration and ignore late fetch results. When a session
  // ends (logout or a server-rejected token), drop the previous user's data from
  // memory too; storage was already cleared by the sign-out.
  const wasAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;
      return;
    }
    sessionGenerationRef.current++;
    inflightRef.current = null;
    setHydrationStatus('idle');
    setFailedSlices([]);
    if (isAuthenticated === false && wasAuthenticatedRef.current) {
      wasAuthenticatedRef.current = false;
      setState(loadState());
    }
  }, [isAuthenticated]);

  // Incomplete hydration: try again once the network is back.
  useEffect(() => {
    if (!isAuthenticated || (hydrationStatus !== 'failed' && hydrationStatus !== 'partial')) return;
    const retry = () => {
      void fetchRemoteState();
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [fetchRemoteState, hydrationStatus, isAuthenticated]);

  /** True once the server copy of these slices has been loaded this session. */
  const areSlicesHydrated = useCallback((...slices: RemoteSlice[]) =>
    (hydrationStatus === 'hydrated' || hydrationStatus === 'partial') &&
    slices.every(slice => !failedSlices.includes(slice)),
  [failedSlices, hydrationStatus]);

  return {
    state,
    setState,
    fetchRemoteState,
    hydrationStatus,
    isHydrated: hydrationStatus === 'hydrated',
    areSlicesHydrated,
  };
}
