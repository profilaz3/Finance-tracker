import { useEffect, useRef } from 'react';
import type { Currency } from '../../types';

/**
 * Opens the payment QR sheet from anywhere (person detail, event settle up) without threading
 * callbacks through the view router. AppModals listens and owns the sheet.
 */

export interface PaymentRequestInput {
  /** What is owed, in its own currency; the sheet converts to dinars. */
  amount: number;
  currency: Currency;
  /** Who pays, for the sheet's subtitle and the shared image. */
  payerName?: string;
  /** Prefilled payment purpose (event name, "Settle up"). */
  purpose?: string;
  /**
   * Records the debt as paid. `full` is true when the requested dinars cover the whole debt;
   * `amount` is what was requested, back in the debt's currency.
   */
  onSettled?: (result: { full: boolean; amount: number }) => void;
}

const PAYMENT_EVENT = 'finance:payment-request';

export const openPaymentRequest = (request: PaymentRequestInput): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PaymentRequestInput>(PAYMENT_EVENT, { detail: request }));
};

export const usePaymentRequests = (handler: (request: PaymentRequestInput) => void): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PaymentRequestInput>).detail;
      if (detail) handlerRef.current(detail);
    };
    window.addEventListener(PAYMENT_EVENT, listener);
    return () => window.removeEventListener(PAYMENT_EVENT, listener);
  }, []);
};
