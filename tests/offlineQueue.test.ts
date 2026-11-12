import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StorageMap = Map<string, string>;

const createStorage = (store: StorageMap) => ({
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
});

const createWindowStub = () => ({
  addEventListener: vi.fn(),
});

const supabaseServiceMock = {
  syncTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  syncCategory: vi.fn(),
  deleteCategory: vi.fn(),
  syncAccount: vi.fn(),
  deleteAccount: vi.fn(),
  syncPerson: vi.fn(),
  deletePerson: vi.fn(),
  syncSettings: vi.fn(),
  syncEvent: vi.fn(),
  deleteEvent: vi.fn(),
  syncSharedExpense: vi.fn(),
  deleteSharedExpense: vi.fn(),
  syncRecurring: vi.fn(),
  deleteRecurring: vi.fn(),
};

const loadOfflineQueue = async () => {
  vi.resetModules();
  vi.doMock('../services/supabaseService', () => ({
    supabaseService: supabaseServiceMock,
  }));

  return import('../services/offlineQueue');
};

describe('offlineQueue', () => {
  let storage: StorageMap;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('window', createWindowStub());
    vi.stubGlobal('localStorage', createStorage(storage));
    Object.values(supabaseServiceMock).forEach(mockFn => mockFn.mockReset());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('keeps only the latest sync operation for the same entity', async () => {
    const { offlineQueue } = await loadOfflineQueue();

    offlineQueue.clear();
    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-1', amount: 10 } });
    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-1', amount: 20 } });

    expect(offlineQueue.getQueue()).toHaveLength(1);
    expect(offlineQueue.getQueue()[0]).toMatchObject({
      type: 'transaction',
      action: 'sync',
      payload: { id: 'tx-1', amount: 20 },
    });
  });

  it('drops queued sync operations when a delete for the same entity is enqueued', async () => {
    const { offlineQueue } = await loadOfflineQueue();

    offlineQueue.clear();
    offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: { id: 'tx-1', amount: 10 } });
    offlineQueue.enqueue({ type: 'transaction', action: 'delete', payload: { id: 'tx-1' } });

    expect(offlineQueue.getQueue()).toHaveLength(1);
    expect(offlineQueue.getQueue()[0]).toMatchObject({
      type: 'transaction',
      action: 'delete',
      payload: { id: 'tx-1' },
    });
  });
});
