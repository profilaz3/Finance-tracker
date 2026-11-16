import { describe, expect, it } from 'vitest';
import {
  alignTransferLeg,
  buildTransferPair,
  createTransactionDraft,
  defaultCategoryId,
  draftFromParsed,
  draftFromTemplate,
  duplicateTransactionDraft,
  prepareEntry,
  splitAmountFromText,
  transferInNote,
} from '../domain/transactions';
import type { Account, Category, Currency, ExchangeRates, Person, Transaction } from '../types';

// Debt and transfer categories first, as a synced category list can order them.
const categories: Category[] = [
  { id: 'debt-repayment', name: 'Incoming', type: 'income', subcategories: [], color: '#000' },
  { id: 'loan-repayment', name: 'Outgoing', type: 'expense', subcategories: [], color: '#000' },
  { id: 'internal-transfer', name: 'Internal Transfer', type: 'income', subcategories: ['Between Accounts'], color: '#000' },
  { id: 'food', name: 'Food', type: 'expense', subcategories: ['Groceries'], color: '#000' },
  { id: 'fun', name: 'Fun', type: 'expense', subcategories: [], color: '#000' },
  { id: 'salary', name: 'Salary', type: 'income', subcategories: [], color: '#000' },
];

const accounts: Account[] = [
  { id: 'cash', name: 'Cash', type: 'cash', currency: 'RSD', color: '#000' },
  { id: 'euro', name: 'Euro card', type: 'bank', currency: 'EUR', color: '#000' },
];

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  date: '2026-11-01T10:00:00.000Z',
  amount: 100,
  currency: 'RSD',
  categoryId: 'food',
  accountId: 'cash',
  type: 'expense',
  note: '',
  ...overrides,
});

// 1 EUR = 117 RSD.
const convert = (amount: number, from: Currency, to: Currency) => {
  if (from === to) return amount;
  if (from === 'EUR' && to === 'RSD') return amount * 117;
  if (from === 'RSD' && to === 'EUR') return amount / 117;
  return Number.NaN;
};

describe('default category of a new entry', () => {
  it('never starts on a debt or transfer category', () => {
    expect(defaultCategoryId('expense', categories)).toBe('food');
    expect(defaultCategoryId('income', categories)).toBe('salary');
  });

  it('prefers the category of the most recent plain entry of that type', () => {
    const history = [
      tx({ id: 'a', categoryId: 'food', date: '2026-10-01T10:00:00.000Z' }),
      tx({ id: 'b', categoryId: 'fun', date: '2026-10-20T10:00:00.000Z' }),
      // Debts and transfers do not count as habits.
      tx({ id: 'c', categoryId: 'loan-repayment', personId: 'p1', date: '2026-10-30T10:00:00.000Z' }),
      tx({ id: 'd', categoryId: 'internal-transfer', transferId: 't1', date: '2026-10-31T10:00:00.000Z' }),
    ];
    expect(defaultCategoryId('expense', categories, history)).toBe('fun');
  });

  it('is empty only when no usable category exists', () => {
    expect(defaultCategoryId('expense', categories.filter(c => c.type === 'income'))).toBe('');
  });
});

describe('createTransactionDraft', () => {
  it('starts a transfer on the transfer category, as the expense leg, without a person', () => {
    const draft = createTransactionDraft({
      createId: () => 'id', baseCurrency: 'RSD', accountId: 'euro', type: 'transfer', personId: 'p1', accounts,
    });
    expect(draft).toMatchObject({ categoryId: 'internal-transfer', type: 'expense', currency: 'EUR', personId: undefined });
  });

  it('uses the default category and the wallet currency when it gets categories and accounts', () => {
    const draft = createTransactionDraft({
      createId: () => 'id', baseCurrency: 'RSD', accountId: 'euro', accounts, categories,
    });
    expect(draft).toMatchObject({ categoryId: 'food', currency: 'EUR', type: 'expense' });
  });
});

