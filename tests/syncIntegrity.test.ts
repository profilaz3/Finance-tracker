import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../types';

/**
 * Sync / data-integrity regressions from the audit (C3, C4, H1, H2, H14, M1, M2,
 * M3, M5, M6, M25, M27). These were originally written as proofs of the bugs and
 * now assert the corrected behaviour.
 */

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

const calls: string[] = [];
const sb: Record<string, ReturnType<typeof vi.fn>> = {};
for (const name of [
  'syncTransaction', 'deleteTransaction', 'syncCategory', 'deleteCategory', 'syncAccount', 'deleteAccount',
  'syncPerson', 'deletePerson', 'syncSettings', 'syncEvent', 'deleteEvent', 'syncSharedExpense',
  'deleteSharedExpense', 'syncRecurring', 'deleteRecurring',
]) {
  sb[name] = vi.fn();
}

const networkError = () => new TypeError('Failed to fetch');

const load = async (online: boolean) => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: online });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('localStorage', storage);
  vi.doMock('../services/supabaseService', () => ({ supabaseService: sb }));
  const queueModule = await import('../services/offlineQueue');
  const syncModule = await import('../services/syncManager');
  return { offlineQueue: queueModule.offlineQueue, syncManager: syncModule.syncManager, queueModule };
};

beforeEach(() => {
  store.clear();
  calls.length = 0;
  Object.values(sb).forEach(fn => fn.mockReset());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock('../services/supabaseService');
  vi.resetModules();
});

describe('offline queue (C3)', () => {
  it('keeps retrying transient failures with capped exponential backoff instead of dropping writes', async () => {
    const { offlineQueue } = await load(true);
    offlineQueue.setUser('u1');
    sb.syncTransaction.mockRejectedValue(networkError());

    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-a' } });
    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-b' } });
    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-c' } });

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    // Nothing was dropped, and FIFO means tx-b/tx-c wait behind tx-a.
    expect(offlineQueue.length).toBe(3);
    expect(offlineQueue.getDeadLetters()).toEqual([]);
    expect(new Set(sb.syncTransaction.mock.calls.map(([payload]) => payload.id))).toEqual(new Set(['tx-a']));
    // 1s, 2s, 4s ... capped at 60s: roughly 15 attempts in 10 minutes, not hundreds.
    expect(sb.syncTransaction.mock.calls.length).toBeGreaterThan(8);
    expect(sb.syncTransaction.mock.calls.length).toBeLessThan(25);
    expect(store.get('offline_operation_queue:u1')).toContain('tx-c');

    sb.syncTransaction.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(offlineQueue.length).toBe(0);
  });

  it('caps the retry delay at 60 seconds', async () => {
    const { queueModule } = await load(true);
    expect(queueModule.getRetryDelay(1)).toBe(1000);
    expect(queueModule.getRetryDelay(2)).toBe(2000);
    expect(queueModule.getRetryDelay(4)).toBe(8000);
    expect(queueModule.getRetryDelay(50)).toBe(60_000);
  });

  it('moves permanent 4xx/validation failures to a persisted dead-letter list and continues', async () => {
    const { offlineQueue } = await load(true);
    const { SyncRequestError } = await import('../services/syncErrors');
    offlineQueue.setUser('u1');
    sb.syncTransaction.mockImplementation(async (tx: { id: string }) => {
      if (tx.id === 'tx-bad') throw new SyncRequestError({ message: 'violates check constraint', code: '23514' }, 400);
      calls.push(`upsert ${tx.id}`);
    });

    const notified: number[] = [];
    offlineQueue.subscribeDeadLetters(list => notified.push(list.length));

    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-bad' } });
    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-good' } });
    await vi.advanceTimersByTimeAsync(100);

    expect(calls).toEqual(['upsert tx-good']);
    expect(offlineQueue.length).toBe(0);
    expect(offlineQueue.getDeadLetters().map(op => op.payload.id)).toEqual(['tx-bad']);
    expect(offlineQueue.getDeadLetters()[0].reason).toContain('check constraint');
    expect(store.get('offline_operation_dead_letter:u1')).toContain('tx-bad');
    expect(notified.at(-1)).toBe(1);
  });

  it('replays a persisted queue at startup once the user is known', async () => {
    store.set('offline_operation_queue:u1', JSON.stringify([
      { id: '1', type: 'transaction', action: 'sync', payload: { id: 'tx-offline' }, timestamp: 1, retries: 0 },
    ]));
    sb.syncTransaction.mockResolvedValue(undefined);

    const { offlineQueue } = await load(true);
    offlineQueue.setUser('u1');
    await vi.advanceTimersByTimeAsync(100);

    expect(sb.syncTransaction).toHaveBeenCalledWith({ id: 'tx-offline' });
    expect(offlineQueue.length).toBe(0);
  });

  it('migrates the legacy un-keyed queue into the signed-in user queue', async () => {
    store.set('offline_operation_queue', JSON.stringify([
      { id: '1', type: 'transaction', action: 'sync', payload: { id: 'tx-legacy' }, timestamp: 1, retries: 0 },
    ]));
    const { offlineQueue } = await load(false);
    offlineQueue.setUser('u1');

    expect(store.has('offline_operation_queue')).toBe(false);
    expect(store.get('offline_operation_queue:u1')).toContain('tx-legacy');
  });
});

