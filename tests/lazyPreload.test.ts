import { describe, expect, it } from 'vitest';
import React from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';

describe('lazyWithReload preload', () => {
  it('loads the chunk once and resolves a preloaded component synchronously', async () => {
    let calls = 0;
    const Component = () => React.createElement('span', null, 'ready');
    const LazyComponent = lazyWithReload(() => {
      calls += 1;
      return Promise.resolve({ default: Component });
    });

    await LazyComponent.preload();
    await LazyComponent.preload();
    expect(calls).toBe(1);

    // React's lazy calls the factory through _init; a preloaded module must not suspend.
    const payload = (LazyComponent as unknown as { _payload: unknown; _init: (payload: unknown) => unknown });
    expect(payload._init(payload._payload)).toBe(Component);
  });

  it('retries after a failed preload', async () => {
    let calls = 0;
    const LazyComponent = lazyWithReload(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ default: () => null });
    });
    await expect(LazyComponent.preload()).rejects.toThrow('offline');
    await expect(LazyComponent.preload()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});
