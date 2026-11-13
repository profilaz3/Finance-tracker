import type { AppState, Category, Currency, ExchangeRates, Event, RecurringTransaction, Transaction } from '../types';
import { convertAmount } from '../services/currencyService';
import { formatDate, formatMoney, type AppLanguage } from '../utils/locale';
import {
  computeBudgetProgress,
  computeMonthSummary,
  isInMonth,
  monthKeyOf,
  parseLocalDate,
  shiftMonth,
  type MonthKey,
} from './home';
import { getCountedExpenseAmount, getCountedIncomeAmount, isCountedExpense, isCountedIncome } from './money';
import { normalizeMerchant } from './merchantMemory';
import { detectSubscriptions, type SubscriptionCadence } from './subscriptions';
import { endOfMonth, monthId, parseMonthId } from './letterArchive';

export {
  archiveList,
  letterArchiveKey,
  letterAttemptKey,
  letterMonthFor,
  MAX_ARCHIVED_LETTERS,
  MAX_AUTO_ATTEMPTS,
  monthId,
  nextAttempt,
  nextLetterReminderAt,
  parseLetterArchive,
  parseMonthId,
  RETRY_AFTER_MS,
  shouldAutoGenerate,
  withLetter,
  type LetterArchive,
  type LetterAttempt,
  type StoredLetter,
} from './letterArchive';

/**
 * The monthly letter: a short note about last month, written by the model from aggregates
 * computed here. Every figure is exact and local; the model only words them.
 */


// ---------------------------------------------------------------------------
// Aggregates

export interface MoverEntry {
  kind: 'category' | 'merchant';
  name: string;
  amount: number;
  previous: number;
  change: number;
  /** Null when there was nothing to compare with last month. */
  changePct: number | null;
}

export interface OneOff {
  name: string;
  category: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
}

export interface EventOfMonth {
  name: string;
  spent: number;
  count: number;
  start?: string;
  end?: string;
}

export interface BudgetOutcome {
  limit: number;
  spent: number;
  /** Limit minus spending: negative when over. */
  difference: number;
  categoriesOver: Array<{ name: string; limit: number; spent: number; over: number }>;
  categoriesWithin: number;
}

/** A subscription that looks forgotten, from the subscriptions detector. Amounts in the base currency. */
export interface SubscriptionNote {
  name: string;
  amount: number;
  cadence: SubscriptionCadence;
  /** ISO date of the first charge in the pattern. */
  since: string;
  charges: number;
  priceRise?: { from: number; to: number };
}

export interface LetterAggregates {
  month: string;
  previousMonth: string;
  currency: Currency;
  spent: number;
  income: number;
  net: number;
  transactionCount: number;
  previousSpent: number;
  previousIncome: number;
  /** Average spending of up to three months before the letter month that have entries. */
  averageSpent: number | null;
  averageMonths: number;
  spentChangePct: number | null;
  spentVsAveragePct: number | null;
  topCategories: Array<{ name: string; amount: number; sharePct: number }>;
  movers: MoverEntry[];
  budget: BudgetOutcome | null;
  oneOffs: OneOff[];
  events: EventOfMonth[];
  subscription: SubscriptionNote | null;
}

export type LetterInputs = Pick<
  AppState,
  'transactions' | 'categories' | 'baseCurrency' | 'rates' | 'budget' | 'events' | 'recurringTransactions'
>;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const pctChange = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

/** The merchant or note a transaction is about, if any. */
export const merchantLabel = (transaction: Transaction): string =>
  (transaction.receiptData?.merchant?.trim() || transaction.note?.trim() || '').slice(0, 40);

interface MerchantTotal {
  key: string;
  label: string;
  amount: number;
  count: number;
  categoryAmounts: Map<string, number>;
}

const merchantTotals = (expenses: Array<{ transaction: Transaction; amount: number }>): Map<string, MerchantTotal> => {
  const totals = new Map<string, MerchantTotal>();
  for (const { transaction, amount } of expenses) {
    const label = merchantLabel(transaction);
    const key = normalizeMerchant(label);
    if (key.length < 2) continue;
    const entry = totals.get(key) ?? { key, label, amount: 0, count: 0, categoryAmounts: new Map() };
    entry.amount += amount;
    entry.count += 1;
    entry.label = label;
    entry.categoryAmounts.set(transaction.categoryId, (entry.categoryAmounts.get(transaction.categoryId) ?? 0) + amount);
    totals.set(key, entry);
  }
  return totals;
};

