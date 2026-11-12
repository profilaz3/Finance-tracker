import { useEffect } from 'react';
import { getSyncManager } from '../services/runtimeServices';
import { AppState } from '../types';
import { CONFIG } from '../config';
import { buildSettingsSyncPayload } from '../utils/settingsSync';

export function useSync(
  state: AppState,
  isAuthenticated: boolean | null
) {
  useEffect(() => {
    const autoSync = async () => {
      if (!isAuthenticated) return;

      try {
        const syncManager = await getSyncManager();
        await syncManager.syncSettings(buildSettingsSyncPayload(state));
      } catch (e: unknown) {
        console.error('Settings sync failed:', e);
      }
    };

    const timeoutId = setTimeout(() => autoSync(), CONFIG.AUTO_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [state.theme, state.language, state.baseCurrency, state.userProfile, isAuthenticated]);
}
