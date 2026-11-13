import { useEffect, useState } from 'react';
import { fetchRatesWithMeta, type RatesSource } from '../services/currencyService';
import { saveState } from '../services/storageService';
import { AppState } from '../types';

export interface ExchangeRatesStatus {
  /** When the rates in use were fetched from the API (ms epoch); null when unknown. */
  ratesUpdatedAt: number | null;
  isStale: boolean;
  source: RatesSource | null;
}

export function useExchangeRates(
  isAuthenticated: boolean | null,
  setState: React.Dispatch<React.SetStateAction<AppState>>
): ExchangeRatesStatus {
  const [status, setStatus] = useState<ExchangeRatesStatus>({ ratesUpdatedAt: null, isStale: false, source: null });

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const updateRates = async () => {
      const result = await fetchRatesWithMeta();
      if (cancelled) return;
      setStatus({ ratesUpdatedAt: result.updatedAt, isStale: result.isStale, source: result.source });

      // Built-in defaults are a last resort: never replace rates the user
      // already has (persisted from an earlier successful fetch) with them.
      if (result.source === 'default') return;

      setState(prev => {
        const newState = { ...prev, rates: result.rates };
        saveState(newState);
        return newState;
      });
    };
    updateRates();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setState]);

  return status;
}