describe('syncManager ordering (M2, M3)', () => {
  it('a delete cancels the pending debounced upsert so the row is not resurrected', async () => {
    const { syncManager, offlineQueue } = await load(true);
    offlineQueue.setUser('u1');
    sb.syncTransaction.mockImplementation(async (tx: { id: string }) => { calls.push(`upsert ${tx.id}`); });
    sb.deleteTransaction.mockImplementation(async (id: string) => { calls.push(`delete ${id}`); });

    void syncManager.syncTransaction({ id: 'tx-1' } as never);
    await vi.advanceTimersByTimeAsync(100);
    await syncManager.deleteTransaction('tx-1');
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toEqual(['delete tx-1']);
  });

  it('offline: sync then delete within the debounce window queues only the delete', async () => {
    const { syncManager, offlineQueue } = await load(false);
    offlineQueue.setUser('u1');

    void syncManager.syncTransaction({ id: 'tx-2' } as never);
    await syncManager.deleteTransaction('tx-2');
    await vi.advanceTimersByTimeAsync(1000);

    expect(offlineQueue.getQueue().map(op => op.action)).toEqual(['delete']);
  });

  it('online writes go through the queue in order (one write path)', async () => {
    const { syncManager, offlineQueue } = await load(true);
    offlineQueue.setUser('u1');
    sb.syncAccount.mockImplementation(async (account: { id: string }) => { calls.push(`account ${account.id}`); });
    sb.syncTransaction.mockImplementation(async (tx: { id: string }) => { calls.push(`tx ${tx.id}`); });

    const first = syncManager.syncAccount({ id: 'acc-new' } as never);
    const second = syncManager.syncTransaction({ id: 'tx-uses-acc' } as never);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([first, second]);

    expect(calls).toEqual(['account acc-new', 'tx tx-uses-acc']);
  });

  it('flushPending pushes debounced writes into the persisted queue immediately (M4)', async () => {
    const { syncManager, offlineQueue } = await load(false);
    offlineQueue.setUser('u1');

    void syncManager.syncTransaction({ id: 'tx-unload' } as never);
    expect(store.get('offline_operation_queue:u1') ?? '').not.toContain('tx-unload');
    await syncManager.flushPending();

    expect(store.get('offline_operation_queue:u1')).toContain('tx-unload');
  });
});

describe('sign-out isolation (M5)', () => {
  it('a debounce timer firing after logout does not enqueue the previous user payload', async () => {
    const { syncManager, offlineQueue } = await load(true);
    offlineQueue.setUser('userA');
    sb.syncTransaction.mockRejectedValue(new Error('User not authenticated'));

    void syncManager.syncTransaction({ id: 'tx-userA', note: 'A private' } as never).catch(() => {});
    offlineQueue.clearForSignOut();
    await vi.advanceTimersByTimeAsync(600);

    expect([...store.values()].join('')).not.toContain('tx-userA');
    expect(offlineQueue.length).toBe(0);
    expect(sb.syncTransaction).not.toHaveBeenCalled();
  });

  it('keys the queue by user so a second account never sees the first one\'s writes', async () => {
    const { offlineQueue } = await load(false);
    offlineQueue.setUser('userA');
    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-a' } });

    offlineQueue.setUser('userB');
    expect(offlineQueue.length).toBe(0);
    expect(store.get('offline_operation_queue:userA')).toContain('tx-a');

    offlineQueue.setUser('userA');
    expect(offlineQueue.getQueue().map(op => op.payload.id)).toEqual(['tx-a']);
  });
});

describe('hydration merge (H1, H2)', () => {
  const baseState = async (): Promise<AppState> => {
    const { createInitialState } = await import('../services/storageService');
    return createInitialState();
  };

  it('keeps the local slice when its fetch failed instead of replacing it with []', async () => {
    vi.stubGlobal('localStorage', storage);
    const { mergeRemoteState } = await import('../services/hydration');
    const local = { ...(await baseState()), transactions: [{ id: 'tx-local' }] } as AppState;

    const merged = mergeRemoteState(local, {
      state: { events: [] },
      failedSlices: ['transactions'],
      hasSettingsRow: false,
    }, []);

    expect(merged.transactions.map(tx => tx.id)).toEqual(['tx-local']);
    expect(merged.theme).toBe(local.theme);
  });

  it('re-applies still-pending writes over the fetched snapshot', async () => {
    vi.stubGlobal('localStorage', storage);
    const { mergeRemoteState } = await import('../services/hydration');
    const local = await baseState();

    const merged = mergeRemoteState(local, {
      state: { transactions: [{ id: 'tx-server' }, { id: 'tx-deleted-offline' }] as AppState['transactions'] },
      failedSlices: [],
      hasSettingsRow: false,
    }, [
      { type: 'transaction', action: 'sync', payload: { id: 'tx-offline', amount: 5 } },
      { type: 'transaction', action: 'delete', payload: { id: 'tx-deleted-offline' } },
    ]);

    expect(merged.transactions.map(tx => tx.id)).toEqual(['tx-server', 'tx-offline']);
  });
});

