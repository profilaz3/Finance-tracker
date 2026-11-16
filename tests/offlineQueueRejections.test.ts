import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Permanent refusals are announced, so writes replayed later do not fail silently. */

const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

const sb: Record<string, ReturnType<typeof vi.fn>> = {};
for (const name of ['syncEvent', 'deleteEvent', 'syncSharedExpense', 'deleteSharedExpense', 'syncTransaction']) {
  sb[name] = vi.fn();
}

const load = async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('localStorage', storage);
  vi.doMock('../services/supabaseService', () => ({ supabaseService: sb }));
  const { offlineQueue } = await import('../services/offlineQueue');
  const { SyncRequestError } = await import('../services/syncErrors');
  return { offlineQueue, SyncRequestError };
};

beforeEach(() => {
  store.clear();
  Object.values(sb).forEach(fn => fn.mockReset());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock('../services/supabaseService');
  vi.resetModules();
});

describe('offline queue rejection listeners', () => {
  it('reports a background refusal nobody awaited', async () => {
    const { offlineQueue, SyncRequestError } = await load();
    offlineQueue.setUser('u1');
    sb.deleteEvent.mockRejectedValue(new SyncRequestError({ code: '42501', message: 'Permission denied' }, 403));

    const seen: Array<{ id: unknown; awaited: boolean }> = [];
    const unsubscribe = offlineQueue.subscribeRejections((op, awaited) => seen.push({ id: op.payload, awaited }));

    offlineQueue.enqueue({ type: 'event', action: 'delete', payload: 'ev-1' });
    await vi.advanceTimersByTimeAsync(100);

    expect(seen).toEqual([{ id: 'ev-1', awaited: false }]);
    unsubscribe();
  });

  it('marks a refusal the caller was waiting on as awaited', async () => {
    const { offlineQueue, SyncRequestError } = await load();
    offlineQueue.setUser('u1');
    sb.syncEvent.mockRejectedValue(new SyncRequestError({ code: '42501', message: 'Permission denied' }, 403));

    const seen: boolean[] = [];
    offlineQueue.subscribeRejections((_op, awaited) => seen.push(awaited));

    const result = offlineQueue.submit({ type: 'event', action: 'sync', payload: { id: 'ev-1' } })
      .then(() => 'ok', () => 'rejected');
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe('rejected');
    expect(seen).toEqual([true]);
  });

  it('does not announce transient failures, which stay queued', async () => {
    const { offlineQueue } = await load();
    offlineQueue.setUser('u1');
    sb.syncEvent.mockRejectedValue(new TypeError('Failed to fetch'));

    const listener = vi.fn();
    offlineQueue.subscribeRejections(listener);
    offlineQueue.enqueue({ type: 'event', action: 'sync', payload: { id: 'ev-1' } });
    await vi.advanceTimersByTimeAsync(100);

    expect(listener).not.toHaveBeenCalled();
    expect(offlineQueue.length).toBe(1);
  });
});
