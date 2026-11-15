import type { AppState, Budget, Category, Currency, RecurringTransaction, Transaction } from '../types';
import { FEE_CURRENCY, getCountedExpenseAmount, getCountedIncomeAmount } from './money';
import { convertAmount } from '../services/currencyService';

/** A calendar month in local time. `month` is 0-based like Date#getMonth. */
export interface MonthKey {
  year: number;
  month: number;
}

export const monthKeyOf = (date: Date): MonthKey => ({ year: date.getFullYear(), month: date.getMonth() });

export const isSameMonth = (a: MonthKey, b: MonthKey): boolean => a.year === b.year && a.month === b.month;

export const shiftMonth = (key: MonthKey, delta: number): MonthKey => {
  const date = new Date(key.year, key.month + delta, 1);
  return monthKeyOf(date);
};

export const daysInMonth = (key: MonthKey): number => new Date(key.year, key.month + 1, 0).getDate();

/** Parse a stored date. Date-only strings are local days, not UTC midnight. */
export const parseLocalDate = (value: string): Date => {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  return new Date(value);
};

export const isInMonth = (value: string, key: MonthKey): boolean => {
  const date = parseLocalDate(value);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === key.year && date.getMonth() === key.month;
};

export interface CategorySpend {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
}

export interface MonthSummary {
  key: MonthKey;
  income: number;
  spent: number;
  /** Income minus spending this month (can be negative). */
  left: number;
  /** Spending per category, largest first. */
  byCategory: CategorySpend[];
  /** Spending per day of the month (index 0 = day 1). Future days are 0. */
  byDay: number[];
  daysInMonth: number;
  /** Day of the month that is "today" for this month: the real day for the current month, the last day for past months, 0 for future months. */
  todayIndex: number;
  /** Share of the month elapsed (0..1), counting today as elapsed. */
  monthElapsed: number;
  /** Change in net worth from this month's entries (all flows, not just counted spending). */
  netChange: number;
  /** `netChange` per day of the month (index 0 = day 1), for the net worth trend line. */
  netByDay: number[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const OTHER_COLOR = '#8A8984';

export function computeMonthSummary(
  state: Pick<AppState, 'transactions' | 'categories' | 'baseCurrency' | 'rates'>,
  key: MonthKey,
  now: Date = new Date(),
): MonthSummary {
  const days = daysInMonth(key);
  const byDay = new Array<number>(days).fill(0);
  const netByDay = new Array<number>(days).fill(0);
  const byCategoryMap = new Map<string, number>();
  let income = 0;
  let spent = 0;
  let netChange = 0;

  for (const transaction of state.transactions) {
    if (!isInMonth(transaction.date, key)) continue;
    const date = parseLocalDate(transaction.date);

    const expense = getCountedExpenseAmount(transaction, state.baseCurrency, state.rates);
    if (expense > 0) {
      spent += expense;
      byDay[date.getDate() - 1] += expense;
      byCategoryMap.set(transaction.categoryId, (byCategoryMap.get(transaction.categoryId) ?? 0) + expense);
    }
    income += getCountedIncomeAmount(transaction, state.baseCurrency, state.rates);

    const amount = convertAmount(transaction.amount, transaction.currency, state.baseCurrency, state.rates);
    const fees = transaction.fees ? convertAmount(transaction.fees, FEE_CURRENCY, state.baseCurrency, state.rates) : 0;
    const net = transaction.type === 'income' ? amount - fees : -amount - fees;
    netChange += net;
    netByDay[date.getDate() - 1] += net;
  }

  const categoriesById = new Map(state.categories.map(category => [category.id, category] as const));
  const byCategory: CategorySpend[] = [...byCategoryMap.entries()]
    .map(([categoryId, amount]) => {
      const category = categoriesById.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? categoryId,
        color: category?.color ?? OTHER_COLOR,
        amount: round2(amount),
      };
    })
    .filter(entry => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const current = monthKeyOf(now);
  const isCurrent = isSameMonth(current, key);
  const isPast = key.year < current.year || (key.year === current.year && key.month < current.month);
  const todayIndex = isCurrent ? now.getDate() : isPast ? days : 0;

  return {
    key,
    income: round2(income),
    spent: round2(spent),
    left: round2(income - spent),
    byCategory,
    byDay: byDay.map(round2),
    daysInMonth: days,
    todayIndex,
    monthElapsed: todayIndex / days,
    netChange: round2(netChange),
    netByDay: netByDay.map(round2),
  };
}

/** Collapse a ranked category list to `max` entries, folding the rest into "Other". */
export function topCategories(byCategory: CategorySpend[], max: number, otherLabel: string): CategorySpend[] {
  if (byCategory.length <= max) return byCategory;
  const head = byCategory.slice(0, max - 1);
  const rest = byCategory.slice(max - 1).reduce((sum, entry) => sum + entry.amount, 0);
  return [...head, { categoryId: '__other', name: otherLabel, color: OTHER_COLOR, amount: round2(rest) }];
}

export interface BudgetCategoryProgress {
  categoryId: string;
  name: string;
  color: string;
  limit: number;
  spent: number;
  /** Positive when over the limit. */
  over: number;
  left: number;
}

export interface BudgetProgress {
  total: number;
  spent: number;
  left: number;
  /** Spent / total, may exceed 1. 0 when total is 0. */
  spentRatio: number;
  /** Share of the month elapsed (0..1): where the "Today" marker sits. */
  monthElapsed: number;
  /** Spending faster than the month is passing. */
  aheadOfPace: boolean;
  categories: BudgetCategoryProgress[];
}

export function computeBudgetProgress(
  budget: Budget,
  summary: MonthSummary,
  categories: Category[],
): BudgetProgress {
  const spentByCategory = new Map(summary.byCategory.map(entry => [entry.categoryId, entry.amount] as const));
  const categoriesById = new Map(categories.map(category => [category.id, category] as const));

  const categoryProgress = Object.entries(budget.categoryLimits)
    .filter(([categoryId, limit]) => limit > 0 && categoriesById.has(categoryId))
    .map(([categoryId, limit]) => {
      const category = categoriesById.get(categoryId)!;
      const spent = spentByCategory.get(categoryId) ?? 0;
      return {
        categoryId,
        name: category.name,
        color: category.color,
        limit,
        spent,
        over: round2(Math.max(0, spent - limit)),
        left: round2(Math.max(0, limit - spent)),
      };
    })
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);

  const total = budget.monthly;
  const spentRatio = total > 0 ? summary.spent / total : 0;

  return {
    total,
    spent: summary.spent,
    left: round2(total - summary.spent),
    spentRatio,
    monthElapsed: summary.monthElapsed,
    aheadOfPace: total > 0 && spentRatio > summary.monthElapsed + 0.02,
    categories: categoryProgress,
  };
}

export interface UpcomingItem {
  recurring: RecurringTransaction;
  due: Date;
}

/** Active recurring entries due within `days` days from today (inclusive), soonest first. */
export function getUpcomingRecurring(recurring: RecurringTransaction[], now: Date = new Date(), days = 30): UpcomingItem[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  return recurring
    .filter(item => item.isActive && item.nextDue)
    .map(item => ({ recurring: item, due: parseLocalDate(item.nextDue) }))
    .filter(item => !Number.isNaN(item.due.getTime()) && item.due >= start && item.due <= end)
    .filter(item => !item.recurring.endDate || parseLocalDate(item.recurring.endDate) >= item.due)
    .sort((a, b) => a.due.getTime() - b.due.getTime());
}

/** Newest first; ties keep their stored order. */
export function getRecentTransactions(transactions: Transaction[], count: number): Transaction[] {
  return transactions
    .map((transaction, index) => ({ transaction, index, time: parseLocalDate(transaction.date).getTime() }))
    .sort((a, b) => (b.time - a.time) || (b.index - a.index))
    .slice(0, count)
    .map(entry => entry.transaction);
}

/**
 * Pairs shown on the Rates block: the two with the base currency first, then the other two.
 * Each reads as "1 of the stronger currency is so many of the other" (1 EUR = 117.2 RSD), never
 * 1 RSD = 0.0085 EUR.
 */
export function getRatePairs(base: Currency, rates: Record<Currency, number>): Array<{ from: Currency; to: Currency; value: number }> {
  const all: Currency[] = ['EUR', 'USD', 'RSD'];
  const others = all.filter(currency => currency !== base);
  const pairs: Array<{ from: Currency; to: Currency }> = [
    { from: base, to: others[0] },
    { from: base, to: others[1] },
    { from: others[0], to: others[1] },
  ];
  return pairs.map(({ from, to }) => {
    const value = rates[from] ? rates[to] / rates[from] : 0;
    return value > 0 && value < 1 ? { from: to, to: from, value: 1 / value } : { from, to, value };
  });
}
