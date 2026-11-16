import type { AppState, Budget } from '../types';
import { computeMonthSummary, type CategorySpend, type MonthKey } from './home';

/**
 * What the Budgets page shows beyond the plain progress: the ring split at today's mark, a
 * suggested limit for a category that keeps running over, and the big categories that have no
 * limit yet. Pure, so the numbers can be tested without the screen.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface RingSegments {
  /** Spent within the pace (0..1 of the ring): solid. */
  onPace: number;
  /** Spent ahead of today's mark (0..1 of the ring, after `onPace`): hatched. */
  ahead: number;
  /** Where today sits on the ring (0..1). */
  today: number;
}

/**
 * The budget ring: spending up to today's share of the month is drawn plain, anything spent
 * beyond it is drawn as "ahead". Both stop at a full ring.
 */
export const ringSegments = (spentRatio: number, monthElapsed: number): RingSegments => {
  const spent = Math.max(0, Math.min(1, spentRatio));
  const today = Math.max(0, Math.min(1, monthElapsed));
  const onPace = Math.min(spent, today);
  return { onPace, ahead: Math.max(0, spent - onPace), today };
};

const previousMonths = (now: Date, count: number): MonthKey[] =>
  Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

export interface CategoryAverage {
  /** Average spend per month over the months counted. */
  average: number;
  /** Full months counted (months before the first entry are skipped). */
  months: number;
}

/**
 * Average monthly spending per category over the last `count` full months. Months with no
 * spending at all (before the user started) are left out, so a new user is not averaged down.
 */
export const categoryAverages = (
  state: Pick<AppState, 'transactions' | 'categories' | 'baseCurrency' | 'rates'>,
  now: Date = new Date(),
  count = 3,
): { months: number; byCategory: Map<string, number> } => {
  const summaries = previousMonths(now, count)
    .map(key => computeMonthSummary(state, key, now))
    .filter(summary => summary.spent > 0);
  const totals = new Map<string, number>();
  summaries.forEach(summary => summary.byCategory.forEach(entry => {
    totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.amount);
  }));
  const months = summaries.length;
  return {
    months,
    byCategory: new Map([...totals].map(([id, total]) => [id, months ? round2(total / months) : 0])),
  };
};

/**
 * A limit a little above `amount`, on a round step (19,213 becomes 19,500; 482 becomes 485).
 * Steps are about half a percent of the size of the amount, never below 1.
 */
export const roundLimitUp = (amount: number): number => {
  if (!(amount > 0)) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(amount)) - 2);
  const step = Math.max(1, magnitude * 5);
  return Math.ceil(amount / step - 1e-9) * step;
};

export interface RaiseSuggestion {
  limit: number;
  average: number;
  months: number;
}

/**
 * For a category over its limit: the limit its usual spending needs, when that is above the
 * current one. Undefined when there is no history or the usual month fits the limit already.
 */
export const raiseSuggestion = (
  limit: number,
  average: CategoryAverage | undefined,
): RaiseSuggestion | undefined => {
  if (!average || average.months === 0 || average.average <= 0) return undefined;
  const next = roundLimitUp(average.average);
  return next > limit ? { limit: next, average: average.average, months: average.months } : undefined;
};

/** The biggest categories spent on this month that have no limit, largest first. */
export const unlimitedCategories = (
  byCategory: readonly CategorySpend[],
  budget: Budget | null | undefined,
  allowed: ReadonlySet<string>,
  max = 2,
): CategorySpend[] => byCategory
  .filter(entry => entry.amount > 0 && allowed.has(entry.categoryId) && !((budget?.categoryLimits[entry.categoryId] ?? 0) > 0))
  .slice(0, max);

/** The budget with one category limit changed (0 removes it). */
export const withCategoryLimit = (budget: Budget | null | undefined, categoryId: string, limit: number): Budget => {
  const categoryLimits = { ...(budget?.categoryLimits ?? {}) };
  if (limit > 0) categoryLimits[categoryId] = limit;
  else delete categoryLimits[categoryId];
  return { monthly: budget?.monthly ?? 0, categoryLimits };
};
