import { describe, expect, it } from 'vitest';
import { nextCharge, upcomingCharges } from '../domain/subscriptionSchedule';
import type { DetectedSubscription, SubscriptionCadence } from '../domain/subscriptions';

const item = (id: string, cadence: SubscriptionCadence, nextDate: string, extra: Partial<DetectedSubscription> = {}): DetectedSubscription => ({
  id,
  key: id,
  label: id.toUpperCase(),
  currency: 'RSD',
  cadence,
  periodDays: { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365 }[cadence],
  amount: 899,
  count: 4,
  firstDate: '2026-06-01',
  lastDate: '2026-10-20',
  nextDate,
  monthlyCost: 899,
  yearlyCost: 10788,
  confidence: 0.9,
  status: 'active',
  categoryId: 'subs',
  accountId: 'bank',
  transactionIds: [],
  ...extra,
});

const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const now = new Date(2026, 10, 15, 18);

describe('upcomingCharges', () => {
  it('lists charges from today to 30 days ahead, soonest first', () => {
    const charges = upcomingCharges([item('spotify', 'monthly', '2026-11-20'), item('icloud', 'monthly', '2026-11-16')], now);
    expect(charges.map(charge => [charge.item.id, day(charge.date), charge.inDays])).toEqual([
      ['icloud', '2026-11-16', 1],
      ['spotify', '2026-11-20', 5],
    ]);
  });

  it('includes a charge due today and the last day of the window', () => {
    const charges = upcomingCharges([item('a', 'monthly', '2026-11-15'), item('b', 'yearly', '2026-12-15')], now);
    expect(charges.map(charge => [charge.item.id, charge.inDays])).toEqual([['a', 0], ['a', 30], ['b', 30]]);
  });

  it('repeats weekly charges inside the window', () => {
    const charges = upcomingCharges([item('gym', 'weekly', '2026-11-17')], now);
    expect(charges.map(charge => day(charge.date))).toEqual(['2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08', '2026-12-15']);
  });

  it('rolls an overdue charge forward instead of showing it in the past', () => {
    const charges = upcomingCharges([item('news', 'monthly', '2026-10-28')], now);
    expect(charges.map(charge => day(charge.date))).toEqual(['2026-11-28']);
  });

  it('skips stopped subscriptions', () => {
    expect(upcomingCharges([item('old', 'monthly', '2026-11-20', { status: 'stopped' })], now)).toEqual([]);
  });
});

describe('nextCharge', () => {
  it('keeps the day of the month, clamped to shorter months', () => {
    const jan31 = item('rent', 'monthly', '2027-01-31');
    expect(day(nextCharge(jan31, new Date(2027, 1, 2, 9)))).toBe('2027-02-28');
    expect(day(nextCharge(jan31, new Date(2027, 2, 1, 9)))).toBe('2027-03-31');
  });

  it('returns the expected date when it is still ahead', () => {
    expect(day(nextCharge(item('spotify', 'monthly', '2026-11-20'), now))).toBe('2026-11-20');
  });

  it('rolls quarterly and biweekly charges past today', () => {
    expect(day(nextCharge(item('insurance', 'quarterly', '2026-08-10'), now))).toBe('2027-02-10');
    expect(day(nextCharge(item('cleaning', 'biweekly', '2026-11-01'), now))).toBe('2026-11-15');
  });
});
