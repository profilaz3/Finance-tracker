import type { NbsCurrency } from '../../utils/nbsRates';
import type { RateRange } from '../../domain/exchangeRates';
import { useEffect, useRef } from 'react';

/**
 * Opens the Exchange rates sheet from anywhere (Home rates block, Settings) without threading a
 * callback through the view router. AppSheets listens and owns the sheet.
 */

const RATES_EVENT = 'finance:rates';

export interface RatesSelection {
  currency: NbsCurrency;
  range: RateRange;
}

const requestRates = (selection?: RatesSelection): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RATES_EVENT, { detail: selection }));
};

export const openRates = (): void => requestRates();
export const openRatesFor = (currency: NbsCurrency, range: RateRange): void => requestRates({ currency, range });

export const useRatesRequests = (handler: (selection?: RatesSelection) => void): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = (event: Event) => handlerRef.current((event as CustomEvent<RatesSelection>).detail);
    window.addEventListener(RATES_EVENT, listener);
    return () => window.removeEventListener(RATES_EVENT, listener);
  }, []);
};
