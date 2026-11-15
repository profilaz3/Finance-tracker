import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from '../types';
import { clearPersistedState, flushSaveState, saveState } from '../services/storageService';
import { buildStateSegments, mergeStateSegments } from '../utils/statePersistence';
import { createBaseState } from './helpers/stateFactories';

const STORAGE_KEY = 'gemini_finance_data_v5';
const STATE_SEGMENT_META_KEY = `${STORAGE_KEY}:meta`;
const STATE_SEGMENT_KEYS = [
  `${STORAGE_KEY}:preferences`,
  `${STORAGE_KEY}:transactions`,
  `${STORAGE_KEY}:categories`,
  `${STORAGE_KEY}:accounts`,
  `${STORAGE_KEY}:people`,
  `${STORAGE_KEY}:userProfile`,
  `${STORAGE_KEY}:rates`,
  `${STORAGE_KEY}:templates`,
  `${STORAGE_KEY}:recurringTransactions`,
  `${STORAGE_KEY}:events`,
  `${STORAGE_KEY}:sharedExpenses`,
] as const;

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

const createState = (): AppState => ({
  transactions: [{ id: 'tx-1', date: '2026-04-05T00:00:00.000Z', amount: 20, currency: 'EUR', categoryId: 'food', accountId: 'cash', type: 'expense' }],
  categories: [{ id: 'food', name: 'Food', type: 'expense', subcategories: [], color: '#000' }],
  accounts: [{ id: 'cash', name: 'Cash', type: 'cash', currency: 'EUR', color: '#111' }],
  people: [],
  userProfile: undefined,
  baseCurrency: 'EUR',
  rates: { base: 'EUR', date: '2026-04-05', rates: { EUR: 1, USD: 1.08, RSD: 117 } },
  templates: [],
  recurringTransactions: [],
  language: 'en',
  events: [],
  sharedExpenses: [],
  isGuest: false,
});

describe('buildStateSegments', () => {
  it('splits preferences from entity collections', () => {
    const state = createState();

    expect(buildStateSegments(state)).toEqual({
      preferences: {
        baseCurrency: 'EUR',
        language: 'en',
        isGuest: false,
      },
      transactions: state.transactions,
      categories: state.categories,
      accounts: state.accounts,
      people: state.people,
      userProfile: state.userProfile,
      rates: state.rates,
      templates: state.templates,
      recurringTransactions: state.recurringTransactions,
      events: state.events,
      sharedExpenses: state.sharedExpenses,
    });
  });

  it('drops inline data-url avatars from persisted profiles to avoid blowing localStorage quota', () => {
    const state = createState();
    state.people = [{
      id: 'person-1',
      name: 'Judie',
      avatar: 'data:image/png;base64,AAAA',
      color: '#fff',
      defaultCurrency: 'EUR',
      balances: { EUR: 0, USD: 0, RSD: 0 },
    }];
    state.userProfile = {
      id: 'user-1',
      name: 'Nenad',
      avatar: 'https://example.com/avatar.png',
      color: '#000',
      defaultCurrency: 'EUR',
      balances: { EUR: 0, USD: 0, RSD: 0 },
    };

    const segments = buildStateSegments(state);

    expect(segments.people[0].avatar).toBeUndefined();
    expect(segments.userProfile?.avatar).toBe('https://example.com/avatar.png');
  });
});

describe('mergeStateSegments', () => {
  it('reconstructs app state from partial persisted segments', () => {
    const baseState = createState();

    const merged = mergeStateSegments(baseState, {
      preferences: {
        baseCurrency: 'USD',
        language: 'sr',
        isGuest: true,
      },
      transactions: [],
    });

    expect(merged.baseCurrency).toBe('USD');
    expect(merged.language).toBe('sr');
    expect(merged.isGuest).toBe(true);
    expect(merged.transactions).toEqual([]);
    expect(merged.categories).toEqual(baseState.categories);
  });
});

describe('clearPersistedState', () => {
  let storage: StorageMap;

  beforeEach(() => {
    storage = new Map();
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', createStorage(storage));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('removes legacy storage key, segment metadata, and every state segment after a flushed save', () => {
    const state = createBaseState();
    const userProfile = {
      id: 'user-1',
      name: 'Nenad',
      color: '#000',
      defaultCurrency: 'EUR' as const,
      balances: { EUR: 0, USD: 0, RSD: 0 },
    };
    state.transactions = [{
      id: 'tx-1',
      date: '2026-04-05T00:00:00.000Z',
      amount: 20,
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'cash',
      type: 'expense',
    }];
    state.userProfile = userProfile;

    saveState(state);
    flushSaveState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ legacy: true }));

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(STATE_SEGMENT_META_KEY)).not.toBeNull();
    STATE_SEGMENT_KEYS.forEach(key => {
      expect(localStorage.getItem(key)).not.toBeNull();
    });

    const pendingState = createBaseState();
    pendingState.transactions = [{ ...state.transactions[0], id: 'tx-pending' }];
    pendingState.userProfile = { ...userProfile, id: 'user-pending' };
    saveState(pendingState);

    clearPersistedState();
    vi.runOnlyPendingTimers();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(STATE_SEGMENT_META_KEY)).toBeNull();
    STATE_SEGMENT_KEYS.forEach(key => {
      expect(localStorage.getItem(key)).toBeNull();
    });
  });
});
