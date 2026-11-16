import { useSyncExternalStore } from 'react';

/**
 * Windows at least this wide show a screen's open item (an entry on Activity, an event or person on
 * Shared) beside its list instead of as a pop-up or a page of its own.
 */
export const WIDE_PANE_QUERY = '(min-width: 1180px)';

/**
 * Where a screen's side pane is in the page. The screen registers its element while it is on screen;
 * App renders the open item into it with a portal (the item's handlers live in App, not the screen).
 */
export interface PaneSlot {
  set: (element: HTMLElement | null) => void;
  /** Clears the slot only if it is still this element (a newer copy of the screen may own it). */
  release: (element: HTMLElement) => void;
  get: () => HTMLElement | null;
  /** The current element, re-rendering when it changes. */
  use: () => HTMLElement | null;
}

export const createPaneSlot = (): PaneSlot => {
  let element: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  const set = (next: HTMLElement | null) => {
    if (element === next) return;
    element = next;
    listeners.forEach(listener => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const get = () => element;
  return {
    set,
    release: candidate => {
      if (element === candidate) set(null);
    },
    get,
    // A hook: call it from components only.
    use: () => useSyncExternalStore(subscribe, get, () => null),
  };
};
