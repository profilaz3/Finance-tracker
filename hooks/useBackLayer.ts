import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BackLayer } from './useBackNavigation';

/**
 * Back layers registered from deep inside the tree (a sheet in a Home block, a Settings section).
 *
 * App owns the history (useBackNavigation) but not every overlay's open state: some sheets and
 * sub-pages keep it locally. They call `useBackLayer(id, isOpen, close)`; App merges the open ones
 * into the layers it passes to useBackNavigation, so browser Back and the Android back button close
 * them instead of leaving the screen. Layers stack in the order they opened (later on top).
 */

interface RegisteredLayer {
  /** One entry per hook instance. */
  key: string;
  id: string;
  close: () => void;
}

export interface BackLayerRegistry {
  set: (key: string, layer: { id: string; close: () => void } | null) => void;
}

export const BackLayerContext = createContext<BackLayerRegistry | null>(null);

/**
 * False while a page is parked beside the current one (swipe neighbours stay mounted). Layers of a
 * page that is not on screen are not open as far as Back is concerned, and close when it is left.
 */
export const PageActiveContext = createContext(true);

/** App side: the registry to provide and the open layers to merge into useBackNavigation. */
export function useBackLayerRegistry(): { registry: BackLayerRegistry; layers: BackLayer[] } {
  const [registered, setRegistered] = useState<RegisteredLayer[]>([]);
  const registry = useMemo<BackLayerRegistry>(() => ({
    set: (key, layer) => setRegistered(prev => {
      const index = prev.findIndex(entry => entry.key === key);
      if (!layer) return index < 0 ? prev : prev.filter(entry => entry.key !== key);
      if (index >= 0) {
        if (prev[index].id === layer.id && prev[index].close === layer.close) return prev;
        const next = prev.slice();
        next[index] = { key, ...layer };
        return next;
      }
      // Appended: the order of opening is the stacking order.
      return [...prev, { key, ...layer }];
    }),
  }), []);
  const layers = useMemo<BackLayer[]>(
    () => registered.map(entry => ({ id: entry.id, isOpen: true, close: entry.close })),
    [registered],
  );
  return { registry, layers };
}

/**
 * Makes Back close this sheet or sub-page while it is open. `close` should only reset the local
 * state (it is called from popstate); closing from the UI needs nothing extra, the history entry is
 * consumed automatically. Ids must be unique among layers that can be open at the same time.
 */
export function useBackLayer(id: string, isOpen: boolean, close: () => void): void {
  const registry = useContext(BackLayerContext);
  const pageActive = useContext(PageActiveContext);
  const key = useId();
  const closeRef = useRef(close);
  closeRef.current = close;
  const stableClose = useCallback(() => closeRef.current(), []);
  const open = isOpen && pageActive;

  useLayoutEffect(() => {
    if (!registry) return;
    registry.set(key, open ? { id, close: stableClose } : null);
  }, [registry, key, id, open, stableClose]);

  useLayoutEffect(() => () => registry?.set(key, null), [registry, key]);

  // Leaving the page (it becomes a parked swipe neighbour) closes what was open on it, so coming
  // back starts at the page itself and no hidden layer holds a history entry.
  const wasActive = useRef(pageActive);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  useEffect(() => {
    if (wasActive.current && !pageActive && isOpenRef.current) closeRef.current();
    wasActive.current = pageActive;
  }, [pageActive]);
}
