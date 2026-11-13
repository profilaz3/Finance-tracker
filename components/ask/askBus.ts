import { useEffect, useRef } from 'react';

/**
 * Opens the Ask sheet from anywhere (Insights bar, profile menu) without threading a callback
 * through the view router. AppModals listens and owns the sheet.
 */

const ASK_EVENT = 'finance:ask';

export const openAsk = (question?: string): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<{ question?: string }>(ASK_EVENT, { detail: { question } }));
};

export const useAskRequests = (handler: (question?: string) => void): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = (event: Event) => handlerRef.current((event as CustomEvent<{ question?: string }>).detail?.question);
    window.addEventListener(ASK_EVENT, listener);
    return () => window.removeEventListener(ASK_EVENT, listener);
  }, []);
};
