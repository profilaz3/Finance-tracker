import { ExchangeRates, Currency } from '../types';
import { DEFAULT_RATES } from '../constants';
import { CONFIG } from '../config';
import { safeGet, safeSet } from '../utils/safeStorage';

const API_URL = CONFIG.EXCHANGE_RATE_API_URL;
const CACHE_KEY = CONFIG.EXCHANGE_RATE_CACHE_KEY;
const CACHE_DURATION_MS = CONFIG.EXCHANGE_RATE_CACHE_DURATION_MS;
const SUPPORTED_CURRENCIES: Currency[] = ['EUR', 'USD', 'RSD'];

interface CachedRates {
    rates: ExchangeRates;
    timestamp: number;
}

/** Where a rate table came from: fresh API, fresh cache, expired cache, or built-in defaults. */
export type RatesSource = 'live' | 'cache' | 'stale-cache' | 'default';

export interface RatesResult {
    rates: ExchangeRates;
    source: RatesSource;
    /** When the rates were fetched from the API (ms epoch); null for built-in defaults. */
    updatedAt: number | null;
    /** True when the rates are older than the cache duration or are defaults. */
    isStale: boolean;
}

const isUsableRate = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
);

/**
 * Re-expresses a rate table against EUR. Rate tables are only meaningful
 * together with their base: DEFAULT_RATES is RSD-based (RSD: 1), so copying
 * its RSD entry into an EUR-based table would claim 1 EUR = 1 RSD.
 */
const rebaseToEur = (table: ExchangeRates): Partial<Record<Currency, number>> => {
    const eurRate = table.rates.EUR;
    if (!isUsableRate(eurRate)) return {};
    const rebased: Partial<Record<Currency, number>> = {};
    SUPPORTED_CURRENCIES.forEach(currency => {
        const rate = table.rates[currency];
        if (isUsableRate(rate)) rebased[currency] = rate / eurRate;
    });
    return rebased;
};

const isValidTable = (table: ExchangeRates | undefined | null): table is ExchangeRates => (
    !!table
    && SUPPORTED_CURRENCIES.includes(table.base)
    && !!table.rates
    && SUPPORTED_CURRENCIES.every(currency => isUsableRate(table.rates[currency]))
);

const readCache = (): CachedRates | null => {
    const cached = safeGet<CachedRates | null>(CACHE_KEY, null);
    if (!cached || typeof cached.timestamp !== 'number' || !isValidTable(cached.rates)) return null;
    return cached;
};

const setCachedRates = (rates: ExchangeRates, timestamp: number): void => {
    safeSet(CACHE_KEY, { rates, timestamp } satisfies CachedRates);
};

const fromCache = (cached: CachedRates, now: number): RatesResult => {
    const isStale = now - cached.timestamp > CACHE_DURATION_MS;
    return {
        rates: cached.rates,
        source: isStale ? 'stale-cache' : 'cache',
        updatedAt: cached.timestamp,
        isStale,
    };
};

/**
 * Fetches EUR-based rates. Currencies the API omits are filled from the last
 * cached table (rebased to EUR), then from the defaults (rebased to EUR).
 * When the API is unreachable, the last cached table is used whatever its
 * age (with its own base), and only without any cache the built-in defaults.
 */
export const fetchRatesWithMeta = async (forceRefresh = false): Promise<RatesResult> => {
    const now = Date.now();
    const cached = readCache();

    if (!forceRefresh && cached && now - cached.timestamp <= CACHE_DURATION_MS) {
        return fromCache(cached, now);
    }

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const apiRates: Record<string, unknown> = data?.rates ?? {};

        const cachedEur = cached ? rebaseToEur(cached.rates) : {};
        const defaultEur = rebaseToEur(DEFAULT_RATES);
        const pick = (currency: Currency): number => {
            const live = apiRates[currency];
            if (isUsableRate(live)) return live;
            return cachedEur[currency] ?? defaultEur[currency] ?? 1;
        };

        const exchangeRates: ExchangeRates = {
            base: 'EUR',
            date: new Date(now).toISOString(),
            rates: {
                EUR: 1,
                USD: pick('USD'),
                RSD: pick('RSD'),
            },
        };

        setCachedRates(exchangeRates, now);
        return { rates: exchangeRates, source: 'live', updatedAt: now, isStale: false };
    } catch (error) {
        console.warn('Failed to fetch live rates, using cached/default rates', error);
        if (cached) return fromCache(cached, now);
        return { rates: DEFAULT_RATES, source: 'default', updatedAt: null, isStale: true };
    }
};

export const fetchRates = async (forceRefresh = false): Promise<ExchangeRates> => (
    (await fetchRatesWithMeta(forceRefresh)).rates
);

export const convertAmount = (
  amount: number,
  from: Currency,
  to: Currency,
  rates: ExchangeRates
): number => {
  if (from === to) return amount;

  const fromRate = rates.rates[from];
  const toRate = rates.rates[to];

  if (!fromRate || !toRate || fromRate === 0 || toRate === 0) return amount;

  // Convert to Base (EUR) then to Target with proper decimal handling
  const inBase = parseFloat((amount / fromRate).toFixed(10));
  return parseFloat((inBase * toRate).toFixed(2));
};
