import { ExchangeRates, Currency } from '../types';
import { DEFAULT_RATES } from '../constants';
import { CONFIG } from '../config';
import { safeGet, safeSet } from '../utils/safeStorage';

const API_URL = CONFIG.EXCHANGE_RATE_API_URL;
const CACHE_KEY = CONFIG.EXCHANGE_RATE_CACHE_KEY;
const CACHE_DURATION_MS = CONFIG.EXCHANGE_RATE_CACHE_DURATION_MS;

interface CachedRates {
    rates: ExchangeRates;
    timestamp: number;
}

const getCachedRates = (): ExchangeRates | null => {
    const cached = safeGet<CachedRates | null>(CACHE_KEY, null);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > CACHE_DURATION_MS;
    return isExpired ? null : cached.rates;
};

const setCachedRates = (rates: ExchangeRates): void => {
    safeSet(CACHE_KEY, { rates, timestamp: Date.now() } satisfies CachedRates);
};

export const fetchRates = async (forceRefresh = false): Promise<ExchangeRates> => {
    // Check cache first unless force refresh is requested
    if (!forceRefresh) {
        const cached = getCachedRates();
        if (cached) return cached;
    }

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        const rates = data.rates;

        const exchangeRates: ExchangeRates = {
            base: 'EUR',
            date: new Date().toISOString(),
            rates: {
                EUR: 1,
                USD: rates.USD || DEFAULT_RATES.rates.USD,
                RSD: rates.RSD || DEFAULT_RATES.rates.RSD,
            }
        };

        // Cache the successful response
        setCachedRates(exchangeRates);

        return exchangeRates;
    } catch (error) {
        console.warn('Failed to fetch live rates, using defaults/cached', error);

        // Try to return stale cache if available
        const staleCache = getCachedRates();
        return staleCache || DEFAULT_RATES;
    }
};

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