describe('prepareEntry', () => {
  const context = { accounts, categories, transactions: [] as Transaction[] };

  it('moves a new plain entry off a hidden category and into its wallet currency', () => {
    const { entry } = prepareEntry(tx({ amount: 0, categoryId: 'loan-repayment', accountId: 'euro', currency: 'RSD' }), { ...context, isNew: true });
    expect(entry.categoryId).toBe('food');
    expect(entry.currency).toBe('EUR');
  });

  it('keeps the repayment category of a person-linked entry and the currency of a parsed amount', () => {
    const { entry } = prepareEntry(tx({ amount: 50, categoryId: 'food', type: 'income', personId: 'p1', currency: 'EUR' }), { ...context, isNew: true });
    expect(entry.categoryId).toBe('debt-repayment');
    expect(entry.currency).toBe('EUR');
  });

  it('opens an existing transfer from its outgoing leg with the incoming wallet as To', () => {
    const outflow = tx({ id: 'out', categoryId: 'internal-transfer', transferId: 't1', accountId: 'cash' });
    const inflow = tx({ id: 'in', categoryId: 'internal-transfer', transferId: 't1', accountId: 'euro', type: 'income', currency: 'EUR' });
    const prepared = prepareEntry(inflow, { ...context, transactions: [outflow, inflow], isNew: false });
    expect(prepared).toMatchObject({ entry: { id: 'out' }, targetAccountId: 'euro', isPairedTransfer: true });
  });

  it('moves a new entry on a wallet the form does not offer (another workspace) to the first offered wallet', () => {
    const { entry } = prepareEntry(tx({ amount: 0, accountId: 'team-wallet', currency: 'USD' }), { ...context, isNew: true });
    expect(entry).toMatchObject({ accountId: 'cash', currency: 'RSD' });
    // A parsed amount keeps its own currency.
    expect(prepareEntry(tx({ amount: 9, accountId: '', currency: 'EUR' }), { ...context, isNew: true }).entry)
      .toMatchObject({ accountId: 'cash', currency: 'EUR' });
    // A new transfer from a wallet that is not offered starts from the first offered one, in its currency.
    expect(prepareEntry(tx({ amount: 0, accountId: 'gone', categoryId: 'internal-transfer', currency: 'USD' }), { ...context, isNew: true }).entry)
      .toMatchObject({ accountId: 'cash', currency: 'RSD' });
    // Existing entries and a form without wallets keep what they have.
    expect(prepareEntry(tx({ accountId: 'team-wallet' }), { ...context, isNew: false }).entry.accountId).toBe('team-wallet');
    expect(prepareEntry(tx({ accountId: 'team-wallet' }), { ...context, accounts: [], isNew: true }).entry.accountId).toBe('team-wallet');
  });

  it('turns a copied incoming leg into a new transfer into that wallet', () => {
    const copy = duplicateTransactionDraft(
      tx({ categoryId: 'internal-transfer', transferId: 't1', accountId: 'euro', type: 'income', note: transferInNote('Cash'), subcategory: 'Transfer In' }),
      { createId: () => 'copy' },
    );
    expect(copy.transferId).toBeUndefined();
    const prepared = prepareEntry(copy, { ...context, isNew: true });
    expect(prepared.entry).toMatchObject({ type: 'expense', accountId: '', note: '', transferId: undefined });
    expect(prepared.targetAccountId).toBe('euro');
  });
});

describe('transfer legs', () => {
  it('books the outgoing leg in the From currency and the incoming leg converted, sharing one transferId', () => {
    const [out, inflow] = buildTransferPair({
      outflow: tx({ id: 'out', amount: 11700, categoryId: 'internal-transfer', personId: 'p1' }),
      toAccount: accounts[1],
      fromAccountName: 'Cash',
      transferId: 'T',
      inflowId: 'in',
      convert,
    });
    expect(out).toMatchObject({ id: 'out', type: 'expense', transferId: 'T', currency: 'RSD', amount: 11700, personId: undefined });
    expect(inflow).toMatchObject({
      id: 'in', type: 'income', transferId: 'T', accountId: 'euro', currency: 'EUR', amount: 100,
      categoryId: 'internal-transfer', note: 'Transfer from Cash', date: out.date,
    });
  });

  it('keeps the other leg in step when one is edited, moving the incoming leg to a new To wallet', () => {
    const updated = tx({ id: 'out', amount: 200, transferId: 'T', categoryId: 'internal-transfer', date: '2026-11-05T10:00:00.000Z' });
    const partner = tx({ id: 'in', type: 'income', transferId: 'T', categoryId: 'internal-transfer', note: 'Transfer from Old name' });
    const aligned = alignTransferLeg(updated, partner, { toAccount: accounts[1], fromAccountName: 'Cash', convert });
    expect(aligned).toMatchObject({ accountId: 'euro', currency: 'EUR', amount: 1.71, date: updated.date, note: 'Transfer from Cash' });
  });

  it('keeps a typed note on the incoming leg', () => {
    const updated = tx({ id: 'out', amount: 300, transferId: 'T', categoryId: 'internal-transfer' });
    const partner = tx({ id: 'in', type: 'income', transferId: 'T', categoryId: 'internal-transfer', note: 'Savings' });
    expect(alignTransferLeg(updated, partner, { fromAccountName: 'Cash', convert }).note).toBe('Savings');
  });
});

