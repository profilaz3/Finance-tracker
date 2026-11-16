import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_HEADER,
  addStat,
  blocksShownInHeader,
  removeStat,
  resolveHomeHeader,
  shownFace,
  shownStats,
  statAmount,
  todayAllowance,
  tripToday,
  walletIdOf,
  walletStat,
  weekSpending,
  type HeaderNumbers,
} from '../domain/homeHeader';
import { parseSettingsPrefs } from '../utils/settingsPrefs';
import { buildSettingsSyncPayload } from '../utils/settingsSync';
import type { Event, ExchangeRates, HomeHeader, Transaction } from '../types';

const rates: ExchangeRates = { base: 'RSD', rates: { RSD: 1, EUR: 1 / 117, USD: 1 / 100 }, lastUpdated: 0 } as unknown as ExchangeRates;

const context = { hasBudget: true, isCurrentMonth: true, walletIds: ['bank', 'cash'] };

const event = (overrides: Partial<Event>): Event => ({
  id: 'e1',
  name: 'Lisbon',
  personIds: [],
  status: 'active',
  ...overrides,
});

const expense = (id: string, date: string, amount: number): Transaction => ({
  id,
  amount,
  currency: 'RSD',
  type: 'expense',
  categoryId: 'food',
  accountId: 'bank',
  date,
  note: '',
} as unknown as Transaction);

describe('resolveHomeHeader', () => {
  it('uses the default when nothing is stored', () => {
    expect(resolveHomeHeader(undefined)).toBe(DEFAULT_HOME_HEADER);
    expect(DEFAULT_HOME_HEADER).toEqual({ face: 'budget', stats: ['in', 'spent', 'budget'], trip: true, tone: 'accent' });
  });

  it('repairs unknown values, drops unknown and repeated numbers, keeps at most three', () => {
    const repaired = resolveHomeHeader({
      face: 'sparkles' as HomeHeader['face'],
      stats: ['in', 'nope', 'in', 'wallet:', 'wallet:bank', 'spent', 'owed'],
      tone: 'neon' as HomeHeader['tone'],
    });
    expect(repaired).toEqual({ face: 'budget', stats: ['in', 'wallet:bank', 'spent'], trip: true, tone: 'accent' });
    expect(resolveHomeHeader({ face: 'rate', stats: [], trip: false, tone: 'dark' })).toEqual({ face: 'rate', stats: [], trip: false, tone: 'dark' });
  });
});

describe('shownFace and shownStats', () => {
  it('falls back to This month without a budget, and for Today in a past month', () => {
    expect(shownFace('budget', { hasBudget: false, isCurrentMonth: true })).toBe('month');
    expect(shownFace('today', { hasBudget: true, isCurrentMonth: false })).toBe('month');
    expect(shownFace('networth', { hasBudget: false, isCurrentMonth: false })).toBe('networth');
  });

  it('swaps a number that cannot be shown for a stand-in, in place', () => {
    expect(shownStats(['in', 'budget', 'spent'], { ...context, hasBudget: false })).toEqual(['in', 'net', 'spent']);
    expect(shownStats(['wallet:gone', 'wallet:bank', 'in'], context)).toEqual(['spent', 'wallet:bank', 'in']);
    expect(shownStats(['today', 'week', 'avgDay'], { ...context, isCurrentMonth: false })).toEqual(['in', 'spent', 'avgDay']);
    expect(shownStats(['in', 'spent'], context)).toEqual(['in', 'spent']);
  });

  it('adds up to three numbers and removes them', () => {
    expect(addStat(['in', 'spent'], walletStat('bank'))).toEqual(['in', 'spent', 'wallet:bank']);
    expect(addStat(['in', 'spent', 'budget'], 'owed')).toEqual(['in', 'spent', 'budget']);
    expect(addStat(['in'], 'in')).toEqual(['in']);
    expect(removeStat(['in', 'spent'], 'in')).toEqual(['spent']);
    expect(walletIdOf('wallet:abc')).toBe('abc');
    expect(walletIdOf('in')).toBeNull();
  });

  it('reads each number', () => {
    const numbers: HeaderNumbers = {
      income: 1000, spent: 400, budgetTotal: 900, budgetLeft: 500, netWorth: 5000,
      owedToMe: 30, iOwe: 10, spentToday: 20, avgDay: 25, week: 120,
    };
    expect(statAmount('net', numbers)).toBe(600);
    expect(statAmount('left', numbers)).toBe(500);
    expect(statAmount('iOwe', numbers)).toBe(10);
    expect(statAmount('wallet:bank', numbers)).toBeNull();
  });
});

