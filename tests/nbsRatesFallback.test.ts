import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';

// Rate source selection: NBS middle rate first, then the generic API, then the last cache.
// The NBS client and fetch are stubbed; no network access.

const nbsLatest = vi.fn();
vi.mock('../services/nbsRatesService', () => ({ fetchNbsLatest: () => nbsLatest() }));

const { fetchRatesWithMeta } = await import('../services/currencyService');

const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach(key => delete store[key]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  nbsLatest.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rate source selection', () => {
  it('uses the NBS middle rate when it answers and never calls the generic API', async () => {
    nbsLatest.mockResolvedValue({ listDate: '2026-11-13', listNumber: 217, source: 'nbs', rates: { EUR: 117.6203, USD: 101.5 } });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchRatesWithMeta(true);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.source).toBe('live');
    expect(result.rates).toMatchObject({ base: 'EUR', provider: 'nbs', listDate: '2026-11-13' });
    expect(result.rates.rates.RSD).toBe(117.6203);
    expect(JSON.parse(store[CONFIG.EXCHANGE_RATE_CACHE_KEY]).rates.provider).toBe('nbs');
  });

  it('falls back to the generic API when NBS is unavailable', async () => {
    nbsLatest.mockResolvedValue(null);
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ rates: { USD: 1.16, RSD: 117.4 } }) }));

    const result = await fetchRatesWithMeta(true);

    expect(result.source).toBe('live');
    expect(result.rates.provider).toBe('api');
    expect(result.rates.listDate).toBeUndefined();
    expect(result.rates.rates.RSD).toBe(117.4);
  });

  it('falls back to the generic API when the NBS client throws', async () => {
    nbsLatest.mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ rates: { USD: 1.16, RSD: 117.4 } }) }));

    expect((await fetchRatesWithMeta(true)).rates.provider).toBe('api');
  });

  it('uses the last cached table when both are down', async () => {
    store[CONFIG.EXCHANGE_RATE_CACHE_KEY] = JSON.stringify({
      rates: { base: 'EUR', date: 'x', rates: { EUR: 1, USD: 1.16, RSD: 117.6 }, provider: 'nbs', listDate: '2026-11-12' },
      timestamp: Date.now() - 5 * 3600_000,
    });
    nbsLatest.mockResolvedValue(null);
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });

    const result = await fetchRatesWithMeta();

    expect(result.source).toBe('stale-cache');
    expect(result.rates.listDate).toBe('2026-11-12');
  });

  it('serves a fresh cache without asking anyone', async () => {
    store[CONFIG.EXCHANGE_RATE_CACHE_KEY] = JSON.stringify({
      rates: { base: 'EUR', date: 'x', rates: { EUR: 1, USD: 1.16, RSD: 117.6 }, provider: 'nbs', listDate: '2026-11-13' },
      timestamp: Date.now() - 60_000,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchRatesWithMeta();

    expect(result.source).toBe('cache');
    expect(nbsLatest).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
