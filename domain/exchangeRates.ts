import type { Currency, ExchangeRates } from '../types';
import { addDays, type LatestRates, type RatePoint } from '../utils/nbsRates';

/** Chart ranges on the Exchange rates screen, in calendar days. */
export const RATE_RANGES = ['1M', '3M', '1Y', '5Y'] as const;
export type RateRange = (typeof RATE_RANGES)[number];

export const RANGE_DAYS: Record<RateRange, number> = { '1M': 31, '3M': 92, '1Y': 366, '5Y': 1827 };

export const rangeStart = (today: string, range: RateRange): string => addDays(today, -RANGE_DAYS[range]);

/**
 * The app's EUR-based rate table from NBS middle rates (RSD per EUR, RSD per USD).
 * EUR/USD is the cross of the two, as the bank computes it.
 */
export const ratesFromNbs = (latest: Pick<LatestRates, 'listDate' | 'rates'>, fetchedAt: number): ExchangeRates => ({
  base: 'EUR',
  date: new Date(fetchedAt).toISOString(),
  rates: {
    EUR: 1,
    RSD: latest.rates.EUR,
    USD: latest.rates.EUR / latest.rates.USD,
  },
  provider: 'nbs',
  listDate: latest.listDate,
});

/** RSD per one unit of `currency` from an app rate table (whatever its base). */
export const rsdPer = (rates: ExchangeRates, currency: Exclude<Currency, 'RSD'>): number => {
  const unit = rates.rates[currency];
  const rsd = rates.rates.RSD;
  return unit > 0 && rsd > 0 ? rsd / unit : 0;
};

export interface RangeStats {
  current: number;
  currentDate: string;
  /** Change vs the previous published list. */
  dayChange: number;
  dayChangePct: number;
  previousDate: string | null;
  /** Change from the first point in the range to the last. */
  rangeChange: number;
  rangeChangePct: number;
  min: { value: number; date: string };
  max: { value: number; date: string };
}

const pct = (from: number, to: number): number => (from > 0 ? ((to - from) / from) * 100 : 0);
/** Rates have 4 decimals; keep maths free of float noise like 0.00999999. */
const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

export const rangeStats = (points: readonly RatePoint[]): RangeStats | null => {
  if (points.length === 0) return null;
  const [currentDate, current] = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const first = points[0][1];
  let min = { value: points[0][1], date: points[0][0] };
  let max = { ...min };
  for (const [date, value] of points) {
    if (value < min.value) min = { value, date };
    if (value > max.value) max = { value, date };
  }
  return {
    current,
    currentDate,
    dayChange: previous ? round4(current - previous[1]) : 0,
    dayChangePct: previous ? pct(previous[1], current) : 0,
    previousDate: previous ? previous[0] : null,
    rangeChange: round4(current - first),
    rangeChangePct: pct(first, current),
    min,
    max,
  };
};

/** Points within [from, ...], keeping the list in force on `from` when it is older. */
export const pointsSince = (points: readonly RatePoint[], from: string): RatePoint[] => {
  const firstInside = points.findIndex(([date]) => date >= from);
  if (firstInside === -1) return points.length ? [points[points.length - 1]] : [];
  const start = firstInside > 0 && points[firstInside][0] > from ? firstInside - 1 : firstInside;
  return points.slice(start);
};

/**
 * At most `max` points for drawing (a 5 year series has ~1250 business days). Keeps the first and
 * last points and each bucket's extreme so peaks survive.
 */
export const downsample = (points: readonly RatePoint[], max = 260): RatePoint[] => {
  if (points.length <= max) return [...points];
  const out: RatePoint[] = [points[0]];
  const inner = points.length - 2;
  const buckets = max - 2;
  const size = inner / buckets;
  const mean = points.reduce((sum, [, value]) => sum + value, 0) / points.length;
  for (let b = 0; b < buckets; b += 1) {
    const start = 1 + Math.floor(b * size);
    const end = Math.min(points.length - 1, 1 + Math.floor((b + 1) * size));
    let pick = points[start];
    for (let i = start; i < end; i += 1) {
      if (Math.abs(points[i][1] - mean) > Math.abs(pick[1] - mean)) pick = points[i];
    }
    out.push(pick);
  }
  out.push(points[points.length - 1]);
  return out;
};

/** Merges two sorted point lists; `newer` wins on equal dates. */
export const mergePoints = (older: readonly RatePoint[], newer: readonly RatePoint[]): RatePoint[] => {
  const byDate = new Map<string, number>();
  for (const [date, value] of older) byDate.set(date, value);
  for (const [date, value] of newer) byDate.set(date, value);
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
};

/** Two-way converter at the middle rate. `rsdPerUnit` is RSD for 1 EUR or 1 USD. */
export const convertWithRate = (amount: number, rsdPerUnit: number, direction: 'toRsd' | 'fromRsd'): number => {
  if (!Number.isFinite(amount) || !(rsdPerUnit > 0)) return 0;
  const value = direction === 'toRsd' ? amount * rsdPerUnit : amount / rsdPerUnit;
  return Math.round(value * 100) / 100;
};
