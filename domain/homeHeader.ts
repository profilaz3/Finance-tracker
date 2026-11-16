import type { AppState, Event, HomeBlockType, HomeHeader, HomeHeaderFace, Transaction } from '../types';
import { getCountedExpenseAmount } from './money';
import { parseLocalDate } from './home';

/** Main numbers in the order the header sheet shows them. */
export const HEADER_FACES: HomeHeaderFace[] = ['budget', 'networth', 'today', 'month', 'owed', 'rate'];

/** Numbers that can sit under the main one (wallets are added as `wallet:<id>`). */
export const HEADER_STATS = ['in', 'spent', 'budget', 'left', 'net', 'networth', 'owed', 'iOwe', 'today', 'avgDay', 'week'] as const;
export type HeaderStatKind = (typeof HEADER_STATS)[number];

export const MAX_HEADER_STATS = 3;
const WALLET_PREFIX = 'wallet:';

export const DEFAULT_HOME_HEADER: HomeHeader = { face: 'budget', stats: ['in', 'spent', 'budget'], trip: true, tone: 'accent' };

/** A trip longer than this is not a trip (a year-long shared event, say); the header ignores it. */
const MAX_TRIP_DAYS = 45;

/** Stand-ins, in order, for a chosen number that cannot be shown (no budget, a deleted wallet, a past month). */
const STAT_FALLBACKS: HeaderStatKind[] = ['in', 'spent', 'net', 'networth', 'avgDay'];

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const walletStat = (accountId: string): string => `${WALLET_PREFIX}${accountId}`;

export const walletIdOf = (stat: string): string | null =>
  stat.startsWith(WALLET_PREFIX) && stat.length > WALLET_PREFIX.length ? stat.slice(WALLET_PREFIX.length) : null;

export const isKnownStat = (stat: string): boolean =>
  (HEADER_STATS as readonly string[]).includes(stat) || walletIdOf(stat) !== null;

/** The stored header, repaired: unknown faces and tones fall back, stats are known, unique and at most three. */
export function resolveHomeHeader(stored: Partial<HomeHeader> | null | undefined): HomeHeader {
  if (!stored) return DEFAULT_HOME_HEADER;
  const face = HEADER_FACES.includes(stored.face as HomeHeaderFace) ? (stored.face as HomeHeaderFace) : DEFAULT_HOME_HEADER.face;
  const stats = Array.isArray(stored.stats)
    ? [...new Set(stored.stats.filter((stat): stat is string => typeof stat === 'string' && isKnownStat(stat)))].slice(0, MAX_HEADER_STATS)
    : DEFAULT_HOME_HEADER.stats;
  return {
    face,
    stats,
    trip: typeof stored.trip === 'boolean' ? stored.trip : DEFAULT_HOME_HEADER.trip,
    tone: stored.tone === 'dark' ? 'dark' : 'accent',
  };
}

export interface HeaderContext {
  /** A monthly budget above zero is set for the workspace. */
  hasBudget: boolean;
  isCurrentMonth: boolean;
  walletIds: readonly string[];
}

/** The face to draw: Left to spend needs a budget and Today needs the current month; both fall back to This month. */
export function shownFace(face: HomeHeaderFace, context: Pick<HeaderContext, 'hasBudget' | 'isCurrentMonth'>): HomeHeaderFace {
  if (face === 'budget' && !context.hasBudget) return 'month';
  if (face === 'today' && !context.isCurrentMonth) return 'month';
  return face;
}

export function isStatAvailable(stat: string, context: HeaderContext): boolean {
  const walletId = walletIdOf(stat);
  if (walletId) return context.walletIds.includes(walletId);
  if (stat === 'budget' || stat === 'left') return context.hasBudget;
  if (stat === 'today' || stat === 'week') return context.isCurrentMonth;
  return isKnownStat(stat);
}

/** The chosen numbers, each one that cannot be shown swapped in place for the first stand-in not already there. */
export function shownStats(stats: readonly string[], context: HeaderContext): string[] {
  const used = new Set(stats.filter(stat => isStatAvailable(stat, context)));
  const result: string[] = [];
  for (const stat of stats) {
    if (used.has(stat) && !result.includes(stat)) {
      result.push(stat);
      continue;
    }
    const standIn = STAT_FALLBACKS.find(candidate => !used.has(candidate) && isStatAvailable(candidate, context));
    if (!standIn) continue;
    used.add(standIn);
    result.push(standIn);
  }
  return result;
}

/** The block that shows the same thing as each main number; the others have no block of their own. */
const FACE_BLOCK: Partial<Record<HomeHeaderFace | 'trip', HomeBlockType>> = {
  budget: 'budget',
  networth: 'networth',
  rate: 'rates',
  trip: 'event',
};

