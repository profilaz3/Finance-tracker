import { useState, useEffect, useCallback } from 'react';
import { getOfflineQueue, getSupabaseService, getSyncManager } from '../services/runtimeServices';
import { clearSessionIdentityCache } from './useSessionIdentity';
import { AppState } from '../types';
import { clearPersistedState, createInitialState, saveState } from '../services/storageService';
import { CONFIG } from '../config';

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;

const withTimeout = (promise: Promise<unknown>, ms: number): Promise<void> =>
  new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); }
    );
  });

/** Bind the offline queue to the signed-in user so its storage is per-user. */
const bindQueueToUser = async (userId: string | null) => {
  const offlineQueue = await getOfflineQueue();
  offlineQueue.setUser(userId);
};

/**
 * Drop every trace of the session on this device, whether or not the server is
 * reachable: pending debounced writes, the user's queue and dead letters, the
 * Supabase session (falls back to a local sign-out) and persisted app state.
 */
const clearLocalSession = async ({ everywhere = false }: { everywhere?: boolean } = {}): Promise<AppState> => {
  const [supabaseService, syncManager, offlineQueue] = await Promise.all([
    getSupabaseService(),
    getSyncManager(),
    getOfflineQueue(),
  ]);

  syncManager.reset();
  offlineQueue.clearForSignOut();
  clearSessionIdentityCache();
  await supabaseService.signOut({ everywhere });

  clearPersistedState();
  const freshState = createInitialState();
  saveState(freshState);
  return freshState;
};

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const supabaseService = await getSupabaseService();
      // Local session first: works offline on a cold start.
      const user = await supabaseService.getSessionUser();
      await bindQueueToUser(user?.id ?? null);
      setIsAuthenticated(!!user);

      if (user && isOnline()) {
        // Confirm with the server in the background; only a definite rejection signs out.
        void supabaseService.verifyUser().then(async verification => {
          if (verification !== 'invalid') return;
          console.warn('Stored session was rejected by the server, signing out');
          await clearLocalSession();
          setIsAuthenticated(false);
        }).catch(error => console.error('Background session check failed:', error));
      }

      return !!user;
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
      return false;
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogin = useCallback(async () => {
    try {
      const supabaseService = await getSupabaseService();
      const user = await supabaseService.getSessionUser();
      await bindQueueToUser(user?.id ?? null);
    } catch (error) {
      console.error('Failed to bind offline queue to the signed-in user:', error);
    }
    setIsAuthenticated(true);
  }, []);

  /** Signs out of this device; `everywhere` also ends the sessions on the user's other devices. */
  const handleLogout = useCallback(async ({ everywhere = false }: { everywhere?: boolean } = {}): Promise<AppState> => {
    // Give pending writes a bounded chance to reach the server before they are discarded.
    if (isOnline()) {
      await withTimeout((async () => {
        const [syncManager, offlineQueue] = await Promise.all([getSyncManager(), getOfflineQueue()]);
        await syncManager.flushPending();
        await offlineQueue.processQueue();
      })(), CONFIG.LOGOUT_FLUSH_TIMEOUT_MS);
    }

    const freshState = await clearLocalSession({ everywhere });
    setIsAuthenticated(false);
    return freshState;
  }, []);

  const handleDeleteAccount = useCallback(async (): Promise<AppState> => {
    const supabaseService = await getSupabaseService();
    await supabaseService.deleteUserAccount();
    const freshState = await clearLocalSession();
    setIsAuthenticated(false);
    return freshState;
  }, []);

  return {
    isAuthenticated,
    isLoadingAuth,
    handleLogin,
    handleLogout,
    handleDeleteAccount,
  };
}
