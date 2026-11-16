import { useEffect, useRef } from 'react';
import { createPaneSlot, WIDE_PANE_QUERY } from '../../utils/paneSlot';

/**
 * Opens an entry's details card from anywhere (activity list, calendar, Home, an event) without
 * threading callbacks through every view. App listens and owns the card.
 *
 * The card grows out of the row that was tapped and shrinks back into it. Callers may pass that
 * row; otherwise the last element pressed (or the focused one, for the keyboard) is used.
 */
const EVENT = 'finance:transaction-details';

interface DetailsRequest {
  id: string;
  origin: Element | null;
  /** Opened while the Activity side pane was on screen: show it there, never as a pop-up. */
  inPane: boolean;
}

/**
 * On wide windows Activity shows the open entry beside the list instead of a pop-up card. It
 * registers the element here and App renders the card into it. Each open records whether the pane
 * was there, so leaving Activity closes the entry instead of turning it into a pop-up.
 */
export const DETAILS_PANE_QUERY = WIDE_PANE_QUERY;
const detailsPane = createPaneSlot();
export const setDetailsPaneSlot = detailsPane.set;
export const releaseDetailsPaneSlot = detailsPane.release;
export const useDetailsPaneSlot = detailsPane.use;

/** A press older than this is not what opened the card (a voice or scripted open). */
const PRESS_WINDOW_MS = 1500;
const ROW_SELECTOR = '[data-transaction-row], [data-details-origin]';
const TAPPABLE_SELECTOR = 'button, [role="button"], a, li';

let lastPress: { element: Element; at: number } | null = null;

const rememberPress = (event: Event) => {
  if (event.target instanceof Element) lastPress = { element: event.target, at: Date.now() };
};

const resolveOrigin = (explicit?: Element | null): Element | null => {
  if (typeof document === 'undefined') return null;
  const pressed = lastPress && Date.now() - lastPress.at < PRESS_WINDOW_MS ? lastPress.element : null;
  const focused = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const start = explicit ?? pressed ?? focused;
  if (!start?.isConnected) return null;
  return start.closest(ROW_SELECTOR) ?? start.closest(TAPPABLE_SELECTOR) ?? start;
};

export const openTransactionDetails = (transactionId: string, origin?: Element | null): void => {
  if (typeof window === 'undefined' || !transactionId) return;
  window.dispatchEvent(
    new CustomEvent<DetailsRequest>(EVENT, { detail: { id: transactionId, origin: resolveOrigin(origin), inPane: detailsPane.get() !== null } }),
  );
};

export const useTransactionDetailsRequests = (handler: (transactionId: string, origin: Element | null, inPane: boolean) => void): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<DetailsRequest>).detail;
      if (detail && typeof detail.id === 'string' && detail.id) handlerRef.current(detail.id, detail.origin ?? null, detail.inPane === true);
    };
    window.addEventListener(EVENT, listener);
    window.addEventListener('pointerdown', rememberPress, { capture: true, passive: true });
    return () => {
      window.removeEventListener(EVENT, listener);
      window.removeEventListener('pointerdown', rememberPress, { capture: true });
    };
  }, []);
};