/**
 * Blocks the header already shows, which Home leaves out so nothing appears twice: the main
 * number's own block, and Wallets when every wallet is one of the numbers under it.
 * `face` and `stats` are what is on screen (`activeFace`, `shownStats`), not the stored pick.
 */
export function blocksShownInHeader(face: HomeHeaderFace | 'trip', stats: readonly string[], walletIds: readonly string[]): HomeBlockType[] {
  const blocks: HomeBlockType[] = [];
  const own = FACE_BLOCK[face];
  if (own) blocks.push(own);
  if (walletIds.length > 0 && walletIds.every(id => stats.includes(walletStat(id)))) blocks.push('wallets');
  return blocks;
}

/** Add a number at the end (no-op when it is there or three are chosen); remove one. */
export const addStat = (stats: readonly string[], stat: string): string[] =>
  stats.includes(stat) || stats.length >= MAX_HEADER_STATS ? [...stats] : [...stats, stat];

export const removeStat = (stats: readonly string[], stat: string): string[] => stats.filter(entry => entry !== stat);

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Whole days from `a` to `b` (local days; DST-safe). */
const dayDiff = (a: Date, b: Date): number => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);

/** Event dates may be date-only or full ISO strings; both mean a local day. */
const eventDay = (value: string | undefined): Date | null => {
  if (!value) return null;
  const date = parseLocalDate(/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
};

export interface TripDay {
  /** 1-based day of the trip today. */
  day: number;
  days: number;
  end: Date;
}

/** The trip on today: an active event whose dates include today (no end date means a one-day event). */
export function tripToday(event: Event | null | undefined, now: Date = new Date()): TripDay | null {
  if (!event || event.status !== 'active') return null;
  const start = eventDay(event.startDate);
  if (!start) return null;
  const end = eventDay(event.endDate) ?? start;
  const days = dayDiff(start, end) + 1;
  if (days < 1 || days > MAX_TRIP_DAYS) return null;
  const day = dayDiff(start, now) + 1;
  if (day < 1 || day > days) return null;
  return { day, days, end };
}

/** Days of the month still to come, today included. */
export const daysLeftInMonth = (todayIndex: number, daysInMonth: number): number => Math.max(1, daysInMonth - todayIndex + 1);

export interface TodayAllowance {
  /** The budget left at the start of today, spread over the days left (today included). */
  perDay: number;
  /** What today still allows: `perDay` minus today's spending (negative when over). */
  left: number;
}

export function todayAllowance(budgetTotal: number, spent: number, spentToday: number, todayIndex: number, daysInMonth: number): TodayAllowance {
  const leftAtStart = budgetTotal - (spent - spentToday);
  const perDay = Math.max(0, leftAtStart) / daysLeftInMonth(todayIndex, daysInMonth);
  return { perDay: round2(perDay), left: round2(perDay - spentToday) };
}

/** Counted spending per day, Monday to Sunday, of the week that holds `today` (days still to come are 0). */
export function weekSpending(
  state: Pick<AppState, 'transactions' | 'baseCurrency' | 'rates'>,
  today: Date = new Date(),
): number[] {
  const monday = startOfDay(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = new Array<number>(7).fill(0);
  state.transactions.forEach((transaction: Transaction) => {
    const date = parseLocalDate(transaction.date);
    if (Number.isNaN(date.getTime())) return;
    const index = dayDiff(monday, date);
    if (index < 0 || index > 6) return;
    days[index] += getCountedExpenseAmount(transaction, state.baseCurrency, state.rates);
  });
  return days.map(round2);
}

export interface HeaderNumbers {
  income: number;
  spent: number;
  budgetTotal: number | null;
  budgetLeft: number | null;
  netWorth: number;
  owedToMe: number;
  iOwe: number;
  spentToday: number;
  /** Spending per elapsed day of the month. */
  avgDay: number;
  week: number;
}

/** A number under the main one, in the base currency; null for wallets (their own currency) and unknown keys. */
export function statAmount(stat: string, numbers: HeaderNumbers): number | null {
  switch (stat) {
    case 'in': return numbers.income;
    case 'spent': return numbers.spent;
    case 'budget': return numbers.budgetTotal;
    case 'left': return numbers.budgetLeft;
    case 'net': return round2(numbers.income - numbers.spent);
    case 'networth': return numbers.netWorth;
    case 'owed': return numbers.owedToMe;
    case 'iOwe': return numbers.iOwe;
    case 'today': return numbers.spentToday;
    case 'avgDay': return numbers.avgDay;
    case 'week': return numbers.week;
    default: return null;
  }
}
