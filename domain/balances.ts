import type { Currency, Person, Transaction } from '../types';

/**
 * Person balances are derived, not stored.
 *
 * effective balance = stored `person.balances` (manual offsets) + effects of transactions
 *
 * - A transaction with `personId`: expense (I lent / paid for them) => +amount,
 *   income (they paid me / settlement) => -amount, in the transaction currency.
 * - A split I paid: each share => +share.amount in the transaction currency.
 *
 * `person.balances` therefore only holds what has no transaction behind it
 * (manual balance corrections and "they paid" debts). Handlers must never
 * write transaction effects into it; deleting, editing or undoing a
 * transaction then updates balances automatically and consistently.
 *
 * Sign convention: positive = they owe me, negative = I owe them.
 */

export const BALANCE_CURRENCIES: readonly Currency[] = ['EUR', 'USD', 'RSD'];

export type BalanceMap = Record<Currency, number>;

export interface BalanceEffect {
  personId: string;
  currency: Currency;
  delta: number;
}

const toCents = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100);
const fromCents = (cents: number): number => cents / 100;

export const emptyBalances = (): BalanceMap => ({ EUR: 0, USD: 0, RSD: 0 });

export const getTransactionBalanceEffects = (transaction: Transaction): BalanceEffect[] => {
  const effects: BalanceEffect[] = [];

  if (transaction.personId) {
    effects.push({
      personId: transaction.personId,
      currency: transaction.currency,
      delta: transaction.type === 'expense' ? transaction.amount : -transaction.amount,
    });
  }

  transaction.splitDetails?.shares.forEach(share => {
    if (!share.personId || !share.amount) return;
    effects.push({ personId: share.personId, currency: transaction.currency, delta: share.amount });
  });

  return effects;
};

/** Sum of transaction effects per person, computed in integer cents. */
export const deriveTransactionBalances = (transactions: Transaction[]): Map<string, BalanceMap> => {
  const cents = new Map<string, Record<Currency, number>>();

  transactions.forEach(transaction => {
    getTransactionBalanceEffects(transaction).forEach(effect => {
      const entry = cents.get(effect.personId) ?? emptyBalances();
      entry[effect.currency] = (entry[effect.currency] ?? 0) + toCents(effect.delta);
      cents.set(effect.personId, entry);
    });
  });

  const result = new Map<string, BalanceMap>();
  cents.forEach((entry, personId) => {
    const balances = emptyBalances();
    BALANCE_CURRENCIES.forEach(currency => {
      balances[currency] = fromCents(entry[currency] ?? 0);
    });
    result.set(personId, balances);
  });
  return result;
};

const combine = (offsets: Partial<BalanceMap> | undefined, derived: BalanceMap | undefined): BalanceMap => {
  const balances = emptyBalances();
  BALANCE_CURRENCIES.forEach(currency => {
    balances[currency] = fromCents(toCents(offsets?.[currency] ?? 0) + toCents(derived?.[currency] ?? 0));
  });
  return balances;
};

/** Effective balances of one person (stored offsets + transaction effects). */
export const getEffectivePersonBalances = (person: Person, transactions: Transaction[]): BalanceMap =>
  combine(person.balances, deriveTransactionBalances(transactions).get(person.id));

/**
 * Selector: people with `balances` replaced by effective balances. Used for
 * everything that displays or acts on a balance. Never persist its output.
 */
export const selectPeopleWithBalances = (people: Person[], transactions: Transaction[]): Person[] => {
  if (people.length === 0) return people;
  const derived = deriveTransactionBalances(transactions);
  return people.map(person => ({ ...person, balances: combine(person.balances, derived.get(person.id)) }));
};

/**
 * Stored offset needed so the effective balance in `currency` becomes `desired`.
 */
export const calculateBalanceOffset = (
  person: Person,
  transactions: Transaction[],
  currency: Currency,
  desired: number,
): number => {
  const effective = getEffectivePersonBalances(person, transactions)[currency];
  return fromCents(toCents(person.balances?.[currency] ?? 0) + toCents(desired) - toCents(effective));
};
