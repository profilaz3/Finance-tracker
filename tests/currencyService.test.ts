import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { fetchRates, fetchRatesWithMeta } from '../services/currencyService';

// These cover the generic API fallback; NBS selection is in nbsRatesFallback.test.ts.
vi.mock('../services/nbsRatesService', () => ({ fetchNbsLatest: async () => null }));

// M12: rate fallback keeps each table's own base and reports staleness.
// fetch and localStorage are stubbed; no network access.

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach(key => delete store[key]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const cacheRates = (ageMs: number) => {
  store[CONFIG.EXCHANGE_RATE_CACHE_KEY] = JSON.stringify({
    rates: { base: 'EUR', date: 'x', rates: { EUR: 1, USD: 1.1, RSD: 117.2 } },
    timestamp: Date.now() - ageMs,
  });
};

describe('fetchRates', () => {
  it('fills a currency missing from the API with an EUR-based value, not the RSD-based default', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ rates: { USD: 1.08 } }) }));
    const rates = await fetchRates(true);

    expect(rates.base).toBe('EUR');
    expect(rates.rates.USD).toBe(1.08);
    expect(rates.rates.RSD).toBeCloseTo(117.6, 0);
  });

  it('prefers the last cached rate over the defaults for a missing currency', async () => {
    cacheRates(2 * 3600_000);
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ rates: { USD: 1.08 } }) }));
    const rates = await fetchRates(true);

    expect(rates.rates.RSD).toBeCloseTo(117.2, 5);
  });

  it('uses the last cache when offline, even if it is expired, and marks it stale', async () => {
    cacheRates(2 * 3600_000);
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    const result = await fetchRatesWithMeta();

    expect(result.rates.base).toBe('EUR');
    expect(result.rates.rates.RSD).toBe(117.2);
    expect(result.source).toBe('stale-cache');
    expect(result.isStale).toBe(true);
    expect(result.updatedAt).toBeLessThan(Date.now() - 3600_000);
  });

  it('serves a fresh cache without fetching', async () => {
    cacheRates(60_000);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await fetchRatesWithMeta();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.source).toBe('cache');
    expect(result.isStale).toBe(false);
  });

  it('falls back to defaults only without any cache', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    const result = await fetchRatesWithMeta();

    expect(result.source).toBe('default');
    expect(result.updatedAt).toBeNull();
    expect(result.rates.base).toBe('RSD');
  });
});
