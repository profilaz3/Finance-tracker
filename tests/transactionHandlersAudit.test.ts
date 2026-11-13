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

describe('transfers and account currency (L6, L7)', () => {
  beforeEach(() => {
    hookState.length = 0;
    syncCalls.length = 0;
  });

  const withUsdAccount = () => {
    const s = mkState();
    s.accounts = [...s.accounts, { id: 'usd', name: 'Wallet', type: 'digital', currency: 'USD', color: '#000' }];
    s.rates = { base: 'EUR', date: 'x', rates: { EUR: 1, USD: 1.1, RSD: 117 } };
    return s;
  };

  it('links both transfer legs and edits and deletes them together', async () => {
    const h = harness(withUsdAccount());
    const outflow: Transaction = { id: 'out', date: '2026-11-01T10:00:00Z', amount: 100, currency: 'EUR', categoryId: 'internal-transfer', accountId: 'acc1', type: 'expense' };

    await h.render().updateTransaction(outflow, 'usd');
    const legs = h.state.transactions;
    expect(legs).toHaveLength(2);
    expect(legs.every(tx => tx.transferId === 'new-id')).toBe(true);
    expect(legs.find(tx => tx.accountId === 'usd')).toMatchObject({ amount: 110, currency: 'USD', type: 'income' });

    const stored = h.state.transactions.find(tx => tx.id === 'out')!;
    await h.render().updateTransaction({ ...stored, amount: 50, date: '2026-11-02T10:00:00Z' });
    expect(h.state.transactions.find(tx => tx.accountId === 'usd')).toMatchObject({ amount: 55, date: '2026-11-02T10:00:00Z' });

    await h.render().deleteTransaction('out');
    expect(h.state.transactions).toHaveLength(0);
    expect(syncCalls.filter(call => call.method === 'deleteTransaction')).toHaveLength(2);

    h.toasts.at(-1)!.action!.onClick();
    await flush();
    expect(h.state.transactions).toHaveLength(2);
  });

  it('batch delete removes the partner leg too', async () => {
    const s = withUsdAccount();
    s.transactions = [
      { id: 'o', date: '2026-11-01', amount: 10, currency: 'EUR', categoryId: 'internal-transfer', accountId: 'acc1', type: 'expense', transferId: 'T' },
      { id: 'i', date: '2026-11-01', amount: 11, currency: 'USD', categoryId: 'internal-transfer', accountId: 'usd', type: 'income', transferId: 'T' },
    ];
    const h = harness(s);
    await h.render().batchDeleteTransactions(['o']);
    expect(h.state.transactions).toHaveLength(0);
  });

  it('records a plain transaction in its account currency, for any account', async () => {
    const h = harness(withUsdAccount());
    await h.render().addTransaction({ id: 'x', date: '2026-11-01', amount: 10, currency: 'EUR', categoryId: 'c1', accountId: 'usd', type: 'expense' });
    expect(h.state.transactions[0]).toMatchObject({ amount: 11, currency: 'USD' });

    // An account called acc3 is not special any more.
    const s = mkState();
    s.accounts = [...s.accounts, { id: 'acc3', name: 'Renamed', type: 'bank', currency: 'EUR', color: '#000' }];
    const h2 = harness(s);
    await h2.render().addTransaction({ id: 'y', date: '2026-11-01', amount: 10, currency: 'EUR', categoryId: 'c1', accountId: 'acc3', type: 'expense' });
    expect(h2.state.transactions[0]).toMatchObject({ amount: 10, currency: 'EUR' });

    // Debts keep their agreed currency.
    await h.render().addTransaction({ id: 'z', date: '2026-11-01', amount: 10, currency: 'EUR', categoryId: 'c1', accountId: 'usd', type: 'expense', personId: 'p' });
    expect(h.state.transactions[0]).toMatchObject({ amount: 10, currency: 'EUR' });
  });
});
