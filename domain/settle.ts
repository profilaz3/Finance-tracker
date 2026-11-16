import { convertAmount } from '../services/currencyService';
import type { Currency, EventDebt, ExchangeRates, SharedExpense } from '../types';

/**
 * Settling up.
 *
 * An event settlement ("Alex paid Sam back 1,250 RSD") is stored as an ordinary shared
 * expense, so it needs no schema change and syncs like any other row: the debtor is the
 * payer and the creditor is the only participant, with an exact split of the whole amount.
 * That moves the debtor's balance up and the creditor's down by the same amount, which is
 * exactly a repayment. The reserved category marks the row so spending totals, category
 * breakdowns and the expense list can tell it apart from real spending.
 */
export const SETTLEMENT_CATEGORY = '__settlement__';

export const isSettlementExpense = (expense: Pick<SharedExpense, 'category'>): boolean =>
  expense.category === SETTLEMENT_CATEGORY;

/** Real spending only (settlements are money moving between people, not money spent). */
export const spendingExpenses = <T extends Pick<SharedExpense, 'category'>>(expenses: T[]): T[] =>
  expenses.filter(expense => !isSettlementExpense(expense));

/** Smallest amount worth paying back, in cents: whole dinars for RSD, cents otherwise. */
export const settleUnitCents = (currency: Currency): number => (currency === 'RSD' ? 100 : 1);

export type CentBalances = Map<string, number>;

const addCents = (balances: CentBalances, personId: string, cents: number) => {
  balances.set(personId, (balances.get(personId) ?? 0) + cents);
};

/** Equal shares in integer cents; the payer (then list order) absorbs the extra cents. */
const splitEqualCents = (totalCents: number, participantIds: string[], payerId: string): Map<string, number> => {
  const ordered = [...participantIds].sort((left, right) => Number(right === payerId) - Number(left === payerId));
  const base = Math.floor(totalCents / ordered.length);
  const remainder = totalCents - base * ordered.length;
  return new Map(ordered.map((personId, index) => [personId, base + (index < remainder ? 1 : 0)]));
};

/**
 * Net balance per person and currency, in integer cents. Positive: the person is owed money.
 * Settlement rows are included, so recorded repayments reduce the balances.
 */
export const netBalancesByCurrency = (expenses: SharedExpense[]): Map<Currency, CentBalances> => {
  const byCurrency = new Map<Currency, CentBalances>();

  expenses.forEach(expense => {
    const { paidBy, amount, currency, sharedWith, splitType, splitDetails } = expense;
    if (!sharedWith || sharedWith.length === 0) return;

    const shares = splitType === 'exact' && splitDetails
      ? new Map(sharedWith.map(personId => [personId, Math.round((splitDetails[personId] || 0) * 100)]))
      : splitEqualCents(Math.round(amount * 100), sharedWith, paidBy);

    const balances = byCurrency.get(currency) ?? new Map<string, number>();
    byCurrency.set(currency, balances);

    // The payer is owed everything consumed (their own share nets out below).
    let consumedCents = 0;
    shares.forEach((cents, personId) => {
      addCents(balances, personId, -cents);
      consumedCents += cents;
    });
    addCents(balances, paidBy, consumedCents);
  });

  return byCurrency;
};

/**
 * Fewest-payments plan for one currency: repeatedly match the largest debtor with the largest
 * creditor. Every payment clears at least one person, so n people need at most n - 1 payments.
 * Balances smaller than the currency's unit count as settled, and RSD payments are whole dinars.
 */
