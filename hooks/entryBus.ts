import { useEffect, useRef } from 'react';

/**
 * Window events for entry actions that start far from the state that handles them (same pattern as
 * `components/rates/ratesBus.ts`). Requests are cancelable: a listener calls preventDefault to say
 * it handled one, so the caller can fall back when nothing listens.
 */

const ADD_MENU_EVENT = 'finance:add-menu';
const DELETE_TEMPLATE_EVENT = 'finance:delete-template';

const request = (name: string, detail?: unknown): boolean => {
  if (typeof window === 'undefined') return false;
  return !window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true }));
};

const useRequests = <T,>(name: string, handler: (detail: T) => void): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener = (event: Event) => {
      event.preventDefault();
      handlerRef.current((event as CustomEvent<T>).detail);
    };
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name]);
};

/** Opens the Add menu (the + button's menu), growing from `anchor`. Returns false when nothing listens yet. */
export const requestAddMenu = (anchor?: HTMLElement | null): boolean => request(ADD_MENU_EVENT, anchor ?? null);

/** For the owner of the Add menu (App): `useAddMenuRequests(anchor => openAddMenu(anchor))`. */
export const useAddMenuRequests = (handler: (anchor: HTMLElement | null) => void): void =>
  useRequests<HTMLElement | null>(ADD_MENU_EVENT, anchor => handler(anchor ?? null));

/** Deletes a saved template (with undo). Returns false when nothing listens. */
export const requestTemplateDelete = (templateId: string): boolean => request(DELETE_TEMPLATE_EVENT, templateId);

export const useTemplateDeleteRequests = (handler: (templateId: string) => void): void =>
  useRequests<string>(DELETE_TEMPLATE_EVENT, handler);

interface WalletEntryRequest {
  accountId: string;
  kind: 'income' | 'transfer';
}

const WALLET_ENTRY_EVENT = 'finance:wallet-entry';
export const requestWalletEntry = (detail: WalletEntryRequest) => request(WALLET_ENTRY_EVENT, detail);
export const useWalletEntryRequests = (handler: (detail: WalletEntryRequest) => void) =>
  useRequests(WALLET_ENTRY_EVENT, handler);
