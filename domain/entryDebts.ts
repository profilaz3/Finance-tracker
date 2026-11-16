import type { Person, Transaction } from '../types';
import { getTransactionBalanceEffects } from './balances';

export type EntryDebtState = 'paid' | 'partial' | 'owed';

export interface EntryDebt {
  personId: string;
  /** What this entry put on them, in the entry's currency. */
  amount: number;
  /** What is still open of it, in the entry's currency. */
  outstanding: number;
  state: EntryDebtState;
}

const toCents = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100);

const timeOf = (date: string): number => {
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? 0 : time;
};

interface Debt {
  key: string;
  time: number;
  cents: number;
}

const OFFSET_KEY = '\u0000offset';

/**
 * Who still owes what for one entry (a split bill, or an expense paid for someone).
 *
 * Paying back is recorded as its own entry and is not tied to a bill, so per-share "paid" is
 * worked out here: each person's credits in the entry's currency (repayments, entries where they
 * paid me, a negative manual balance) pay off their debts oldest first, and whatever is left of
 * this entry's debt is outstanding. A positive manual balance counts as their oldest debt. The
 * open amounts add up to the person's balance, so a request for one never exceeds what a
 * settle-up allows.
 */
export const entryDebts = (transaction: Transaction, transactions: Transaction[], people: Person[]): EntryDebt[] => {
  const currency = transaction.currency;
  const owedHere = new Map<string, number>();
  for (const effect of getTransactionBalanceEffects(transaction)) {
    if (effect.delta <= 0) continue;
    owedHere.set(effect.personId, (owedHere.get(effect.personId) ?? 0) + toCents(effect.delta));
  }
  if (owedHere.size === 0) return [];

  // One pass over every entry: debts and credits per person, in this entry's currency.
  const debts = new Map<string, Map<string, Debt>>();
  const credits = new Map<string, number>();
  for (const personId of owedHere.keys()) {
    debts.set(personId, new Map());
    credits.set(personId, 0);
  }
  const others = transactions.some(item => item.id === transaction.id)
    ? transactions
    : [...transactions, transaction];
  for (const item of others) {
    for (const effect of getTransactionBalanceEffects(item)) {
      const personDebts = debts.get(effect.personId);
      if (!personDebts || effect.currency !== currency) continue;
      const cents = toCents(effect.delta);
      if (cents < 0) {
        credits.set(effect.personId, credits.get(effect.personId)! - cents);
        continue;
      }
      const existing = personDebts.get(item.id);
      if (existing) existing.cents += cents;
      else personDebts.set(item.id, { key: item.id, time: timeOf(item.date), cents });
    }
  }

  return [...owedHere].map(([personId, amountCents]) => {
    const personDebts = debts.get(personId)!;
    let credit = credits.get(personId)!;
    const offset = toCents(people.find(person => person.id === personId)?.balances?.[currency] ?? 0);
    if (offset < 0) credit -= offset;
    const ordered = [...personDebts.values()];
    if (offset > 0) ordered.push({ key: OFFSET_KEY, time: Number.NEGATIVE_INFINITY, cents: offset });
    ordered.sort((a, b) => a.time - b.time || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    let outstandingCents = amountCents;
    for (const debt of ordered) {
      const applied = Math.min(credit, debt.cents);
      credit -= applied;
      if (debt.key === transaction.id) {
        outstandingCents = debt.cents - applied;
        break;
      }
    }
    outstandingCents = Math.max(0, Math.min(amountCents, outstandingCents));
    const state: EntryDebtState = outstandingCents === 0 ? 'paid' : outstandingCents < amountCents ? 'partial' : 'owed';
    return { personId, amount: amountCents / 100, outstanding: outstandingCents / 100, state };
  });
};
