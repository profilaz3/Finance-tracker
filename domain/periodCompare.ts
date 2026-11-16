import type { Currency, Event, ExchangeRates, Transaction } from '../types';
import { getCountedFee, getExpensePrincipal, isCountedExpense } from './money';
import { resolveAnalyticsPeriod, type AnalyticsPeriod } from '../utils/analyticsSelectors';

/**
 * What the Insights header and its "Compared with" card are built from: spending per period for
 * the bars, and this period so far against the same days of the one before, by category (or by
 * event, for entries linked to one). Spending follows the analytics rules: my share of splits,
 * no transfers or repayments, fees counted on everything.
 */

export interface SpendingBar {
  start: Date;
  end: Date;
  amount: number;
  current: boolean;
}

export interface CompareMover {
  /** `cat:<id>` or `event:<id>`. */
  key: string;
  kind: 'category' | 'event';
  id: string;
  now: number;
  before: number;
  delta: number;
  countNow: number;
  countBefore: number;
  /** The biggest notes on the side that explains the change (this period when up, the last one when down). */
  notes: string[];
}

export interface PeriodComparison {
  /** The same days of the previous period. */
  start: Date;
  end: Date;
  now: number;
  before: number;
  movers: CompareMover[];
}

const round = (value: number) => Math.round(value * 100) / 100;

const inRange = (transaction: Transaction, start: Date, end: Date) => {
  const time = new Date(transaction.date).getTime();
  return time >= start.getTime() && time <= end.getTime();
};

/** Money that left in a range, the way analytics counts expenses (fees included). */
export const spentBetween = (
  transactions: Transaction[], start: Date, end: Date, currency: Currency, rates: ExchangeRates,
): number => round(transactions.reduce((sum, transaction) => {
  if (!inRange(transaction, start, end)) return sum;
  const fee = getCountedFee(transaction, currency, rates);
  return sum + fee + (isCountedExpense(transaction) ? getExpensePrincipal(transaction, currency, rates) : 0);
}, 0));

/** A day inside the period `back` steps before the one holding `now` (the last day of its last month, at noon). */
const periodDay = (period: AnalyticsPeriod, now: Date, back: number): Date => {
  if (back === 0) return now;
  const step = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
  return new Date(now.getFullYear(), now.getMonth() - back * step + 1, 0, 12);
};

/**
 * Spending in the last `count` periods, oldest first, the current one (so far) last. Leading
 * periods with nothing in them are dropped, so a new user sees only what they have.
 */
export const spendingBars = (
  transactions: Transaction[], period: AnalyticsPeriod, now: Date, currency: Currency, rates: ExchangeRates, count = 4,
): SpendingBar[] => {
  const bars: SpendingBar[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const range = resolveAnalyticsPeriod(period, periodDay(period, now, back));
    bars.push({
      start: range.currentStart,
      end: range.currentEnd,
      amount: spentBetween(transactions, range.currentStart, range.currentEnd, currency, rates),
      current: back === 0,
    });
  }
  const first = bars.findIndex(bar => bar.amount > 0 || bar.current);
  return bars.slice(first);
};

/** The average of the finished periods among the bars, or null when there are none. */
export const barsAverage = (bars: SpendingBar[]): number | null => {
  const past = bars.filter(bar => !bar.current);
  return past.length ? round(past.reduce((sum, bar) => sum + bar.amount, 0) / past.length) : null;
};

interface Side {
  amount: number;
  count: number;
  notes: Map<string, number>;
}

const emptySide = (): Side => ({ amount: 0, count: 0, notes: new Map() });

const topNotes = (side: Side | undefined, limit = 2): string[] => side
  ? [...side.notes.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([note]) => note)
  : [];

/**
 * This period up to today against the same number of days at the start of the previous one
 * (1 to 15 Nov against 1 to 15 Oct; a shorter month stops at its last day). Movers are sorted by
 * the size of the change; anything under one unit is left out.
 */
export const compareSameDays = (
  transactions: Transaction[],
  events: Event[],
  period: AnalyticsPeriod,
  now: Date,
  currency: Currency,
  rates: ExchangeRates,
  limit = 5,
): PeriodComparison => {
  const range = resolveAnalyticsPeriod(period, now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = range.currentStart;
  const dayIndex = Math.round((today.getTime() - new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate()).getTime()) / 86_400_000);
  const prev = range.previousStart;
  const sameEnd = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + dayIndex, 23, 59, 59, 999);
  const end = sameEnd.getTime() > range.previousEnd.getTime() ? range.previousEnd : sameEnd;
  const nowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const eventIds = new Set(events.map(event => event.id));
  const groups = new Map<string, { now: Side; before: Side }>();
  const collect = (start: Date, stop: Date, side: 'now' | 'before') => {
    transactions.forEach(transaction => {
      if (!isCountedExpense(transaction) || !inRange(transaction, start, stop)) return;
      const key = transaction.eventId && eventIds.has(transaction.eventId) ? `event:${transaction.eventId}` : `cat:${transaction.categoryId}`;
      const group = groups.get(key) ?? { now: emptySide(), before: emptySide() };
      const amount = getExpensePrincipal(transaction, currency, rates);
      const into = group[side];
      into.amount += amount;
      into.count += 1;
      const note = transaction.note?.trim().replace(/\s+/g, ' ');
      if (note) into.notes.set(note, (into.notes.get(note) ?? 0) + amount);
      groups.set(key, group);
    });
  };
  collect(range.currentStart, nowEnd, 'now');
  collect(range.previousStart, end, 'before');

  const movers = [...groups.entries()]
    .map(([key, group]): CompareMover => {
      const delta = round(group.now.amount - group.before.amount);
      const [kind, id] = key.startsWith('event:') ? ['event', key.slice(6)] as const : ['category', key.slice(4)] as const;
      return {
        key,
        kind,
        id,
        now: round(group.now.amount),
        before: round(group.before.amount),
        delta,
        countNow: group.now.count,
        countBefore: group.before.count,
        notes: topNotes(delta > 0 ? group.now : group.before),
      };
    })
    .filter(mover => Math.abs(mover.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);

  return {
    start: range.previousStart,
    end,
    now: spentBetween(transactions, range.currentStart, nowEnd, currency, rates),
    before: spentBetween(transactions, range.previousStart, end, currency, rates),
    movers,
  };
};