const mainCategory = (entry: MerchantTotal | undefined): string | undefined =>
  entry ? [...entry.categoryAmounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;

const countedExpensesIn = (state: LetterInputs, key: MonthKey) =>
  state.transactions
    .filter(transaction => isInMonth(transaction.date, key) && isCountedExpense(transaction))
    .map(transaction => ({ transaction, amount: getCountedExpenseAmount(transaction, state.baseCurrency, state.rates) }))
    .filter(entry => entry.amount > 0);

/** Does this expense look like an occurrence of a recurring rule (same category, amount within 10%, or same name)? */
export const matchesRecurring = (
  transaction: Transaction,
  recurring: readonly RecurringTransaction[],
  baseCurrency: Currency,
  rates: ExchangeRates,
): boolean => {
  const key = normalizeMerchant(merchantLabel(transaction));
  const amount = convertAmount(transaction.amount, transaction.currency, baseCurrency, rates);
  return recurring.some(rule => {
    if (rule.type !== 'expense') return false;
    if (key && normalizeMerchant(rule.name) === key) return true;
    if (rule.categoryId !== transaction.categoryId) return false;
    const ruleAmount = convertAmount(rule.amount, rule.currency, baseCurrency, rates);
    return ruleAmount > 0 && Math.abs(amount - ruleAmount) / ruleAmount <= 0.1;
  });
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const pad = (value: number) => String(value).padStart(2, '0');
const toIsoDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const findMovers = (
  current: ReturnType<typeof countedExpensesIn>,
  previous: ReturnType<typeof countedExpensesIn>,
  categoriesById: Map<string, Category>,
  spent: number,
  previousSpent: number,
): MoverEntry[] => {
  const floor = Math.max(spent, previousSpent) * 0.03;
  const sumBy = (entries: typeof current) => {
    const map = new Map<string, number>();
    entries.forEach(({ transaction, amount }) => map.set(transaction.categoryId, (map.get(transaction.categoryId) ?? 0) + amount));
    return map;
  };
  const now = sumBy(current);
  const before = sumBy(previous);
  type Candidate = MoverEntry & { categoryId: string | undefined };
  const candidates: Candidate[] = [];

  for (const categoryId of new Set([...now.keys(), ...before.keys()])) {
    const amount = round2(now.get(categoryId) ?? 0);
    const prev = round2(before.get(categoryId) ?? 0);
    const name = categoriesById.get(categoryId)?.name ?? categoryId;
    candidates.push({ kind: 'category', name, amount, previous: prev, change: round2(amount - prev), changePct: pctChange(amount, prev), categoryId });
  }

  const merchantsNow = merchantTotals(current);
  const merchantsBefore = merchantTotals(previous);
  for (const merchantKey of new Set([...merchantsNow.keys(), ...merchantsBefore.keys()])) {
    const a = merchantsNow.get(merchantKey);
    const b = merchantsBefore.get(merchantKey);
    // A single purchase is a one-off, not a trend.
    if ((a?.count ?? 0) + (b?.count ?? 0) < 2) continue;
    const amount = round2(a?.amount ?? 0);
    const prev = round2(b?.amount ?? 0);
    candidates.push({
      kind: 'merchant',
      name: (a ?? b)!.label,
      amount,
      previous: prev,
      change: round2(amount - prev),
      changePct: pctChange(amount, prev),
      categoryId: mainCategory(a ?? b),
    });
  }

  const picked: MoverEntry[] = [];
  const usedCategories = new Set<string>();
  candidates
    .filter(candidate => Math.abs(candidate.change) > 0 && Math.abs(candidate.change) >= floor)
    // Biggest swing first; on a tie a merchant is more telling than its category.
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || (a.kind === 'merchant' ? -1 : 1))
    .forEach(({ categoryId, ...mover }) => {
      if (picked.length >= 3) return;
      if (categoryId && usedCategories.has(categoryId)) return;
      if (categoryId) usedCategories.add(categoryId);
      picked.push(mover);
    });
  return picked;
};

const findOneOffs = (
  state: LetterInputs,
  key: MonthKey,
  current: ReturnType<typeof countedExpensesIn>,
  categoriesById: Map<string, Category>,
  spent: number,
): OneOff[] => {
  if (current.length === 0) return [];
  const threshold = Math.max(median(current.map(entry => entry.amount)) * 3, spent * 0.08);
  const monthStart = new Date(key.year, key.month, 1).getTime();
  const lookback = monthStart - 180 * 86_400_000;
  // Without a merchant name, the category stands in: rent paid every month is not a one-off.
  const habitKey = (transaction: Transaction) => normalizeMerchant(merchantLabel(transaction)) || `category:${transaction.categoryId}`;
  const seenBefore = new Set<string>();
  for (const transaction of state.transactions) {
    const time = parseLocalDate(transaction.date).getTime();
    if (time >= lookback && time < monthStart) seenBefore.add(habitKey(transaction));
  }
  const active = (state.recurringTransactions ?? []).filter(rule => rule.isActive);

  return current
    .filter(({ amount }) => amount >= threshold)
    .filter(({ transaction }) => !seenBefore.has(habitKey(transaction)))
    .filter(({ transaction }) => !matchesRecurring(transaction, active, state.baseCurrency, state.rates))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map(({ transaction, amount }) => {
      const category = categoriesById.get(transaction.categoryId)?.name ?? '';
      return {
        name: merchantLabel(transaction) || category,
        category,
        amount: round2(amount),
        date: toIsoDate(parseLocalDate(transaction.date)),
      };
    });
};

const eventRange = (event: Event): { start: Date | null; end: Date | null } => {
  const start = event.startDate ? parseLocalDate(event.startDate.slice(0, 10)) : null;
  const end = event.endDate ? parseLocalDate(event.endDate.slice(0, 10)) : start;
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
  };
};

