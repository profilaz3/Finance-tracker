import type { Currency, ExchangeRates, Person, Transaction } from '../types';
import { BALANCE_CURRENCIES, getTransactionBalanceEffects } from './balances';
import { isRepaymentTransaction } from './money';
import { convertAmount } from '../services/currencyService';

/**
 * What an entry did to a person's balance:
 * - `repaid`: they paid me back; `paidBack`: I paid them back (both repayments)
 * - `share`: their share of a bill I paid
 * - `lent`: I lent them money or paid for them; `borrowed`: they lent me money or paid me
 */
export type LedgerKind = 'repaid' | 'paidBack' | 'share' | 'lent' | 'borrowed';

export interface LedgerRow {
  transaction: Transaction;
  kind: LedgerKind;
  currency: Currency;
  /** Change to their balance: + they owe me more, − less. */
  delta: number;
  /** Their balance in `currency` right after this entry. */
  balance: number;
}

export interface PersonLedger {
  /** Entries that touched their balance, newest first. */
  rows: LedgerRow[];
  /** Balance with no entry behind it (set by hand, or a bill they paid for me), per currency. */
  offsets: Array<[Currency, number]>;
}

const toCents = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100);
const timeOf = (date: string): number => {
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const kindOf = (transaction: Transaction, fromPersonId: boolean): LedgerKind => {
  if (!fromPersonId) return 'share';
  const repayment = isRepaymentTransaction(transaction);
  if (transaction.type === 'income') return repayment ? 'repaid' : 'borrowed';
  return repayment ? 'paidBack' : 'lent';
};

/**
 * A person's balance as a story: every entry that moved it, newest first, with the balance
 * right after it. `person.balances` must be the effective balances (stored offsets plus entry
 * effects, `selectPeopleWithBalances`), so walking back from them ends at the stored offsets.
 */
export const personLedger = (person: Person, transactions: Transaction[]): PersonLedger => {
  const entries: Array<Omit<LedgerRow, 'balance'>> = [];
  for (const transaction of transactions) {
    let cents = 0;
    let fromPersonId = false;
    for (const effect of getTransactionBalanceEffects(transaction)) {
      if (effect.personId !== person.id) continue;
      cents += toCents(effect.delta);
      if (transaction.personId === person.id) fromPersonId = true;
    }
    if (cents === 0) continue;
    entries.push({ transaction, kind: kindOf(transaction, fromPersonId), currency: transaction.currency, delta: cents / 100 });
  }
  entries.sort((a, b) => timeOf(b.transaction.date) - timeOf(a.transaction.date)
    || (a.transaction.id < b.transaction.id ? 1 : a.transaction.id > b.transaction.id ? -1 : 0));

  const running = new Map<Currency, number>(BALANCE_CURRENCIES.map(currency => [currency, toCents(person.balances?.[currency] ?? 0)]));
  const rows = entries.map(entry => {
    const after = running.get(entry.currency) ?? 0;
    running.set(entry.currency, after - toCents(entry.delta));
    return { ...entry, balance: after / 100 };
  });
  const offsets = BALANCE_CURRENCIES
    .map(currency => [currency, (running.get(currency) ?? 0) / 100] as [Currency, number])
    .filter(([, amount]) => amount !== 0);
  return { rows, offsets };
};

/**
 * When the open balance in `currency` began: the oldest entry since it last stood at zero or
 * pointed the other way. Null when nothing is open, or when it reaches back past every entry
 * (a balance set by hand has no date).
 */
export const openSince = (ledger: PersonLedger, currency: Currency, current: number): string | null => {
  const sign = Math.sign(toCents(current));
  if (sign === 0) return null;
  let since: string | null = null;
  for (const row of ledger.rows) {
    if (row.currency !== currency) continue;
    if (Math.sign(toCents(row.balance)) !== sign) return since;
    // The balance was already open before this entry when the entry did not open it.
    since = row.transaction.date;
  }
  const offset = ledger.offsets.find(([entry]) => entry === currency)?.[1] ?? 0;
  return Math.sign(toCents(offset)) === sign ? null : since;
};

export interface PersonStats {
  /** Their newest repayment, or mine to them. */
  lastRepayment: LedgerRow | null;
  /** Bills I paid with a share for them, newest first. */
  bills: LedgerRow[];
  /** Everything I lent or paid for them, in the display currency. */
  lent: number;
  /** Date of the first thing I lent or paid for them. */
  lentSince: string | null;
}

export const personStats = (ledger: PersonLedger, currency: Currency, rates: ExchangeRates): PersonStats => {
  const lentRows = ledger.rows.filter(row => (row.kind === 'share' || row.kind === 'lent') && row.delta > 0);
  return {
    lastRepayment: ledger.rows.find(row => row.kind === 'repaid' || row.kind === 'paidBack') ?? null,
    bills: ledger.rows.filter(row => row.kind === 'share'),
    lent: lentRows.reduce((sum, row) => sum + convertAmount(row.delta, row.currency, currency, rates), 0),
    lentSince: lentRows.length > 0 ? lentRows[lentRows.length - 1].transaction.date : null,
  };
};