describe('splitAmountFromText', () => {
  it('takes the first amount in the app number format and keeps the rest as the note', () => {
    expect(splitAmountFromText('kafa 250', 'sr')).toEqual({ amount: 250, note: 'kafa' });
    expect(splitAmountFromText('Groceries 1.500,50 at Maxi', 'sr')).toEqual({ amount: 1500.5, note: 'Groceries at Maxi' });
    expect(splitAmountFromText('taxi 1,450.', 'en')).toEqual({ amount: 1450, note: 'taxi' });
  });

  it('keeps the whole text as the note when there is no readable amount', () => {
    expect(splitAmountFromText('  lunch with Ana ', 'en')).toEqual({ amount: 0, note: 'lunch with Ana' });
    expect(splitAmountFromText('paid 0 today', 'en')).toEqual({ amount: 0, note: 'paid 0 today' });
  });
});

describe('drafts from smart entry and templates', () => {
  const people: Person[] = [{ id: 'p-ana', name: 'Ana', color: '#000', defaultCurrency: 'RSD', balances: { RSD: 0, EUR: 0, USD: 0 } }];
  // 1 USD = 100 RSD, 1 EUR = 1.1 USD.
  const rates = { base: 'USD', rates: { USD: 1, RSD: 100, EUR: 1 / 1.1 } } as unknown as ExchangeRates;
  const options = { createId: () => 'new', accounts, categories, people, baseCurrency: 'RSD' as Currency, rates };

  it('matches names case-insensitively in the offered lists and stores the fee in USD', () => {
    const draft = draftFromParsed({
      amount: 1500, currency: 'RSD', categoryName: ' food ', type: 'expense', note: 'Lidl', date: '2026-11-10T09:00:00.000Z',
      accountName: 'EURO CARD', loanName: 'ana', fees: 200,
    }, options);
    expect(draft).toMatchObject({
      id: 'new', amount: 1500, currency: 'RSD', categoryId: 'food', accountId: 'euro', type: 'expense', note: 'Lidl', personId: 'p-ana', fees: 2,
    });
    expect(draft.date).toBe('2026-11-10T09:00:00.000Z');
  });

  it('leaves unmatched names for prepareEntry and survives an unreadable date', () => {
    const draft = draftFromParsed({ amount: 0, currency: 'EUR', categoryName: 'Nope', type: 'income', note: '', date: 'not a date', accountName: 'Team wallet' }, options);
    expect(draft).toMatchObject({ categoryId: '', accountId: '', personId: undefined, fees: undefined, amount: 0 });
    expect(Number.isFinite(new Date(draft.date).getTime())).toBe(true);
    const { entry } = prepareEntry(draft, { accounts, categories, transactions: [], isNew: true });
    expect(entry).toMatchObject({ categoryId: 'salary', accountId: 'cash', currency: 'RSD' });
  });

  it('builds a template draft dated now with an empty note when the template has none', () => {
    const draft = draftFromTemplate(
      { id: 'tpl', name: 'Coffee', amount: 250, currency: 'RSD', categoryId: 'food', accountId: 'cash', type: 'expense', usageCount: 3 },
      { createId: () => 'new', nowIso: '2026-11-15T08:00:00.000Z' },
    );
    expect(draft).toEqual({
      id: 'new', date: '2026-11-15T08:00:00.000Z', amount: 250, currency: 'RSD', categoryId: 'food', accountId: 'cash',
      type: 'expense', note: '', subcategory: undefined,
    });
  });
});
