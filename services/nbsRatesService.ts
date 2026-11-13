import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import { safeGet, safeSet } from '../utils/safeStorage';
import {
  belgradeToday,
  type LatestRates,
  NBS_CURRENCIES,
  type NbsCurrency,
  type RatePoint,
  validateLatest,
  validatePoints,
} from '../utils/nbsRates';
import { mergePoints, pointsSince } from '../domain/exchangeRates';

/**
 * Client for the `nbs-rates` edge function (NBS pages do not allow browser requests).
 * History is kept on the device as one merged business-day series per currency, so switching
 * ranges is instant and only new days are fetched.
 */

const HISTORY_KEY = `${CONFIG.STORAGE_KEY}:nbs-history`;
/** Long enough for the 5Y chart; older points are dropped. */
const KEEP_DAYS = 1900;

export interface NbsHistory {
  /** Earliest day the stored series is complete from. */
  coveredFrom: string;
  /** Belgrade day of the last successful fetch. */
  fetchedDay: string;
  series: Record<NbsCurrency, RatePoint[]>;
  latest: LatestRates | null;
}

const invoke = async (body: Record<string, unknown>): Promise<unknown> => {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const supabaseService = await getSupabaseService();
    const { data, error } = await supabaseService.client.functions.invoke('nbs-rates', { body });
    if (error || !data || typeof data !== 'object') return null;
    return 'data' in data ? (data as { data: unknown }).data : data;
  } catch {
    return null;
  }
};

/** Today's official list (or the last business day's), or null when NBS and its mirror are unreachable. */
export const fetchNbsLatest = async (): Promise<LatestRates | null> => validateLatest(await invoke({ mode: 'latest' }));

const readHistory = (): NbsHistory | null => {
  const stored = safeGet<NbsHistory | null>(HISTORY_KEY, null);
  if (!stored || typeof stored.coveredFrom !== 'string' || typeof stored.fetchedDay !== 'string' || !stored.series) return null;
  const series = {} as Record<NbsCurrency, RatePoint[]>;
  for (const currency of NBS_CURRENCIES) series[currency] = validatePoints(stored.series[currency]);
  return { coveredFrom: stored.coveredFrom, fetchedDay: stored.fetchedDay, series, latest: validateLatest(stored.latest) };
};

const writeHistory = (history: NbsHistory, today: string) => {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const series = {} as Record<NbsCurrency, RatePoint[]>;
  for (const currency of NBS_CURRENCIES) series[currency] = pointsSince(history.series[currency], cutoff);
  safeSet(HISTORY_KEY, { ...history, coveredFrom: history.coveredFrom < cutoff ? cutoff : history.coveredFrom, series });
};

/** Stored history, for an instant first paint while a refresh runs. */
export const cachedNbsHistory = (): NbsHistory | null => readHistory();

export type HistoryResult = { ok: true; history: NbsHistory; fromCache: boolean } | { ok: false; history: NbsHistory | null };

/**
 * History from `from` to today. Uses the stored series when it already covers `from` and was
 * fetched today; otherwise asks only for the days it lacks.
 */
const inFlight = new Map<string, Promise<HistoryResult>>();

export const fetchNbsHistory = (from: string, now: Date = new Date()): Promise<HistoryResult> => {
  // Several views (Home trend block, the sheet) may ask at once: share one request.
  const key = `${from}:${belgradeToday(now)}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = loadHistory(from, now).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};

const loadHistory = async (from: string, now: Date): Promise<HistoryResult> => {
  const today = belgradeToday(now);
  const stored = readHistory();
  if (stored && stored.coveredFrom <= from && stored.fetchedDay === today) {
    return { ok: true, history: stored, fromCache: true };
  }
  // Already have older days: only fetch from the last stored point on.
  const lastStored = stored && stored.coveredFrom <= from
    ? NBS_CURRENCIES.map(currency => stored.series[currency].at(-1)?.[0] ?? from).sort()[0]
    : null;
  const requestFrom = lastStored && lastStored > from ? lastStored : from;
  const data = await invoke({ mode: 'history', from: requestFrom, to: today });
  if (!data || typeof data !== 'object') return { ok: false, history: stored };
  const record = data as Record<string, unknown>;
  const incoming = (record.series ?? {}) as Record<string, unknown>;
  const series = {} as Record<NbsCurrency, RatePoint[]>;
  for (const currency of NBS_CURRENCIES) {
    const fresh = validatePoints(incoming[currency]);
    series[currency] = lastStored && stored ? mergePoints(stored.series[currency], fresh) : fresh;
  }
  if (series.EUR.length === 0 && series.USD.length === 0) return { ok: false, history: stored };
  const history: NbsHistory = {
    coveredFrom: lastStored && stored ? stored.coveredFrom : from,
    fetchedDay: today,
    series,
    latest: validateLatest(record.latest) ?? stored?.latest ?? null,
  };
  writeHistory(history, today);
  return { ok: true, history, fromCache: false };
};
