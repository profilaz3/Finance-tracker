import { useEffect, useRef } from 'react';
import type { AppState } from '../types';
import { buildWidgetSnapshot, isFinanceBridgeAvailable, updateHomeWidget } from '../utils/widgetBridge';

const DEBOUNCE_MS = 1200;

/**
 * Keeps the Android home screen widget in step with the app: this month's spending and the
 * budget left. Pushes after data changes (debounced) and whenever the app comes back to the
 * foreground, so a new month or day shows up. Does nothing on the web, or while the sign-in
 * state is still unknown (null).
 */
export function useWidgetSync(state: AppState, isAuthenticated: boolean | null): void {
  const latest = useRef({ state, isAuthenticated });
  latest.current = { state, isAuthenticated };

  const { transactions, categories, baseCurrency, rates, budget, language } = state;

  useEffect(() => {
    if (isAuthenticated === null || !isFinanceBridgeAvailable()) return;
    const timer = window.setTimeout(() => {
      void updateHomeWidget(buildWidgetSnapshot(isAuthenticated ? { transactions, categories, baseCurrency, rates, budget, language } : null));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, transactions, categories, baseCurrency, rates, budget, language]);

  useEffect(() => {
    if (!isFinanceBridgeAvailable()) return;
    const onVisible = () => {
      const { state: current, isAuthenticated: signedIn } = latest.current;
      if (document.visibilityState !== 'visible' || signedIn === null) return;
      void updateHomeWidget(buildWidgetSnapshot(signedIn ? current : null));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
