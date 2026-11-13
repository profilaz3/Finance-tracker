import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('../config', () => ({
  CONFIG: { SUPABASE_URL: 'http://localhost', SUPABASE_ANON_KEY: 'anon' },
}));
vi.mock('../services/runtimeServices', () => ({
  getSupabaseService: async () => ({ client: { functions: { invoke } } }),
}));

const { classifyAiStatus, generateInsights, subscribeAiErrors } = await import('../services/aiService');

const httpError = (status: number, body: unknown) => ({
  context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
});

describe('AI error reporting', () => {
  const seen: unknown[] = [];
  let unsubscribe: () => void;

  beforeEach(() => {
    seen.length = 0;
    invoke.mockReset();
    unsubscribe = subscribeAiErrors(info => seen.push(info));
  });
  afterEach(() => unsubscribe());

  it('classifies statuses', () => {
    expect(classifyAiStatus(429)).toBe('quota');
    expect(classifyAiStatus(503)).toBe('unavailable');
    expect(classifyAiStatus(502)).toBe('unavailable');
    expect(classifyAiStatus(413)).toBe('rejected');
    expect(classifyAiStatus(undefined)).toBe('network');
    expect(classifyAiStatus(500)).toBe('unknown');
  });

  it('reports the daily limit with the server message and still resolves to null', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(429, { error: 'Daily AI limit reached. Try again tomorrow.' }) });
    await expect(generateInsights([], [], 'weekly', 'EUR', 'en')).resolves.toBeNull();
    expect(seen).toEqual([
      { fn: 'generate-insights', kind: 'quota', status: 429, message: 'Daily AI limit reached. Try again tomorrow.' },
    ]);
  });

  it('reports network failures and invalid payloads', async () => {
    invoke.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await generateInsights([], [], 'weekly', 'EUR', 'en');
    invoke.mockResolvedValueOnce({ data: { data: '' }, error: null });
    await generateInsights([], [], 'weekly', 'EUR', 'en');
    expect(seen).toEqual([
      { fn: 'generate-insights', kind: 'network' },
      { fn: 'generate-insights', kind: 'rejected' },
    ]);
  });

  it('emits nothing on success', async () => {
    invoke.mockResolvedValue({ data: { data: '## Report' }, error: null });
    await expect(generateInsights([], [], 'weekly', 'EUR', 'en')).resolves.toBe('## Report');
    expect(seen).toEqual([]);
  });
});