describe('pagination (H14)', () => {
  it('fetches every page with .range() instead of stopping at the 1000-row API limit', async () => {
    vi.resetModules();
    vi.doUnmock('../services/supabaseService');
    const { SupabaseService } = await import('../services/supabaseService');
    const total = 2500;
    const ranges: Array<[number, number]> = [];

    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        const end = Math.min(to + 1, total);
        const data = Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: `row-${from + i}` }));
        return { data, error: null, status: 200, count: total };
      },
    };

    const service = new SupabaseService();
    (service as unknown as { _client: unknown })._client = { from: () => builder };
    const fetchAllRows = (service as unknown as {
      fetchAllRows: (table: string, eq?: { column: string; value: string }) => Promise<{ data: unknown[] | null }>;
    }).fetchAllRows.bind(service);

    const result = await fetchAllRows('transactions', { column: 'user_id', value: 'u1' });

    expect(result.data).toHaveLength(total);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});

describe('local storage (M1, M6, M27)', () => {
  it('generates unique ids for a new user\'s default categories and accounts', async () => {
    vi.stubGlobal('localStorage', storage);
    const { createInitialState } = await import('../services/storageService');
    const first = createInitialState();
    const second = createInitialState();

    const generatedCategory = first.categories.find(category => !['internal-transfer', 'debt-repayment', 'loan-repayment'].includes(category.id));
    expect(generatedCategory?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.accounts.every(account => /^[0-9a-f-]{36}$/.test(account.id))).toBe(true);
    expect(first.accounts.map(account => account.id)).not.toEqual(second.accounts.map(account => account.id));
    expect(first.categories.some(category => category.id === 'internal-transfer')).toBe(true);
  });

  it('applies a state segment written by another tab', async () => {
    vi.stubGlobal('localStorage', storage);
    const { applyExternalSegmentChange, createInitialState } = await import('../services/storageService');
    const { CONFIG } = await import('../config');
    const local = createInitialState();

    const next = applyExternalSegmentChange(
      local,
      `${CONFIG.STORAGE_KEY}:transactions`,
      JSON.stringify([{ id: 'tx-from-other-tab', amount: 1, currency: 'EUR', categoryId: 'c', accountId: 'a', type: 'expense', date: '2026-01-01T00:00:00.000Z', note: '' }])
    );

    expect(next?.transactions.map(tx => tx.id)).toEqual(['tx-from-other-tab']);
    expect(applyExternalSegmentChange(local, 'unrelated-key', '[]')).toBeNull();
  });

  it('reports a quota error instead of swallowing it', async () => {
    const { subscribeStorageErrors, writeStorage } = await import('../services/storageHealth');
    vi.stubGlobal('localStorage', {
      ...storage,
      setItem: () => {
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reports: Array<{ scope: string; quotaExceeded: boolean }> = [];
    const unsubscribe = subscribeStorageErrors(info => reports.push(info));

    expect(writeStorage('state', 'key', 'value')).toBe(false);
    unsubscribe();

    expect(reports).toEqual([expect.objectContaining({ scope: 'state', quotaExceeded: true })]);
  });
});

describe('recurring and account order (C4, M25)', () => {
  it('derives a deterministic id per recurring occurrence', async () => {
    const { buildRecurringOccurrenceId } = await import('../utils/recurringOccurrence');
    expect(buildRecurringOccurrenceId('r1', '2026-03-01')).toBe('rec:r1:2026-03-01');
    expect(buildRecurringOccurrenceId('r1', '2026-03-01T00:00:00.000Z')).toBe(buildRecurringOccurrenceId('r1', '2026-03-01'));
  });

  it('restores the saved account order from order_index', async () => {
    const { sortAccountsByOrder } = await import('../services/supabaseMappers');
    const sorted = sortAccountsByOrder([
      { id: 'a', order: 2 },
      { id: 'b' },
      { id: 'c', order: 0 },
      { id: 'd', order: 1 },
    ] as AppState['accounts']);
    expect(sorted.map(account => account.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('detects accounts whose order changed for syncing', async () => {
    const { findReorderedAccounts } = await import('../hooks/useAccountHandlers');
    const baseline = new Map<string, number | undefined>([['a', 0], ['b', 1], ['c', 2]]);
    const reordered = findReorderedAccounts([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
      { id: 'c', order: 2 },
      { id: 'new', order: 3 },
    ] as AppState['accounts'], baseline);
    expect(reordered.map(account => account.id)).toEqual(['b', 'a']);
  });
});
