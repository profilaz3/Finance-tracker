import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPermanentSyncError } from '../services/syncErrors';
import type { Event } from '../types';

type Call = { table: string; method: string; args: unknown[] };

/** A PostgREST-like query builder that records calls and answers from `responses` in order. */
const createClient = (responses: Array<{ data?: unknown; error?: unknown; status?: number }>) => {
  const calls: Call[] = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
    ['update', 'upsert', 'delete', 'select', 'eq', 'insert'].forEach(method => {
      builder[method] = record(method);
    });
    builder.maybeSingle = record('maybeSingle');
    // Awaiting the builder resolves the next canned response.
    builder.then = (resolve: (value: unknown) => void) => {
      const next = responses.shift() ?? { data: null, error: null, status: 200 };
      resolve({ data: null, error: null, status: 200, ...next });
    };
    return builder;
  };
  return { client: { from }, calls };
};

const loadService = async (userId: string, responses: Parameters<typeof createClient>[0]) => {
  vi.resetModules();
  vi.doUnmock('../services/supabaseService');
  const { SupabaseService } = await import('../services/supabaseService');
  const service = new SupabaseService();
  const { client, calls } = createClient(responses);
  (service as unknown as { _client: unknown })._client = client;
  (service as unknown as { getUser: () => Promise<unknown> }).getUser = async () => ({ id: userId });
  return { service, calls };
};

const event: Event = {
  id: 'ev-1',
  name: 'Bergamo',
  personIds: ['owner', 'p1'],
  sharedEmails: ['guest@example.test'],
  status: 'active',
  userId: 'owner',
};

describe('event sync for guests and owners', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updates a shared event in place for a guest, without owner-only columns', async () => {
    const { service, calls } = await loadService('guest', [{ data: [{ id: 'ev-1' }], status: 200 }]);
    await service.syncEvent(event);

    expect(calls.map(call => call.method)).toEqual(['update', 'eq', 'select']);
    const payload = calls[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ name: 'Bergamo', status: 'active' });
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('shared_emails');
    expect(payload).not.toHaveProperty('team_id');
  });

  it('reports a guest update that changed no rows as a permanent permission error', async () => {
    const { service } = await loadService('guest', [{ data: [], status: 200 }]);
    const error = await service.syncEvent(event).then(() => null, (reason: unknown) => reason);
    expect(error).toBeTruthy();
    expect(isPermanentSyncError(error)).toBe(true);
  });

  it('upserts the owner’s own event with their user id', async () => {
    const { service, calls } = await loadService('owner', [{ status: 201 }]);
    await service.syncEvent(event);

    expect(calls[0].method).toBe('upsert');
    expect(calls[0].args[0]).toMatchObject({ id: 'ev-1', user_id: 'owner', shared_emails: ['guest@example.test'] });
  });

  it('sends a cleared end date as null so reopening an event reaches the server', async () => {
    const { service, calls } = await loadService('owner', [{ status: 201 }]);
    await service.syncEvent({ ...event, endDate: undefined });
    expect(calls[0].args[0]).toMatchObject({ end_date: null });
  });

  it('upserts a new event that has no owner yet', async () => {
    const { service, calls } = await loadService('me', [{ status: 201 }]);
    await service.syncEvent({ ...event, userId: undefined });
    expect(calls[0].method).toBe('upsert');
    expect(calls[0].args[0]).toMatchObject({ user_id: 'me' });
  });
});

describe('deletes that RLS filters out', () => {
  it('succeeds when the row was deleted', async () => {
    const { service, calls } = await loadService('owner', [{ data: [{ id: 'ev-1' }] }]);
    await expect(service.deleteEvent('ev-1')).resolves.toBeUndefined();
    expect(calls.map(call => call.method)).toEqual(['delete', 'eq', 'select']);
  });

  it('fails permanently when nothing was deleted but the row is still there', async () => {
    const { service } = await loadService('guest', [{ data: [] }, { data: { id: 'ev-1' } }]);
    const error = await service.deleteEvent('ev-1').then(() => null, (reason: unknown) => reason);
    expect(isPermanentSyncError(error)).toBe(true);
  });

  it('treats a row that is already gone as deleted (replayed delete)', async () => {
    const { service } = await loadService('owner', [{ data: [] }, { data: null }]);
    await expect(service.deleteSharedExpense('se-1')).resolves.toBeUndefined();
  });

  it('refuses a shared expense delete the server filtered out', async () => {
    const { service } = await loadService('guest', [{ data: [] }, { data: { id: 'se-1' } }]);
    const error = await service.deleteSharedExpense('se-1').then(() => null, (reason: unknown) => reason);
    expect(isPermanentSyncError(error)).toBe(true);
  });
});