describe('tripToday', () => {
  const now = new Date(2026, 10, 15, 13, 0);

  it('counts the day of an active trip that includes today', () => {
    expect(tripToday(event({ startDate: '2026-11-12', endDate: '2026-11-17' }), now)).toMatchObject({ day: 4, days: 6 });
    expect(tripToday(event({ startDate: '2026-11-15T00:00:00.000Z' }), now)).toMatchObject({ day: 1, days: 1 });
  });

  it('ignores trips not on today, finished events and year-long events', () => {
    expect(tripToday(event({ startDate: '2026-11-16', endDate: '2026-11-20' }), now)).toBeNull();
    expect(tripToday(event({ startDate: '2026-11-01', endDate: '2026-11-14' }), now)).toBeNull();
    expect(tripToday(event({ startDate: '2026-11-12', endDate: '2026-11-17', status: 'completed' }), now)).toBeNull();
    expect(tripToday(event({ startDate: '2026-01-01', endDate: '2026-12-31' }), now)).toBeNull();
    expect(tripToday(event({}), now)).toBeNull();
    expect(tripToday(undefined, now)).toBeNull();
  });
});

describe('todayAllowance', () => {
  it('spreads what was left this morning over the days left, today included', () => {
    // 30-day month, day 15: 16 days left including today; 9,000 left before today's 200.
    const allowance = todayAllowance(20_000, 11_200, 200, 15, 30);
    expect(allowance.perDay).toBe(562.5);
    expect(allowance.left).toBe(362.5);
  });

  it('goes negative when today runs over, and never divides by zero on the last day', () => {
    expect(todayAllowance(1000, 1000, 300, 30, 30)).toEqual({ perDay: 300, left: 0 });
    expect(todayAllowance(1000, 1200, 100, 30, 30)).toEqual({ perDay: 0, left: -100 });
  });
});

describe('weekSpending', () => {
  it('sums counted spending Monday to Sunday of the week that holds today', () => {
    // Sunday 15 Nov 2026: the week is Mon 9 to Sun 15.
    const week = weekSpending({
      transactions: [
        expense('a', '2026-11-08', 999),
        expense('b', '2026-11-09', 100),
        expense('c', '2026-11-09', 50),
        expense('d', '2026-11-13', 200),
        expense('e', '2026-11-15', 30),
        expense('f', '2026-11-16', 999),
      ],
      baseCurrency: 'RSD',
      rates,
    }, new Date(2026, 10, 15, 20, 0));
    expect(week).toEqual([150, 0, 0, 0, 200, 0, 30]);
  });
});

describe('header prefs', () => {
  it('syncs the header in settings.prefs and reads it back', () => {
    const homeHeader: HomeHeader = { face: 'today', stats: ['week', 'avgDay', 'wallet:bank'], trip: false, tone: 'dark' };
    const payload = buildSettingsSyncPayload({ baseCurrency: 'RSD', language: 'sr', homeHeader, budget: null } as Parameters<typeof buildSettingsSyncPayload>[0]);
    expect(payload.prefs?.homeHeader).toEqual(homeHeader);
    expect(parseSettingsPrefs(JSON.parse(JSON.stringify(payload.prefs))).homeHeader).toEqual(homeHeader);
  });

  it('repairs a header from a newer version instead of dropping it', () => {
    expect(parseSettingsPrefs({ homeHeader: { face: 'hologram', stats: ['in'], trip: 'yes', tone: 'dark' } }).homeHeader)
      .toEqual({ face: 'budget', stats: ['in'], trip: true, tone: 'dark' });
    expect(parseSettingsPrefs({ homeHeader: 'nope' }).homeHeader).toBeUndefined();
  });
});

describe('blocks the header already shows', () => {
  it('leaves out the main number\'s own block', () => {
    expect(blocksShownInHeader('budget', ['in', 'spent', 'budget'], ['bank'])).toEqual(['budget']);
    expect(blocksShownInHeader('networth', ['in'], ['bank'])).toEqual(['networth']);
    expect(blocksShownInHeader('rate', [], [])).toEqual(['rates']);
    expect(blocksShownInHeader('trip', ['in'], ['bank'])).toEqual(['event']);
  });

  it('keeps every block for main numbers that have none of their own', () => {
    expect(blocksShownInHeader('month', ['in', 'spent', 'net'], ['bank'])).toEqual([]);
    expect(blocksShownInHeader('today', ['avgDay'], ['bank'])).toEqual([]);
    expect(blocksShownInHeader('owed', ['owed', 'iOwe'], ['bank'])).toEqual([]);
  });

  it('leaves out Wallets only when every wallet is a number in the header', () => {
    const all = [walletStat('bank'), walletStat('revolut'), walletStat('cash')];
    expect(blocksShownInHeader('networth', all, ['bank', 'revolut', 'cash'])).toEqual(['networth', 'wallets']);
    expect(blocksShownInHeader('networth', all.slice(0, 2), ['bank', 'revolut', 'cash'])).toEqual(['networth']);
    expect(blocksShownInHeader('month', [], [])).toEqual([]);
  });
});
