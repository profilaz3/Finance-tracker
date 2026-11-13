import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, loadWithReload, reloadOnceForStaleChunk } from '../utils/lazyWithReload';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

describe('lazyWithReload', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn();
    vi.stubGlobal('window', {
      sessionStorage: createStorage(),
      location: { reload },
      addEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recognises chunk load errors from each browser engine', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('reloads once, then lets a repeated failure reach the error boundary', async () => {
    const failing = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

    // First failure: triggers a reload and stays pending.
    const first = loadWithReload(failing);
    const settled = await Promise.race([first.then(() => 'settled', () => 'settled'), Promise.resolve('pending')]);
    expect(settled).toBe('pending');
    expect(reload).toHaveBeenCalledTimes(1);

    // Second failure inside the guard window: rethrows instead of looping.
    await expect(loadWithReload(failing)).rejects.toThrow('Failed to fetch dynamically imported module');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('allows another reload once the guard window has passed', () => {
    expect(reloadOnceForStaleChunk(1_000)).toBe(true);
    expect(reloadOnceForStaleChunk(5_000)).toBe(false);
    expect(reloadOnceForStaleChunk(20_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload for ordinary module errors', async () => {
    await expect(loadWithReload(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });

  it('wraps every route, modal and shell lazy import', () => {
    const files = [
      'App.tsx',
      'components/app/AppViewRouter.tsx',
      'components/app/AppModals.tsx',
      'components/TransactionsView.tsx',
      'components/InsightsView.tsx',
      'components/stats/index.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain('lazyWithReload(');
      expect(source, file).not.toMatch(/(React\.)?\blazy\(\s*(async\s*)?\(\)/);
    }
    expect(readFileSync('App.tsx', 'utf8')).toContain('installPreloadErrorReload();');
  });
});
