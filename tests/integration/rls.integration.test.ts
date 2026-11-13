/**
 * Row-level security checks against a local Supabase stack seeded by supabase/seed.sql.
 * Skipped unless SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY are set, e.g.:
 *   supabase start && SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=<anon> npm run test:integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const PASSWORD = 'CiPassword123';
const OWNER_EMAIL = 'ci-owner@example.test';
const GUEST_EMAIL = 'ci-guest@example.test';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';

const newClient = () =>
  createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });

const signedIn = async (email: string): Promise<SupabaseClient> => {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
};

describe.skipIf(!url || !anonKey)('row-level security (local Supabase)', () => {
  let owner: SupabaseClient;
  let guest: SupabaseClient;
  let outsider: SupabaseClient;
  const outsiderEmail = `outsider-${Date.now()}@example.test`;

  beforeAll(async () => {
    owner = await signedIn(OWNER_EMAIL);
    guest = await signedIn(GUEST_EMAIL);
    outsider = newClient();
    const { error } = await outsider.auth.signUp({ email: outsiderEmail, password: 'Outsider12345' });
    if (error) throw error;
  });

  it('denies anonymous reads of user tables', async () => {
    const { data, error } = await newClient().from('events').select('id');
    expect(error?.code === '42501' || (data ?? []).length === 0).toBe(true);
  });

  it('denies anonymous uploads to user storage', async () => {
    const { error } = await newClient()
      .storage.from('event-photos')
      .upload(`${OWNER_ID}/anon.webp`, new Blob(['x'], { type: 'image/webp' }));
    expect(error).not.toBeNull();
  });

  it('shows a shared event and only its people to the invited guest', async () => {
    const { data: events } = await guest.from('events').select('id');
    expect(events?.map((e) => e.id)).toEqual([EVENT_ID]);

    const { data: people } = await guest.from('people').select('id');
    expect(people?.map((p) => p.id).sort()).toEqual(['ci-person-alex', 'ci-person-me']);

    const { data: accounts } = await guest.from('accounts').select('id');
    expect(accounts).toEqual([]);
  });

  it('lets the guest rename the event but not take it over or re-share it', async () => {
    const rename = await guest.from('events').update({ description: 'guest edit' }).eq('id', EVENT_ID).select('id');
    expect(rename.error).toBeNull();
    expect(rename.data).toHaveLength(1);

    const takeover = await guest.from('events').update({ user_id: (await guest.auth.getUser()).data.user!.id }).eq('id', EVENT_ID);
    expect(takeover.error).not.toBeNull();

    const reshare = await guest.from('events').update({ shared_emails: [GUEST_EMAIL, 'someone@example.test'] }).eq('id', EVENT_ID);
    expect(reshare.error).not.toBeNull();
  });

  it("does not let the guest delete the owner's expenses or the event", async () => {
    const before = await owner.from('shared_expenses').select('id', { count: 'exact', head: true }).eq('event_id', EVENT_ID);

    await guest.from('shared_expenses').delete().eq('event_id', EVENT_ID);
    await guest.from('events').delete().eq('id', EVENT_ID);

    const after = await owner.from('shared_expenses').select('id', { count: 'exact', head: true }).eq('event_id', EVENT_ID);
    expect(after.count).toBe(before.count);
    const { data: event } = await owner.from('events').select('id').eq('id', EVENT_ID);
    expect(event).toHaveLength(1);
  });

  it('hides everything from an unrelated user', async () => {
    for (const table of ['events', 'people', 'shared_expenses', 'transactions', 'accounts'] as const) {
      const { data } = await outsider.from(table).select('id');
      expect(data, table).toEqual([]);
    }
  });

  it('rejects rows that break the CHECK constraints', async () => {
    const { error } = await owner.from('accounts').insert({
      id: `bad-${Date.now()}`,
      user_id: OWNER_ID,
      name: 'Bad',
      type: 'cash',
      currency: 'GBP',
      color: '#000',
    });
    expect(error?.code).toBe('23514');
  });
});
