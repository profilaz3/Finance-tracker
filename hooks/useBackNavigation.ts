import { useCallback, useEffect, useRef } from 'react';
import type { View } from '../types';

/**
 * Browser history + Android hardware back integration.
 *
 * The app has no router: views are `currentView` state and overlays (modals, the person
 * sheet, the event detail screen) are booleans. This hook mirrors that state into
 * `history` so Back behaves like users expect:
 *
 * - each view change pushes an entry; Back returns to the previous view
 * - each overlay that opens pushes an entry; Back closes the top-most overlay
 * - an overlay closed from the UI (X button, save) consumes its own entry, so the next
 *   Back does not land on a stale "modal open" entry
 * - on Android the hardware back button does the same and exits the app only from the
 *   root view with nothing open
 *
 * Every entry stores `{ view, depth }` (depth = number of open overlays). popstate
 * reconciles towards the target entry instead of assuming one step at a time, so
 * long-press "back to..." menus and history.go(-n) also work.
 */

export interface BackLayer {
  /** Stable id for the overlay (e.g. 'edit-transaction'). */
  id: string;
  isOpen: boolean;
  close: () => void;
}

interface HistoryEntry {
  financeNav: true;
  view: View;
  depth: number;
}

interface UseBackNavigationOptions {
  currentView: View;
  setView: (view: View) => void;
  layers: BackLayer[];
  rootView?: View;
}

/** A history.go() that has not landed after this long never will (nothing to go back to). */
const STALE_BACK_MS = 1000;

const isHistoryEntry = (value: unknown): value is HistoryEntry =>
  typeof value === 'object' &&
  value !== null &&
  (value as Partial<HistoryEntry>).financeNav === true &&
  typeof (value as Partial<HistoryEntry>).view === 'string' &&
  typeof (value as Partial<HistoryEntry>).depth === 'number';

// window.Capacitor is injected by the native runtime; checking it avoids pulling
// @capacitor/core into the startup bundle just to detect the platform.
const isNativePlatform = () =>
  typeof window !== 'undefined' &&
  Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

/** Pure reconciliation step, exported for tests. */
export type HistoryAction =
  | { type: 'none' }
  | { type: 'replace'; entry: HistoryEntry }
  | { type: 'push'; entries: HistoryEntry[] }
  | { type: 'back'; steps: number };

export function planHistorySync(current: unknown, desired: HistoryEntry): HistoryAction {
  if (!isHistoryEntry(current)) {
    return { type: 'replace', entry: desired };
  }
  if (current.view === desired.view && current.depth === desired.depth) {
    return { type: 'none' };
  }
  if (current.view !== desired.view) {
    return { type: 'push', entries: [desired] };
  }
  if (desired.depth > current.depth) {
    const entries: HistoryEntry[] = [];
    for (let depth = current.depth + 1; depth <= desired.depth; depth += 1) {
      entries.push({ ...desired, depth });
    }
    return { type: 'push', entries };
  }
  return { type: 'back', steps: current.depth - desired.depth };
}

export function useBackNavigation({ currentView, setView, layers, rootView = 'dashboard' }: UseBackNavigationOptions) {
  const stackRef = useRef<string[]>([]);
  const closersRef = useRef(new Map<string, () => void>());
  const setViewRef = useRef(setView);
  const desiredRef = useRef<HistoryEntry>({ financeNav: true, view: currentView, depth: 0 });
  const ignorePopsRef = useRef(0);
  const backStartedRef = useRef(0);
  const initializedRef = useRef(false);

  /** Moves history from the entry it is on to the one the screen wants. */
  const syncHistory = useCallback(() => {
    const action = planHistorySync(window.history.state, desiredRef.current);
    switch (action.type) {
      case 'replace':
        window.history.replaceState(action.entry, '');
        break;
      case 'push':
        action.entries.forEach(entry => window.history.pushState(entry, ''));
        break;
      case 'back':
        ignorePopsRef.current += 1;
        backStartedRef.current = Date.now();
        window.history.go(-action.steps);
        break;
      default:
        break;
    }
  }, []);

  closersRef.current = new Map(layers.map(layer => [layer.id, layer.close]));
  setViewRef.current = setView;

  const openKey = layers.filter(layer => layer.isOpen).map(layer => layer.id).join('|');

  // Mirror view + overlay state into history.
  useEffect(() => {
    const openIds = openKey ? openKey.split('|') : [];
    const open = new Set(openIds);
    const stack = stackRef.current.filter(id => open.has(id));
    for (const id of openIds) {
      if (!stack.includes(id)) stack.push(id);
    }
    stackRef.current = stack;

    const desired: HistoryEntry = { financeNav: true, view: currentView, depth: stack.length };
    desiredRef.current = desired;

    if (!initializedRef.current) {
      // A reload restores history.state from the previous page life; app state starts fresh.
      initializedRef.current = true;
      window.history.replaceState(desired, '');
      return;
    }

    // history.go() lands asynchronously. A layer that opens while a closed one is still being
    // consumed (a sheet opened from a menu that just closed) must not be planned against the
    // entry we are leaving, so wait for the pop and sync from where it lands.
    if (ignorePopsRef.current > 0 && Date.now() - backStartedRef.current < STALE_BACK_MS) return;
    ignorePopsRef.current = 0;
    syncHistory();
  }, [currentView, openKey, syncHistory]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (ignorePopsRef.current > 0) {
        ignorePopsRef.current -= 1;
        // The screen may have changed while we were going back (a view change, or a layer that
        // opened right after another closed); catch history up from the entry we landed on.
        if (ignorePopsRef.current === 0) syncHistory();
        return;
      }

      const target: HistoryEntry = isHistoryEntry(event.state)
        ? event.state
        : { financeNav: true, view: rootView, depth: 0 };
      const stack = stackRef.current;

      if (target.depth < stack.length) {
        // Close from the top down; each overlay's own close handler resets its state.
        stack.slice(target.depth).reverse().forEach(id => closersRef.current.get(id)?.());
      } else if (target.depth > stack.length) {
        // Forward into an overlay that is no longer open: it cannot be restored.
        window.history.replaceState({ ...target, depth: stack.length }, '');
      }

      if (target.view !== desiredRef.current.view) {
        setViewRef.current(target.view);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [rootView, syncHistory]);

  /** Closes the top overlay. Returns false when nothing was open. */
  const closeTopLayer = useCallback((): boolean => {
    if (stackRef.current.length === 0) return false;
    window.history.back();
    return true;
  }, []);

  /** Closes the top overlay, else goes to the previous view. Returns false at the root. */
  const goBack = useCallback((): boolean => {
    if (closeTopLayer()) return true;
    if (desiredRef.current.view === rootView) return false;
    const current = window.history.state;
    if (isHistoryEntry(current) && window.history.length > 1) {
      window.history.back();
    } else {
      setViewRef.current(rootView);
    }
    return true;
  }, [closeTopLayer, rootView]);

  // Android hardware back button. Registering a listener disables Capacitor's default
  // (WebView back / exit), so we decide: go back in-app, or exit from the root.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  useEffect(() => {
    if (!isNativePlatform()) return;

    let cancelled = false;
    let removeListener: (() => void) | undefined;

    import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('backButton', () => {
          if (!goBackRef.current()) {
            void App.exitApp();
          }
        })
      )
      .then(handle => {
        if (cancelled) {
          void handle.remove();
        } else {
          removeListener = () => void handle.remove();
        }
      })
      .catch(error => {
        console.error('Failed to register Android back button handler:', error);
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  return { goBack, closeTopLayer };
}