const findEvents = (state: LetterInputs, key: MonthKey, current: ReturnType<typeof countedExpensesIn>): EventOfMonth[] => {
  const monthStart = new Date(key.year, key.month, 1);
  const monthEnd = endOfMonth(key);
  const spentByEvent = new Map<string, { spent: number; count: number }>();
  current.forEach(({ transaction, amount }) => {
    if (!transaction.eventId) return;
    const entry = spentByEvent.get(transaction.eventId) ?? { spent: 0, count: 0 };
    entry.spent += amount;
    entry.count += 1;
    spentByEvent.set(transaction.eventId, entry);
  });

  return (state.events ?? [])
    .map(event => {
      const { start, end } = eventRange(event);
      const overlaps = Boolean(start && end && start <= monthEnd && end >= monthStart);
      const totals = spentByEvent.get(event.id);
      if (!overlaps && !totals) return null;
      return {
        name: event.name.slice(0, 40),
        spent: round2(totals?.spent ?? 0),
        count: totals?.count ?? 0,
        ...(start ? { start: toIsoDate(start) } : {}),
        ...(end ? { end: toIsoDate(end) } : {}),
      } satisfies EventOfMonth;
    })
    .filter((entry): entry is EventOfMonth => entry !== null)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 3);
};

export interface LetterOptions {
  subscription?: SubscriptionNote | null;
}

/** A pattern needs this many charges before it counts as running quietly. */
const QUIET_SUBSCRIPTION_CHARGES = 4;

/**
 * The one subscription worth a second look in the letter month, or null: one whose price went up
 * this month first, otherwise the longest-running one that still charged this month. Dismissed
 * patterns ("Not a subscription") and those already tracked as recurring rules are skipped.
 */
export function pickSubscriptionToCheck(
  state: LetterInputs,
  key: MonthKey,
  options: { dismissed?: Iterable<string>; names?: Record<string, string> } = {},
): SubscriptionNote | null {
  const month = monthId(key);
  const detected = detectSubscriptions(state.transactions, state.recurringTransactions ?? [], {
    now: endOfMonth(key).getTime(),
    dismissed: options.dismissed,
  }).filter(item => item.status === 'active' && item.lastDate.slice(0, 7) === month);
  const rose = detected.find(item => item.priceIncrease && item.priceIncrease.date.slice(0, 7) === month);
  const quiet = detected
    .filter(item => item.count >= QUIET_SUBSCRIPTION_CHARGES)
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate) || b.monthlyCost - a.monthlyCost)[0];
  const pick = rose ?? quiet;
  if (!pick) return null;
  const toBase = (amount: number) => round2(convertAmount(amount, pick.currency, state.baseCurrency, state.rates));
  return {
    name: options.names?.[pick.key] || pick.label,
    amount: toBase(pick.amount),
    cadence: pick.cadence,
    since: pick.firstDate,
    charges: pick.count,
    ...(pick === rose && pick.priceIncrease ? { priceRise: { from: toBase(pick.priceIncrease.from), to: toBase(pick.priceIncrease.to) } } : {}),
  };
}

