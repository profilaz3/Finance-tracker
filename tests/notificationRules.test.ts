import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  diffScheduled,
  findBudgetCrossings,
  findNewSharedExpenses,
  normalizeNotificationPrefs,
  notificationId,
  planBillReminders,
  reminderTime,
  trimKnownIds,
} from '../domain/notificationRules';
import type { BudgetProgress } from '../domain/home';
import type { Event, RecurringTransaction, SharedExpense } from '../types';

// Belgrade switches to summer time on 2026-03-29 and back on 2026-10-25.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Belgrade';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

const recurring = (overrides: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: 'rent',
  name: 'Rent',
  amount: 450,
  currency: 'EUR',
  categoryId: 'c1',
  accountId: 'a1',
  type: 'expense',
  frequency: 'monthly',
  startDate: '2026-01-31',
  nextDue: '2026-02-28',
  isActive: true,
  ...overrides,
});

describe('notificationId', () => {
  it('is stable, positive and fits an Android int', () => {
    const a = notificationId('bill:rent:2026-03-01');
    expect(notificationId('bill:rent:2026-03-01')).toBe(a);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(0x7fffffff);
    expect(notificationId('bill:rent:2026-04-01')).not.toBe(a);
  });
});

describe('reminderTime', () => {
  it('goes back across month ends', () => {
    const at = reminderTime('2026-03-01', 1);
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours()]).toEqual([2026, 2, 28, 9]);
    const three = reminderTime('2027-01-02', 3);
    expect([three.getFullYear(), three.getMonth() + 1, three.getDate()]).toEqual([2026, 12, 30]);
  });

  it('keeps 9:00 local on both sides of a DST change', () => {
    const spring = reminderTime('2026-03-30', 1); // reminder on the switch day
    expect([spring.getDate(), spring.getHours()]).toEqual([29, 9]);
    const autumn = reminderTime('2026-10-26', 1);
    expect([autumn.getDate(), autumn.getHours()]).toEqual([25, 9]);
    // The night of the switch is 23 hours long, so a fixed 24h step would drift to 10:00.
    expect(spring.getTime() - reminderTime('2026-03-29', 1).getTime()).toBe(23 * 3600 * 1000);
    expect(autumn.getTime() - reminderTime('2026-10-25', 1).getTime()).toBe(25 * 3600 * 1000);
  });

  it('same-day reminders fire on the due date', () => {
    const at = reminderTime('2026-05-10', 0);
    expect([at.getMonth() + 1, at.getDate(), at.getHours()]).toEqual([5, 10, 9]);
  });
});

describe('planBillReminders', () => {
  const now = new Date(2026, 1, 20, 12, 0); // 20 Feb 2026, noon

  it('plans future occurrences with clamped month ends and stable ids', () => {
    const plan = planBillReminders([recurring()], now, 1, { horizonDays: 45 });
    expect(plan.map(item => item.dueDate)).toEqual(['2026-02-28', '2026-03-31']);
    expect(plan[0].at.getDate()).toBe(27);
    const again = planBillReminders([recurring()], now, 1, { horizonDays: 45 });
    expect(again.map(item => item.id)).toEqual(plan.map(item => item.id));
  });

  it('skips reminders already in the past, income, paused rules and ended rules', () => {
    const late = new Date(2026, 1, 27, 10, 0); // after the 9:00 reminder for the 28th
    expect(planBillReminders([recurring()], late, 1, { horizonDays: 10 }).map(item => item.dueDate)).toEqual([]);
    expect(planBillReminders([recurring({ type: 'income' })], now, 1)).toEqual([]);
    expect(planBillReminders([recurring({ isActive: false })], now, 1)).toEqual([]);
    expect(planBillReminders([recurring({ endDate: '2026-03-01' })], now, 1).map(item => item.dueDate)).toEqual(['2026-02-28']);
  });

  it('caps the number of scheduled reminders, soonest first', () => {
    const daily = recurring({ id: 'coffee', name: 'Coffee', frequency: 'daily', nextDue: '2026-02-21', startDate: '2026-02-01' });
    const plan = planBillReminders([daily, recurring()], now, 0, { max: 5 });
    expect(plan).toHaveLength(5);
    expect(plan.every((item, index) => index === 0 || item.at >= plan[index - 1].at)).toBe(true);
  });
});

