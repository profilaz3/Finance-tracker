import { useEffect, useRef } from 'react';
import { getSyncManager } from '../services/runtimeServices';
import { AppState } from '../types';
import { CONFIG } from '../config';
import { buildSettingsSyncPayload } from '../utils/settingsSync';

/**
 * Push settings changes to Supabase.
 *
 * Does nothing until the server settings have been hydrated: before that the
 * local values are defaults (or stale), and pushing them would overwrite the
 * real settings and null out `user_profile`. The hydrated snapshot itself is
 * recorded as the baseline, so only later user changes are sent.
 */
export function useSync(
  state: AppState,
  isAuthenticated: boolean | null,
  isHydrated: boolean
) {
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isHydrated) {
      baselineRef.current = null;
      return;
    }

    const payload = buildSettingsSyncPayload(state);
    const serialized = JSON.stringify(payload);

    if (baselineRef.current === null) {
      baselineRef.current = serialized;
      return;
    }
    if (baselineRef.current === serialized) return;

    const timeoutId = setTimeout(async () => {
      baselineRef.current = serialized;
      try {
        const syncManager = await getSyncManager();
        await syncManager.syncSettings(payload);
      } catch (e: unknown) {
        console.error('Settings sync failed:', e);
      }
    }, CONFIG.AUTO_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [state.language, state.baseCurrency, state.userProfile, state.appearance, state.homeLayout, state.homeHeader, state.budget, state.teamBudgets, state.paymentDetails, isAuthenticated, isHydrated]);
}
