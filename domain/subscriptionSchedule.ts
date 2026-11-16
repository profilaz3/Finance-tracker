import type { DetectedSubscription, SubscriptionCadence } from './subscriptions';

/**
 * When detected subscriptions charge next: each one's expected dates rolled forward from its
 * next expected charge, for the "Next 30 days" timeline and the "Next charges" list. Monthly,
 * quarterly and yearly charges keep their day of the month (the 31st falls on the last day of
 * shorter months).
 */

const MONTHS: Partial<Record<SubscriptionCadence, number>> = { monthly: 1, quarterly: 3, yearly: 12 };
const DAYS: Partial<Record<SubscriptionCadence, number>> = { weekly: 7, biweekly: 14 };
const DAY_MS = 86_400_000;
const MAX_STEPS = 400;

/** A yyyy-mm-dd day at local noon (clear of DST edges). */
const parseDay = (iso: string): Date => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);

/** The `n`th charge after `anchor` (n = 0 is the anchor). */
const occurrence = (anchor: Date, cadence: SubscriptionCadence, periodDays: number, n: number): Date => {
  const months = MONTHS[cadence];
  if (months) {
    const target = new Date(anchor.getFullYear(), anchor.getMonth() + months * n, 1, 12);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(anchor.getDate(), lastDay));
    return target;
  }
  const days = DAYS[cadence] ?? Math.max(1, Math.round(periodDays));
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + days * n, 12);
};

export interface UpcomingCharge {
  item: DetectedSubscription;
  date: Date;
  /** Whole days from today (0 is today). */
  inDays: number;
}

/** Every expected charge from today to `days` days ahead (inclusive), soonest first. */
export const upcomingCharges = (
  items: readonly DetectedSubscription[],
  now: Date = new Date(),
  days = 30,
): UpcomingCharge[] => {
  const today = startOfDay(now);
  const end = today.getTime() + days * DAY_MS;
  const charges: UpcomingCharge[] = [];
  items.forEach(item => {
    if (item.status !== 'active') return;
    const anchor = parseDay(item.nextDate);
    for (let n = 0; n < MAX_STEPS; n += 1) {
      const date = occurrence(anchor, item.cadence, item.periodDays, n);
      if (date.getTime() > end) break;
      if (date.getTime() >= today.getTime()) {
        charges.push({ item, date, inDays: Math.round((date.getTime() - today.getTime()) / DAY_MS) });
      }
    }
  });
  return charges.sort((a, b) => a.date.getTime() - b.date.getTime());
};

/** The next expected charge on or after today (an overdue one rolls forward). */
export const nextCharge = (item: DetectedSubscription, now: Date = new Date()): Date => {
  const today = startOfDay(now).getTime();
  const anchor = parseDay(item.nextDate);
  for (let n = 0; n < MAX_STEPS; n += 1) {
    const date = occurrence(anchor, item.cadence, item.periodDays, n);
    if (date.getTime() >= today) return date;
  }
  return anchor;
};