export function buildLetterAggregates(state: LetterInputs, key: MonthKey, options: LetterOptions = {}): LetterAggregates {
  const previousKey = shiftMonth(key, -1);
  const summary = computeMonthSummary(state, key, endOfMonth(key));
  const previousSummary = computeMonthSummary(state, previousKey, endOfMonth(previousKey));
  const categoriesById = new Map(state.categories.map(category => [category.id, category] as const));

  const history = [1, 2, 3]
    .map(back => {
      const monthKey = shiftMonth(key, -back);
      const hasEntries = state.transactions.some(
        transaction => isInMonth(transaction.date, monthKey) && (isCountedExpense(transaction) || isCountedIncome(transaction)),
      );
      return hasEntries ? computeMonthSummary(state, monthKey, endOfMonth(monthKey)).spent : null;
    })
    .filter((value): value is number => value !== null);
  const averageSpent = history.length > 0 ? round2(history.reduce((sum, value) => sum + value, 0) / history.length) : null;

  const current = countedExpensesIn(state, key);
  const previous = countedExpensesIn(state, previousKey);
  const transactionCount = state.transactions.filter(
    transaction => isInMonth(transaction.date, key) && (
      (isCountedExpense(transaction) && getCountedExpenseAmount(transaction, state.baseCurrency, state.rates) > 0)
      || (isCountedIncome(transaction) && getCountedIncomeAmount(transaction, state.baseCurrency, state.rates) > 0)
    ),
  ).length;

  let budget: BudgetOutcome | null = null;
  if (state.budget && state.budget.monthly > 0) {
    const progress = computeBudgetProgress(state.budget, summary, state.categories);
    budget = {
      limit: round2(progress.total),
      spent: round2(progress.spent),
      difference: round2(progress.total - progress.spent),
      categoriesOver: progress.categories
        .filter(category => category.over > 0)
        .sort((a, b) => b.over - a.over)
        .slice(0, 3)
        .map(category => ({ name: category.name, limit: round2(category.limit), spent: round2(category.spent), over: round2(category.over) })),
      categoriesWithin: progress.categories.filter(category => category.over <= 0).length,
    };
  }

  return {
    month: monthId(key),
    previousMonth: monthId(previousKey),
    currency: state.baseCurrency,
    spent: summary.spent,
    income: summary.income,
    net: summary.left,
    transactionCount,
    previousSpent: previousSummary.spent,
    previousIncome: previousSummary.income,
    averageSpent,
    averageMonths: history.length,
    spentChangePct: pctChange(summary.spent, previousSummary.spent),
    spentVsAveragePct: averageSpent !== null ? pctChange(summary.spent, averageSpent) : null,
    topCategories: summary.byCategory.slice(0, 4).map(entry => ({
      name: entry.name,
      amount: entry.amount,
      sharePct: summary.spent > 0 ? Math.round((entry.amount / summary.spent) * 100) : 0,
    })),
    movers: findMovers(current, previous, categoriesById, summary.spent, previousSummary.spent),
    budget,
    oneOffs: findOneOffs(state, key, current, categoriesById, summary.spent),
    events: findEvents(state, key, current),
    subscription: options.subscription ?? null,
  };
}

/** Too little activity makes a hollow letter; wait for a month with some life in it. */
export const MIN_LETTER_TRANSACTIONS = 5;
export const hasEnoughForLetter = (aggregates: LetterAggregates): boolean =>
  aggregates.transactionCount >= MIN_LETTER_TRANSACTIONS;

// ---------------------------------------------------------------------------
// Facts for the model: the aggregates as display text in the app language

