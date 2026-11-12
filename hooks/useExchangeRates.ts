import { useEffect } from 'react';
import { fetchRates } from '../services/currencyService';
import { saveState } from '../services/storageService';
import { AppState } from '../types';

export function useExchangeRates(
  isAuthenticated: boolean | null,
  setState: React.Dispatch<React.SetStateAction<AppState>>
) {
  useEffect(() => {
    if (!isAuthenticated) return;
    const updateRates = async () => {
      const rates = await fetchRates();
      setState(prev => {
        const newState = { ...prev, rates };
        saveState(newState);
        return newState;
      });
    };
    updateRates();
  }, [isAuthenticated, setState]);
}
