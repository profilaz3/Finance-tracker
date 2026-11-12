import { useState, useEffect, useCallback } from 'react';
import { getOfflineQueue, getSupabaseService } from '../services/runtimeServices';
import { AppState } from '../types';
import { clearPersistedState, createInitialState, saveState } from '../services/storageService';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const supabaseService = await getSupabaseService();
      const user = await supabaseService.getUser();
      if (user) {
        setIsAuthenticated(true);
        return true;
      } else {
        setIsAuthenticated(false);
        return false;
      }
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
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async (): Promise<AppState> => {
    const supabaseService = await getSupabaseService();
    await supabaseService.signOut();
    const offlineQueue = await getOfflineQueue();
    offlineQueue.clear();
    setIsAuthenticated(false);
    clearPersistedState();
    const freshState = createInitialState();
    saveState(freshState);
    return freshState;
  }, []);

  const handleDeleteAccount = useCallback(async (): Promise<AppState> => {
    const supabaseService = await getSupabaseService();
    await supabaseService.deleteUserAccount();
    const offlineQueue = await getOfflineQueue();
    offlineQueue.clear();
    setIsAuthenticated(false);
    clearPersistedState();
    const freshState = createInitialState();
    saveState(freshState);
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
