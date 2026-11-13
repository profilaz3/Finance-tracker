import { describe, expect, it } from 'vitest';
import {
  assignableTeamRoles,
  canAssignToTeam,
  canLeaveTeam,
  canManageTeam,
  canRemoveTeamMember,
  isTeamOwner,
  itemsForTeam,
  normalizeInviteEmail,
  normalizeTeamName,
  roleLabelKey,
  shouldGenerateRecurring,
  teamRoleOf,
  teamsForUser,
} from '../domain/teams';
import { mapTeamRow, teamIdColumn, mapTransactionRow, mapRecurringTransactionRow } from '../services/supabaseMappers';
import { AppStateSchema, TransactionSchema } from '../schemas';
import { buildStateSegments, mergeStateSegments } from '../utils/statePersistence';
import { mergeRemoteState } from '../services/hydration';
import { createBaseState } from './helpers/stateFactories';
import type { Team } from '../types';

const OWNER = { userId: 'u-owner', email: 'owner@example.test' };
const ADMIN = { userId: 'u-admin', email: 'admin@example.test' };
const MEMBER = { email: 'Member@Example.test' };
const STRANGER = { userId: 'u-x', email: 'x@example.test' };

const team: Team = {
  id: 'team-1',
  name: 'Home',
  ownerId: 'u-owner',
  members: [
    { email: 'owner@example.test', userId: 'u-owner', role: 'owner' },
    { email: 'admin@example.test', role: 'admin' },
    { email: 'member@example.test', role: 'member' },
  ],
};

const otherTeam: Team = {
  id: 'team-2',
  name: 'Bergamo trip',
  ownerId: 'u-x',
  members: [
    { email: 'x@example.test', userId: 'u-x', role: 'owner' },
    { email: 'member@example.test', role: 'admin' },
  ],
};

