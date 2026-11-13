import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// After a deploy, an already-open tab still references the old hashed chunk names, which
// no longer exist on the server. Reloading once picks up the new index.html. The
// sessionStorage timestamp stops a reload loop when the chunk is genuinely unreachable
// (offline, server outage): within the window the error goes to the error boundary.
const RELOAD_KEY = 'finance:chunk-reload-at';
const RELOAD_WINDOW_MS = 10_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite CSS preload
  /ChunkLoadError/i,
];

export const isChunkLoadError = (error: unknown): boolean => {
  if (!error) return false;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(text));
};

const readLastReload = (): number => {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
};

/**
 * Reloads the page once per window. Returns true when a reload was triggered.
 * If sessionStorage is unavailable we cannot guard against loops, so we do not reload.
 */
export const reloadOnceForStaleChunk = (now: number = Date.now()): boolean => {
  if (typeof window === 'undefined') return false;
  const lastReload = readLastReload();
  if (lastReload > 0 && now - lastReload < RELOAD_WINDOW_MS) return false;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
};

export async function loadWithReload<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (isChunkLoadError(error) && reloadOnceForStaleChunk()) {
      // Stay suspended until the reload replaces the page.
      return new Promise<T>(() => {});
    }
    throw error;
  }
}

export type PreloadableLazy<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  /** Fetch the chunk ahead of time; the first render then needs no Suspense fallback. */
  preload: () => Promise<void>;
};

/** React.lazy that reloads the page once when the chunk is missing after a deploy. */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableLazy<T> {
  let loaded: { default: T } | null = null;
  let pending: Promise<{ default: T }> | null = null;
  const load = () =>
    (pending ??= loadWithReload(factory).then(
      module => {
        loaded = module;
        return module;
      },
      error => {
        pending = null;
        throw error;
      },
    ));
  // A preloaded module resolves synchronously, so React renders it without suspending.
  const component = lazy(() =>
    loaded ? ({ then: (resolve: (module: { default: T }) => void) => resolve(loaded!) } as unknown as Promise<{ default: T }>) : load(),
  );
  return Object.assign(component, { preload: () => load().then(() => undefined) });
}

/** Vite fires vite:preloadError when a modulepreload/CSS dependency fails to load. */
export const installPreloadErrorReload = (): void => {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', event => {
    if (reloadOnceForStaleChunk()) {
      event.preventDefault();
    }
  });
};
