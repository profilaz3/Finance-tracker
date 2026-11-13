import { useEffect, useRef } from 'react';

/**
 * Opens the Exchange rates sheet from anywhere (Home rates block, Settings) without threading a
 * callback through the view router. AppSheets listens and owns the sheet.
 */

const RATES_EVENT = 'finance:rates';

export const openRates = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RATES_EVENT));
};

export const useRatesRequests = (handler: () => void): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = () => handlerRef.current();
    window.addEventListener(RATES_EVENT, listener);
    return () => window.removeEventListener(RATES_EVENT, listener);
  }, []);
};