/** Same rounding as the app's amounts: cents below 100 (except RSD), whole units above. */
export const letterMoney = (amount: number, currency: Currency, language: AppLanguage): string => {
  const digits = Math.abs(amount) < 100 && currency !== 'RSD' ? 2 : 0;
  return formatMoney(Math.abs(amount), currency, language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const monthName = (key: MonthKey, language: AppLanguage) =>
  formatDate(new Date(key.year, key.month, 15), { month: 'long', year: 'numeric' }, language);

const dayName = (value: string, language: AppLanguage) =>
  formatDate(parseLocalDate(value), { day: 'numeric', month: 'long' }, language);

const CADENCE_WORDS: Record<AppLanguage, Record<SubscriptionCadence, string>> = {
  en: { weekly: 'weekly', biweekly: 'every two weeks', monthly: 'monthly', quarterly: 'every three months', yearly: 'yearly' },
  sr: { weekly: 'nedeljno', biweekly: 'na dve nedelje', monthly: 'mesečno', quarterly: 'tromesečno', yearly: 'godišnje' },
};

const direction = (change: number): 'up' | 'down' | 'same' => (change > 0 ? 'up' : change < 0 ? 'down' : 'same');

/** Pre-formatted facts. The model copies these strings; nothing else may carry a number. */
export function toLetterFacts(aggregates: LetterAggregates, language: AppLanguage): Record<string, unknown> {
  const fmt = (amount: number) => letterMoney(amount, aggregates.currency, language);
  const pct = (value: number) => `${Math.abs(value)}%`;
  const key = parseMonthId(aggregates.month)!;
  const previousKey = parseMonthId(aggregates.previousMonth)!;

  return {
    month: monthName(key, language),
    previousMonth: monthName(previousKey, language),
    spent: fmt(aggregates.spent),
    // No income logged usually means it is tracked elsewhere, not that there was none.
    ...(aggregates.income > 0
      ? { income: fmt(aggregates.income), net: { amount: fmt(aggregates.net), result: aggregates.net >= 0 ? 'saved' : 'spent more than earned' } }
      : {}),
    entries: aggregates.transactionCount,
    previousMonthSpent: fmt(aggregates.previousSpent),
    ...(aggregates.spentChangePct !== null
      ? { spendingVsPreviousMonth: { direction: direction(aggregates.spentChangePct), percent: pct(aggregates.spentChangePct) } }
      : {}),
    ...(aggregates.averageSpent !== null
      ? {
          averageMonthlySpending: { amount: fmt(aggregates.averageSpent), months: aggregates.averageMonths },
          ...(aggregates.spentVsAveragePct !== null
            ? { spendingVsAverage: { direction: direction(aggregates.spentVsAveragePct), percent: pct(aggregates.spentVsAveragePct) } }
            : {}),
        }
      : {}),
    topCategories: aggregates.topCategories.map(entry => ({ name: entry.name, spent: fmt(entry.amount), share: pct(entry.sharePct) })),
    biggestMovers: aggregates.movers.map(mover => ({
      type: mover.kind,
      name: mover.name,
      thisMonth: fmt(mover.amount),
      ...(mover.previous > 0 ? { lastMonth: fmt(mover.previous) } : {}),
      change: { direction: direction(mover.change), amount: fmt(mover.change), ...(mover.changePct !== null ? { percent: pct(mover.changePct) } : { newThisMonth: mover.previous === 0 }) },
      ...(mover.amount === 0 ? { nothingThisMonth: true } : {}),
    })),
    ...(aggregates.budget
      ? {
          budget: {
            limit: fmt(aggregates.budget.limit),
            spent: fmt(aggregates.budget.spent),
            result: aggregates.budget.difference >= 0 ? 'under budget' : 'over budget',
            by: fmt(aggregates.budget.difference),
            categoriesOverLimit: aggregates.budget.categoriesOver.map(category => ({
              name: category.name,
              limit: fmt(category.limit),
              spent: fmt(category.spent),
              over: fmt(category.over),
            })),
            categoriesWithinLimit: aggregates.budget.categoriesWithin,
          },
        }
      : {}),
    oneOffs: aggregates.oneOffs.map(entry => ({ name: entry.name, category: entry.category, amount: fmt(entry.amount), date: dayName(entry.date, language) })),
    eventsAndTrips: aggregates.events.map(event => ({
      name: event.name,
      // A trip with nothing linked to it is still worth a mention, just without "RSD 0 across 0 entries".
      ...(event.count > 0 ? { spent: fmt(event.spent), entries: event.count } : {}),
      ...(event.start ? { from: dayName(event.start, language) } : {}),
      ...(event.end && event.end !== event.start ? { to: dayName(event.end, language) } : {}),
    })),
    ...(aggregates.subscription
      ? {
          subscriptionToCheck: {
            name: aggregates.subscription.name,
            amount: fmt(aggregates.subscription.amount),
            billed: CADENCE_WORDS[language][aggregates.subscription.cadence],
            chargingSince: monthName(parseMonthId(aggregates.subscription.since.slice(0, 7)) ?? key, language),
            charges: aggregates.subscription.charges,
            ...(aggregates.subscription.priceRise
              ? { priceWentUp: { from: fmt(aggregates.subscription.priceRise.from), to: fmt(aggregates.subscription.priceRise.to) } }
              : {}),
          },
        }
      : {}),
  };
}