describe('normalizeInviteEmail', () => {
  it('trims and lower-cases valid addresses', () => {
    expect(normalizeInviteEmail('  Ana.Petrovic@Example.COM ')).toBe('ana.petrovic@example.com');
  });

  it('rejects malformed or oversized addresses', () => {
    expect(normalizeInviteEmail('')).toBeNull();
    expect(normalizeInviteEmail(undefined)).toBeNull();
    expect(normalizeInviteEmail('no-at-sign.example')).toBeNull();
    expect(normalizeInviteEmail('two@@example.com')).toBeNull();
    expect(normalizeInviteEmail('spaces in@example.com')).toBeNull();
    expect(normalizeInviteEmail('missing@tld')).toBeNull();
    expect(normalizeInviteEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('normalizeTeamName', () => {
  it('collapses whitespace and enforces the length limit', () => {
    expect(normalizeTeamName('  Family   budget ')).toBe('Family budget');
    expect(() => normalizeTeamName('   ')).toThrow();
    expect(() => normalizeTeamName('x'.repeat(81))).toThrow();
    expect(normalizeTeamName('x'.repeat(80))).toHaveLength(80);
  });
});

describe('team roles and permissions', () => {
  it('resolves roles by user id or case-insensitive email', () => {
    expect(teamRoleOf(team, OWNER)).toBe('owner');
    expect(teamRoleOf(team, ADMIN)).toBe('admin');
    expect(teamRoleOf(team, MEMBER)).toBe('member');
    expect(teamRoleOf(team, STRANGER)).toBeNull();
    expect(teamRoleOf(undefined, OWNER)).toBeNull();
    expect(teamRoleOf({ ...team, members: [] }, { userId: 'u-owner' })).toBe('owner');
  });

  it('lets only owners and admins manage the team', () => {
    expect(canManageTeam(team, OWNER)).toBe(true);
    expect(canManageTeam(team, ADMIN)).toBe(true);
    expect(canManageTeam(team, MEMBER)).toBe(false);
    expect(canManageTeam(team, STRANGER)).toBe(false);
    expect(isTeamOwner(team, OWNER)).toBe(true);
    expect(isTeamOwner(team, ADMIN)).toBe(false);
  });

  it('keeps the owner from leaving', () => {
    expect(canLeaveTeam(team, OWNER)).toBe(false);
    expect(canLeaveTeam(team, ADMIN)).toBe(true);
    expect(canLeaveTeam(team, MEMBER)).toBe(true);
    expect(canLeaveTeam(team, STRANGER)).toBe(false);
  });

  it('mirrors the server rules for removing members and granting roles', () => {
    const [ownerRow, adminRow, memberRow] = team.members;
    expect(canRemoveTeamMember(team, OWNER, ownerRow)).toBe(false);
    expect(canRemoveTeamMember(team, OWNER, adminRow)).toBe(true);
    expect(canRemoveTeamMember(team, ADMIN, adminRow)).toBe(true); // leaving
    expect(canRemoveTeamMember(team, ADMIN, memberRow)).toBe(true);
    expect(canRemoveTeamMember(team, MEMBER, adminRow)).toBe(false);
    expect(canRemoveTeamMember(team, MEMBER, memberRow)).toBe(true); // leaving

    expect(assignableTeamRoles(team, OWNER)).toEqual(['admin', 'member']);
    expect(assignableTeamRoles(team, ADMIN)).toEqual(['member']);
    expect(assignableTeamRoles(team, MEMBER)).toEqual([]);
  });

  it('maps roles to translation keys', () => {
    expect(roleLabelKey('owner')).toBe('teamRoleOwner');
    expect(roleLabelKey('admin')).toBe('teamRoleAdmin');
    expect(roleLabelKey('member')).toBe('teamRoleMember');
  });
});

describe('team scoping', () => {
  it('lists the teams a user belongs to, owned first', () => {
    expect(teamsForUser([otherTeam, team], MEMBER).map(t => t.id)).toEqual(['team-2', 'team-1']);
    expect(teamsForUser([otherTeam, team], OWNER).map(t => t.id)).toEqual(['team-1']);
    expect(teamsForUser(undefined, OWNER)).toEqual([]);
  });

  it('allows assigning only to personal scope or a team the user belongs to', () => {
    expect(canAssignToTeam([team], undefined, STRANGER)).toBe(true);
    expect(canAssignToTeam([team], null, STRANGER)).toBe(true);
    expect(canAssignToTeam([team], 'team-1', MEMBER)).toBe(true);
    expect(canAssignToTeam([team], 'team-1', STRANGER)).toBe(false);
    expect(canAssignToTeam([team], 'missing', OWNER)).toBe(false);
  });

  it('splits items into personal and per-team lists', () => {
    const items = [{ id: 'a' }, { id: 'b', teamId: 'team-1' }, { id: 'c', teamId: 'team-2' }, { id: 'd', teamId: null }];
    expect(itemsForTeam(items, 'team-1').map(i => i.id)).toEqual(['b']);
    expect(itemsForTeam(items, null).map(i => i.id)).toEqual(['a', 'd']);
    expect(itemsForTeam(items, undefined).map(i => i.id)).toEqual(['a', 'd']);
  });

  it('generates team recurring rules only on the creator device', () => {
    expect(shouldGenerateRecurring({}, undefined)).toBe(true);
    expect(shouldGenerateRecurring({ teamId: 'team-1', userId: 'u-owner' }, 'u-owner')).toBe(true);
    expect(shouldGenerateRecurring({ teamId: 'team-1', userId: 'u-owner' }, 'u-admin')).toBe(false);
    expect(shouldGenerateRecurring({ teamId: 'team-1', userId: 'u-owner' }, undefined)).toBe(false);
  });
});

describe('team data layer', () => {
  it('maps team rows with ordered members', () => {
    expect(mapTeamRow({
      id: 'team-1',
      name: 'Home',
      owner_id: 'u-owner',
      color: null,
      created_at: '2026-11-13T10:00:00Z',
      team_members: [
        { email: 'zed@example.test', user_id: null, role: 'member' },
        { email: 'owner@example.test', user_id: 'u-owner', role: 'owner' },
        { email: 'admin@example.test', role: 'admin' },
      ],
    })).toEqual({
      id: 'team-1',
      name: 'Home',
      ownerId: 'u-owner',
      createdAt: '2026-11-13T10:00:00Z',
      members: [
        { email: 'owner@example.test', userId: 'u-owner', role: 'owner' },
        { email: 'admin@example.test', role: 'admin' },
        { email: 'zed@example.test', role: 'member' },
      ],
    });
  });

  it('round-trips team_id on entity rows', () => {
    const tx = mapTransactionRow({ id: 't1', team_id: 'team-1', category_id: 'c', account_id: 'a' });
    expect(tx.teamId).toBe('team-1');
    expect(mapTransactionRow({ id: 't2', team_id: null }).teamId).toBeUndefined();

    const recurring = mapRecurringTransactionRow({
      id: 'r1', name: 'Rent', amount: 1, currency: 'EUR', category_id: 'c', account_id: 'a', type: 'expense',
      frequency: 'monthly', start_date: '2026-01-01', next_due: '2026-12-01', is_active: true,
      user_id: 'u-owner', team_id: 'team-1',
    });
    expect(recurring).toMatchObject({ teamId: 'team-1', userId: 'u-owner' });

    expect(teamIdColumn('team-1')).toEqual({ team_id: 'team-1' });
    expect(teamIdColumn(null)).toEqual({ team_id: null });
    expect(teamIdColumn(undefined)).toEqual({});
  });

  it('keeps teamId and teams through schema validation and persistence', () => {
    const parsed = TransactionSchema.parse({
      id: 't1', date: '2026-11-13', amount: 1, currency: 'EUR', categoryId: 'c', accountId: 'a', type: 'expense', teamId: 'team-1',
    });
    expect(parsed.teamId).toBe('team-1');

    const state = { ...createBaseState(), teams: [team] };
    const validated = AppStateSchema.parse(state);
    expect(validated.teams).toEqual([team]);

    const legacy = AppStateSchema.parse({ ...createBaseState(), teams: undefined });
    expect(legacy.teams).toBeUndefined();

    const segments = buildStateSegments(state);
    expect(segments.teams).toEqual([team]);
    expect(mergeStateSegments(createBaseState(), segments).teams).toEqual([team]);
  });

  it('takes fetched teams from the server and keeps local teams when the fetch failed', () => {
    const prev = { ...createBaseState(), teams: [team] };
    const fetched = mergeRemoteState(prev, { state: { teams: [otherTeam] }, failedSlices: [], hasSettingsRow: false }, []);
    expect(fetched.teams).toEqual([otherTeam]);

    const failed = mergeRemoteState(prev, { state: {}, failedSlices: ['teams'], hasSettingsRow: false }, []);
    expect(failed.teams).toEqual([team]);
  });
});