export const simplifyDebts = (balances: CentBalances, currency: Currency): EventDebt[] => {
  const unit = settleUnitCents(currency);
  const debtors = [...balances.entries()].filter(([, cents]) => -cents >= unit).map(([id, cents]) => ({ id, cents: -cents }));
  const creditors = [...balances.entries()].filter(([, cents]) => cents >= unit).map(([id, cents]) => ({ id, cents }));
  const byLargest = (left: { id: string; cents: number }, right: { id: string; cents: number }) =>
    right.cents - left.cents || left.id.localeCompare(right.id);
  debtors.sort(byLargest);
  creditors.sort(byLargest);

  const debts: EventDebt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i].cents, creditors[j].cents);
    const paid = Math.round(cents / unit) * unit;
    if (paid >= unit) {
      debts.push({ from: debtors[i].id, to: creditors[j].id, amount: paid / 100, currency });
    }
    debtors[i].cents -= cents;
    creditors[j].cents -= cents;
    if (debtors[i].cents < unit) i++;
    if (creditors[j].cents < unit) j++;
  }
  return debts;
};

export interface SettlementPlanOptions {
  /** Net everything in this currency (requires `rates`); otherwise settle each currency separately. */
  currency?: Currency;
  rates?: ExchangeRates;
}

/**
 * Who pays whom to clear an event. Without `currency` + `rates`, each currency is settled on
 * its own (no silent conversion); with them, all currencies are netted into one balance per
 * person first.
 */
export const planSettlement = (expenses: SharedExpense[], options: SettlementPlanOptions = {}): EventDebt[] => {
  const byCurrency = netBalancesByCurrency(expenses);
  const { currency: target, rates } = options;
  if (!target || !rates) {
    return [...byCurrency.entries()].flatMap(([currency, balances]) => simplifyDebts(balances, currency));
  }

  const netted: CentBalances = new Map();
  byCurrency.forEach((balances, currency) => {
    balances.forEach((cents, personId) => {
      addCents(netted, personId, Math.round(convertAmount(cents / 100, currency, target, rates) * 100));
    });
  });

  // Conversion rounding can leave a cent of imbalance; absorb it in the largest balance.
  const drift = [...netted.values()].reduce((sum, cents) => sum + cents, 0);
  if (drift !== 0 && netted.size > 0) {
    const [largestId] = [...netted.entries()].sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))[0];
    addCents(netted, largestId, -drift);
  }

  return simplifyDebts(netted, target);
};

/**
 * What each person still gets back (positive) or owes (negative) according to a settle-up plan,
 * in that plan's currency. Payments are rounded once, inside the plan (whole dinars for RSD), so
 * per-person balances shown from this always add up to exactly the suggested payments instead of
 * drifting by a unit from separately rounded totals. People the plan does not mention are even.
 */
export const planBalances = (debts: EventDebt[]): Map<string, number> => {
  const cents = new Map<string, number>();
  debts.forEach(debt => {
    const amountCents = Math.round(debt.amount * 100);
    addCents(cents, debt.to, amountCents);
    addCents(cents, debt.from, -amountCents);
  });
  return new Map([...cents.entries()].map(([personId, value]) => [personId, value / 100]));
};

interface BuildSettlementExpenseInput {
  createId: () => string;
  eventId: string;
  debt: EventDebt;
  /** Stored name, e.g. "Settlement"; the list shows its own localized label. */
  name: string;
  /** Pay back less than the suggested amount (partial settlement). */
  amount?: number;
  nowIso?: string;
}

/** The shared expense that records "debt.from paid debt.to back". */
export const buildSettlementExpense = ({
  createId,
  eventId,
  debt,
  name,
  amount = debt.amount,
  nowIso,
}: BuildSettlementExpenseInput): SharedExpense | null => {
  const rounded = Math.round(amount * 100) / 100;
  if (!(rounded > 0) || debt.from === debt.to) return null;
  return {
    id: createId(),
    eventId,
    name,
    amount: rounded,
    currency: debt.currency,
    paidBy: debt.from,
    sharedWith: [debt.to],
    splitType: 'exact',
    splitDetails: { [debt.to]: rounded },
    date: nowIso ?? new Date().toISOString(),
    category: SETTLEMENT_CATEGORY,
  };
};
