import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Transaction } from '../types';

// Minimal hook runtime: handlers only use useState/useCallback.
const hookState: unknown[] = [];
let hookIndex = 0;
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hookIndex++;
    if (!(index in hookState)) hookState[index] = initial;
    return [hookState[index], (value: unknown) => {
      hookState[index] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(hookState[index]) : value;
    }];
  },
  useCallback: (fn: unknown) => fn,
  default: {},
}));

const syncCalls: Array<{ method: string; arg: unknown }> = [];
vi.mock('../services/runtimeServices', () => ({
  getSyncManager: async () => new Proxy({}, {
    get: (_target, key) => (key === 'then'
      ? undefined
      : async (arg: unknown) => { syncCalls.push({ method: String(key), arg }); }),
  }),
}));
vi.mock('../utils/haptics', () => ({ vibrate: () => {}, HAPTIC_PATTERNS: {} }));

import { useTransactionHandlers } from '../hooks/useTransactionHandlers';
import { selectPeopleWithBalances } from '../domain/balances';

type Toast = { message: string; type: string; action?: { label: string; onClick: () => void } };

const rates = { base: 'EUR' as const, date: 'x', rates: { EUR: 1, USD: 1, RSD: 117 } };
const mkState = (): AppState => ({
  transactions: [],
  accounts: [{ id: 'acc1', name: 'Cash', type: 'cash', currency: 'EUR', color: '#000' }],
  people: [{ id: 'p', name: 'P', color: '', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 } }],
  categories: [],
  events: [],
  sharedExpenses: [],
  templates: [],
  recurringTransactions: [],
  rates,
  baseCurrency: 'EUR',
  theme: 'graphite',
  language: 'en',
});

function harness(initial: AppState) {
  let state = initial;
  const toasts: Toast[] = [];
  const setState = (update: AppState | ((prev: AppState) => AppState)) => {
    state = typeof update === 'function' ? update(state) : update;
  };
  const render = () => {
    hookIndex = 0;
    return useTransactionHandlers({
      state,
      setState: setState as never,
      addToast: (message, type, action) => { toasts.push({ message, type, action }); },
      createId: () => 'new-id',
      setSelectedTransaction: () => {},
      closeEditModal: () => {},
      closeReceiptModal: () => {},
    });
  };
  return {
    get state() { return state; },
    balanceOf: (personId: string) => selectPeopleWithBalances(state.people, state.transactions).find(p => p.id === personId)!.balances,
    render,
    toasts,
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('transaction handlers (H3 undo, H4 derived balances)', () => {
  beforeEach(() => {
    hookState.length = 0;
    syncCalls.length = 0;
  });

  it('deleting a debt (personId) transaction reverts the person balance', async () => {
    const h = harness(mkState());
    const lend: Transaction = { id: 't1', date: '2026-11-01T10:00:00Z', amount: 50, currency: 'EUR', categoryId: 'c1', accountId: 'acc1', type: 'expense', personId: 'p' };

    await h.render().updateTransaction(lend);
    expect(h.balanceOf('p').EUR).toBe(50);

    await h.render().deleteTransaction('t1');
    expect(h.balanceOf('p').EUR).toBe(0);
    // Stored balances stay untouched: they only hold manual offsets.
    expect(h.state.people[0].balances.EUR).toBe(0);
  });

  it('each undo toast restores exactly the transaction it deleted and re-syncs it', async () => {
    const s = mkState();
    s.transactions = [
      { id: 'A', date: '2026-11-01T10:00:00Z', amount: 10, currency: 'EUR', categoryId: 'c1', accountId: 'acc1', type: 'expense' },
      { id: 'B', date: '2026-11-02T10:00:00Z', amount: 20, currency: 'EUR', categoryId: 'c1', accountId: 'acc1', type: 'expense', personId: 'p' },
    ];
    const h = harness(s);

    await h.render().deleteTransaction('A');
    const undoA = h.toasts.at(-1)!.action!.onClick;
    await h.render().deleteTransaction('B');
    const undoB = h.toasts.at(-1)!.action!.onClick;
    expect(h.state.transactions).toHaveLength(0);
    expect(h.balanceOf('p').EUR).toBe(0);

    undoA();
    undoB();
    undoB(); // double click must not duplicate
    await flush();

    expect(h.state.transactions.map(tx => tx.id).sort()).toEqual(['A', 'B']);
    expect(h.balanceOf('p').EUR).toBe(20);
    const upserts = syncCalls.filter(call => call.method === 'syncTransaction').map(call => (call.arg as Transaction).id);
    expect(upserts).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('batch delete of a split transaction removes its share balance and can be undone', async () => {
    const s = mkState();
    s.transactions = [{
      id: 'S', date: '2026-11-01T10:00:00Z', amount: 60, currency: 'EUR', categoryId: 'c1', accountId: 'acc1', type: 'expense',
      splitDetails: { totalAmount: 60, myPortion: 30, splitMethod: 'equal', shares: [{ personId: 'p', amount: 30 }] },
    }];
    const h = harness(s);
    expect(h.balanceOf('p').EUR).toBe(30);

    await h.render().batchDeleteTransactions(['S']);
    expect(h.state.transactions).toHaveLength(0);
    expect(h.balanceOf('p').EUR).toBe(0);

    h.toasts.at(-1)!.action!.onClick();
    await flush();
    expect(h.balanceOf('p').EUR).toBe(30);
  });

  it('editing a split currency moves the whole balance to the new currency (M8)', async () => {
    const s = mkState();
    const split: Transaction = {
      id: 'S', date: '2026-11-01T10:00:00Z', amount: 100, currency: 'EUR', categoryId: 'c1', accountId: 'acc1', type: 'expense',
      splitDetails: { totalAmount: 100, myPortion: 50, splitMethod: 'equal', shares: [{ personId: 'p', amount: 50 }] },
    };
    s.transactions = [split];
    const h = harness(s);

    await h.render().updateTransaction({
      ...split,
      amount: 11700,
      currency: 'RSD',
      splitDetails: { totalAmount: 11700, myPortion: 5850, splitMethod: 'equal', shares: [{ personId: 'p', amount: 5850 }] },
    });

    expect(h.balanceOf('p')).toEqual({ EUR: 0, USD: 0, RSD: 5850 });
  });
});