describe('diffScheduled', () => {
  it('cancels stale ids and adds missing ones only', () => {
    expect(diffScheduled([1, 2, 3], [{ id: 2 }, { id: 4 }])).toEqual({ cancel: [1, 3], add: [4] });
    expect(diffScheduled([2, 4], [{ id: 2 }, { id: 4 }])).toEqual({ cancel: [], add: [] });
  });
});

const progress = (spent: number, categorySpent = 0): BudgetProgress => ({
  total: 1000,
  spent,
  left: 1000 - spent,
  spentRatio: spent / 1000,
  monthElapsed: 0.5,
  aheadOfPace: false,
  categories: [
    { categoryId: 'food', name: 'Food', color: '#000', limit: 200, spent: categorySpent, over: 0, left: 0 },
  ],
});

describe('findBudgetCrossings', () => {
  it('reports each threshold once', () => {
    const first = findBudgetCrossings(progress(820), new Set());
    expect(first.crossings.map(c => [c.scope, c.threshold])).toEqual([['total', 0.8]]);
    const again = findBudgetCrossings(progress(850), first.sent);
    expect(again.crossings).toEqual([]);
    const over = findBudgetCrossings(progress(1010), again.sent);
    expect(over.crossings.map(c => [c.scope, c.threshold])).toEqual([['total', 1]]);
    expect(findBudgetCrossings(progress(1200), over.sent).crossings).toEqual([]);
  });

  it('a jump past both thresholds reports only the higher one', () => {
    const result = findBudgetCrossings(progress(100, 250), new Set());
    expect(result.crossings).toEqual([{ scope: 'food', name: 'Food', threshold: 1, spent: 250, limit: 200 }]);
    expect(findBudgetCrossings(progress(100, 260), result.sent).crossings).toEqual([]);
  });

  it('ignores budgets without a limit', () => {
    const none: BudgetProgress = { ...progress(500), total: 0, categories: [] };
    expect(findBudgetCrossings(none, new Set()).crossings).toEqual([]);
  });
});

const event = (overrides: Partial<Event>): Event => ({
  id: 'e1',
  name: 'Bergamo',
  personIds: [],
  status: 'active',
  userId: 'me-user',
  ...overrides,
});

const expense = (id: string, eventId: string): SharedExpense => ({
  id,
  eventId,
  name: 'Dinner',
  amount: 3200,
  currency: 'RSD',
  paidBy: 'alex',
  sharedWith: ['alex', 'me'],
  date: '2026-11-13',
});

describe('findNewSharedExpenses', () => {
  const events = [
    event({ id: 'shared', sharedEmails: ['alex@example.test'] }),
    event({ id: 'private' }),
    event({ id: 'theirs', userId: 'alex-user' }),
    event({ id: 'team', teamId: 't1' }),
  ];

  it('returns unseen expenses on collaborative events only', () => {
    const expenses = [expense('x1', 'shared'), expense('x2', 'private'), expense('x3', 'theirs'), expense('x4', 'team'), expense('old', 'shared')];
    const fresh = findNewSharedExpenses(expenses, new Set(['old']), events, 'me-user');
    expect(fresh.map(entry => entry.expense.id)).toEqual(['x1', 'x3', 'x4']);
  });

  it('finds nothing when everything was seen', () => {
    expect(findNewSharedExpenses([expense('a', 'shared')], new Set(['a']), events, 'me-user')).toEqual([]);
  });
});

describe('prefs and bookkeeping', () => {
  it('normalizes saved prefs field by field', () => {
    expect(normalizeNotificationPrefs(null)).toEqual({ bills: true, budget: true, events: true, letter: true, priceIncrease: true, leadDays: 1 });
    expect(normalizeNotificationPrefs({ bills: false, leadDays: 7, events: 'yes', priceIncrease: false })).toEqual({
      bills: false,
      budget: true,
      events: true,
      letter: true,
      priceIncrease: false,
      leadDays: 1,
    });
    expect(normalizeNotificationPrefs({ leadDays: 3 }).leadDays).toBe(3);
  });

  it('keeps the newest remembered ids', () => {
    expect(trimKnownIds(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd']);
  });
});
