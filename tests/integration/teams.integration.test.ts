/**
 * Team row-level security checks against a local Supabase stack seeded by supabase/seed.sql.
 * Skipped unless SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY are set (see rls.integration.test.ts).
 *
 * Runs alongside rls.integration.test.ts, so it never puts accounts, people or
 * events into a team the seeded guest belongs to (that suite asserts exactly
 * what the guest sees), and it removes everything it creates.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const PASSWORD = 'CiPassword123';
const OWNER_EMAIL = 'ci-owner@example.test';
const GUEST_EMAIL = 'ci-guest@example.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_ID = '22222222-2222-4222-8222-222222222222';

const newClient = () =>
  createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });

const signedIn = async (email: string, password = PASSWORD): Promise<SupabaseClient> => {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
};

const signedUp = async (email: string): Promise<SupabaseClient> => {
  const client = newClient();
  const { error } = await client.auth.signUp({ email, password: 'TeamTester12345' });
  if (error) throw error;
  return client;
};

describe.skipIf(!url || !anonKey)('team row-level security (local Supabase)', () => {
  const stamp = Date.now();
  const txId = `team-tx-${stamp}`;
  const txAdminId = `team-tx-admin-${stamp}`;
  const categoryId = `team-cat-${stamp}`;
  const outsiderEmail = `team-outsider-${stamp}@example.test`;
  const tripMateEmail = `team-mate-${stamp}@example.test`;

  let owner: SupabaseClient;
  let guest: SupabaseClient;
  let outsider: SupabaseClient;
  let tripMate: SupabaseClient;
  let teamId: string;
  let tripTeamId: string | undefined;
  let tripEventId: string | undefined;

  const txRow = (id: string) => ({
    id,
    user_id: OWNER_ID,
    date: '2026-11-13T10:00:00Z',
    amount: 12.5,
    currency: 'EUR',
    category_id: 'ci-cat-food',
    account_id: 'ci-acc-cash',
    type: 'expense',
    note: 'team groceries',
  });

  beforeAll(async () => {
    owner = await signedIn(OWNER_EMAIL);
    guest = await signedIn(GUEST_EMAIL);
    outsider = await signedUp(outsiderEmail);
    tripMate = await signedUp(tripMateEmail);
  });

  afterAll(async () => {
    if (!owner) return;
    await owner.from('transactions').delete().in('id', [txId, txAdminId]);
    await owner.from('categories').delete().eq('id', categoryId);
    if (tripEventId) await owner.from('events').delete().eq('id', tripEventId);
    const teamIds = [teamId, tripTeamId].filter((id): id is string => !!id);
    if (teamIds.length > 0) await owner.from('teams').delete().in('id', teamIds);
  });

  it('creates a team with the creator as owner member', async () => {
    const { data, error } = await owner.from('teams').insert({ name: `Household ${stamp}` }).select('id, owner_id').single();
    expect(error).toBeNull();
    teamId = data!.id;
    expect(data!.owner_id).toBe(OWNER_ID);

    const { data: members } = await owner.from('team_members').select('email, user_id, role').eq('team_id', teamId);
    expect(members).toEqual([{ email: OWNER_EMAIL, user_id: OWNER_ID, role: 'owner' }]);
  });

  it('rejects oversized team names and malformed invite emails', async () => {
    const longName = await owner.from('teams').insert({ name: 'x'.repeat(81) });
    expect(longName.error?.code).toBe('23514');

    const badEmail = await owner.from('team_members').insert({ team_id: teamId, email: 'not-an-email', role: 'member' });
    expect(badEmail.error?.code).toBe('23514');
  });

  it('lets the owner invite the guest by email (stored lower-cased)', async () => {
    const { data, error } = await owner
      .from('team_members')
      .insert({ team_id: teamId, email: '  CI-Guest@Example.test ', role: 'member' })
      .select('email, role, user_id')
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ email: GUEST_EMAIL, role: 'member', user_id: null });

    const { data: teams } = await guest.from('teams').select('id').eq('id', teamId);
    expect(teams).toHaveLength(1);
  });

  it('shares a team transaction and category with members only', async () => {
    const created = await owner.from('transactions').insert({ ...txRow(txId), team_id: teamId });
    expect(created.error).toBeNull();
    const category = await owner.from('categories').insert({
      id: categoryId, user_id: OWNER_ID, name: 'Team food', type: 'expense', color: '#f97316', team_id: teamId,
    });
    expect(category.error).toBeNull();

    const { data: guestTx } = await guest.from('transactions').select('id, team_id').eq('id', txId);
    expect(guestTx).toEqual([{ id: txId, team_id: teamId }]);
    const { data: guestCategory } = await guest.from('categories').select('id').eq('id', categoryId);
    expect(guestCategory).toHaveLength(1);

    // The guest's own seeded data is untouched: personal owner rows stay hidden.
    const { data: personal } = await guest.from('transactions').select('id').eq('id', 'ci-tx-1');
    expect(personal).toEqual([]);

    for (const table of ['teams', 'team_members', 'transactions', 'categories'] as const) {
      const { data } = await outsider.from(table).select('*');
      expect(data, table).toEqual([]);
    }
  });

  it('lets a member edit a team transaction without taking ownership', async () => {
    const update = await guest.from('transactions').update({ note: 'edited by guest' }).eq('id', txId).select('id');
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(1);

    // The app upserts with the signed-in user's id; ownership must stay with the creator.
    const upsert = await guest.from('transactions').upsert({ ...txRow(txId), user_id: GUEST_ID, note: 'upserted by guest' });
    expect(upsert.error).toBeNull();

    const { data } = await owner.from('transactions').select('user_id, note, team_id').eq('id', txId).single();
    expect(data).toEqual({ user_id: OWNER_ID, note: 'upserted by guest', team_id: teamId });
  });

  it('does not let a member delete a team transaction or move it out of the team', async () => {
    await guest.from('transactions').delete().eq('id', txId);
    const { data: still } = await owner.from('transactions').select('id').eq('id', txId);
    expect(still).toHaveLength(1);

    const detach = await guest.from('transactions').update({ team_id: null }).eq('id', txId);
    expect(detach.error).not.toBeNull();
  });

  it('keeps non-members out of team writes', async () => {
    const insert = await outsider.from('transactions').insert({
      ...txRow(`team-tx-outsider-${stamp}`),
      user_id: (await outsider.auth.getUser()).data.user!.id,
      team_id: teamId,
    });
    expect(insert.error?.code).toBe('42501');

    const update = await outsider.from('transactions').update({ note: 'hijack' }).eq('id', txId).select('id');
    expect(update.data ?? []).toEqual([]);

    const join = await outsider.from('team_members').insert({ team_id: teamId, email: outsiderEmail, role: 'member' });
    expect(join.error).not.toBeNull();
  });

  it('does not let a member escalate roles or invite people', async () => {
    const promote = await guest.from('team_members').update({ role: 'admin' }).eq('team_id', teamId).eq('email', GUEST_EMAIL).select('role');
    expect(promote.data ?? []).toEqual([]);

    const invite = await guest.from('team_members').insert({ team_id: teamId, email: outsiderEmail, role: 'member' });
    expect(invite.error).not.toBeNull();

    const takeover = await guest.from('teams').update({ name: 'Mine now' }).eq('id', teamId).select('id');
    expect(takeover.data ?? []).toEqual([]);

    const { data } = await owner.from('team_members').select('role').eq('team_id', teamId).eq('email', GUEST_EMAIL).single();
    expect(data?.role).toBe('member');
  });

  it('does not let the owner leave or hand out ownership', async () => {
    const leave = await owner.from('team_members').delete().eq('team_id', teamId).eq('email', OWNER_EMAIL);
    expect(leave.error?.code).toBe('42501');

    const secondOwner = await owner.from('team_members').update({ role: 'owner' }).eq('team_id', teamId).eq('email', GUEST_EMAIL);
    expect(secondOwner.error).not.toBeNull();

    const moveTeam = await owner.from('teams').update({ owner_id: GUEST_ID }).eq('id', teamId);
    expect(moveTeam.error).not.toBeNull();
  });

  it('lets an admin delete team items but not grant admin', async () => {
    const promote = await owner.from('team_members').update({ role: 'admin' }).eq('team_id', teamId).eq('email', GUEST_EMAIL).select('role');
    expect(promote.error).toBeNull();
    expect(promote.data).toEqual([{ role: 'admin' }]);

    const created = await owner.from('transactions').insert({ ...txRow(txAdminId), team_id: teamId });
    expect(created.error).toBeNull();
    const removed = await guest.from('transactions').delete().eq('id', txAdminId).select('id');
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);

    const grant = await guest.from('team_members').insert({ team_id: teamId, email: outsiderEmail, role: 'admin' });
    expect(grant.error?.code).toBe('42501');

    const rename = await guest.from('teams').update({ name: `Household renamed ${stamp}` }).eq('id', teamId).select('id');
    expect(rename.data).toHaveLength(1);
  });

  it('lets a member leave and lose access', async () => {
    const leave = await guest.from('team_members').delete().eq('team_id', teamId).eq('email', GUEST_EMAIL).select('email');
    expect(leave.error).toBeNull();
    expect(leave.data).toHaveLength(1);

    const { data } = await guest.from('transactions').select('id').eq('id', txId);
    expect(data).toEqual([]);
    const { data: teams } = await guest.from('teams').select('id').eq('id', teamId);
    expect(teams).toEqual([]);
  });

  it('shares team events and their expenses with team members', async () => {
    const team = await owner.from('teams').insert({ name: `Trip ${stamp}` }).select('id').single();
    expect(team.error).toBeNull();
    tripTeamId = team.data!.id;
    const invite = await owner.from('team_members').insert({ team_id: tripTeamId, email: tripMateEmail });
    expect(invite.error).toBeNull();

    const event = await owner
      .from('events')
      .insert({ user_id: OWNER_ID, name: `Team trip ${stamp}`, status: 'active', team_id: tripTeamId })
      .select('id')
      .single();
    expect(event.error).toBeNull();
    tripEventId = event.data!.id;
    const expense = await owner.from('shared_expenses').insert({
      event_id: tripEventId, name: 'Fuel', amount: 40, currency: 'EUR', paid_by: 'ci-person-me', shared_with: ['ci-person-me'],
    });
    expect(expense.error).toBeNull();

    const { data: mateEvents } = await tripMate.from('events').select('id').eq('id', tripEventId);
    expect(mateEvents).toHaveLength(1);
    const { data: mateExpenses } = await tripMate.from('shared_expenses').select('name').eq('event_id', tripEventId);
    expect(mateExpenses).toEqual([{ name: 'Fuel' }]);

    // A member cannot re-share the event by email or delete it.
    const reshare = await tripMate.from('events').update({ shared_emails: [outsiderEmail] }).eq('id', tripEventId);
    expect(reshare.error).not.toBeNull();
    await tripMate.from('events').delete().eq('id', tripEventId);
    const { data: kept } = await owner.from('events').select('id').eq('id', tripEventId);
    expect(kept).toHaveLength(1);

    const { data: guestEvents } = await guest.from('events').select('id').eq('id', tripEventId);
    expect(guestEvents).toEqual([]);
  });

  it('keeps items with their creator when the owner deletes the team', async () => {
    const removed = await owner.from('teams').delete().eq('id', teamId).select('id');
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);

    const { data } = await owner.from('transactions').select('user_id, team_id').eq('id', txId).single();
    expect(data).toEqual({ user_id: OWNER_ID, team_id: null });
  });
});
