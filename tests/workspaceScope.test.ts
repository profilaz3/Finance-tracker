import { describe, expect, it } from 'vitest';
import { resolveWorkspaceId, scopeStateToWorkspace, withAccountTeam, withWorkspaceTeam } from '../domain/teams';

type Row = { id: string; teamId?: string | null };
const slices: { accounts: Row[]; transactions: Row[]; events: Row[]; recurringTransactions: Row[]; categories: Row[]; people: Row[]; language: string } = {
  accounts: [{ id: 'a1' }, { id: 'a2', teamId: 'T' }, { id: 'a3', teamId: 'U' }],
  transactions: [{ id: 't1' }, { id: 't2', teamId: 'T' }],
  events: [{ id: 'e1', teamId: 'T' }],
  recurringTransactions: [{ id: 'r1' }],
  categories: [{ id: 'c1' }, { id: 'c2', teamId: 'T' }, { id: 'c3', teamId: 'U' }],
  people: [{ id: 'p1' }, { id: 'p2', teamId: 'U' }],
  language: 'en',
};

describe('scopeStateToWorkspace', () => {
  it('shows only personal rows in the personal workspace', () => {
    const scoped = scopeStateToWorkspace(slices, null);
    expect(scoped.accounts.map(a => a.id)).toEqual(['a1']);
    expect(scoped.transactions.map(a => a.id)).toEqual(['t1']);
    expect(scoped.events).toEqual([]);
    expect(scoped.categories.map(a => a.id)).toEqual(['c1']);
    expect(scoped.people.map(a => a.id)).toEqual(['p1']);
    expect(scoped.language).toBe('en');
  });

  it('shows team rows plus personal categories and people in a team workspace', () => {
    const scoped = scopeStateToWorkspace(slices, 'T');
    expect(scoped.accounts.map(a => a.id)).toEqual(['a2']);
    expect(scoped.transactions.map(a => a.id)).toEqual(['t2']);
    expect(scoped.events.map(a => a.id)).toEqual(['e1']);
    expect(scoped.recurringTransactions).toEqual([]);
    expect(scoped.categories.map(a => a.id)).toEqual(['c1', 'c2']);
    expect(scoped.people.map(a => a.id)).toEqual(['p1']);
  });
});

describe('workspace stamping', () => {
  it('puts new items in the active team only when they do not name one', () => {
    expect(withWorkspaceTeam<Row>({ id: 'x' }, 'T')).toEqual({ id: 'x', teamId: 'T' });
    expect(withWorkspaceTeam<Row>({ id: 'x', teamId: null }, 'T')).toEqual({ id: 'x', teamId: null });
    expect(withWorkspaceTeam<Row>({ id: 'x' }, null)).toEqual({ id: 'x' });
  });

  it('files a transaction under its wallet team', () => {
    const accounts = [{ id: 'a1' }, { id: 'a2', teamId: 'T' }];
    expect(withAccountTeam({ accountId: 'a2' }, accounts)).toEqual({ accountId: 'a2', teamId: 'T' });
    expect(withAccountTeam({ accountId: 'a1' }, accounts)).toEqual({ accountId: 'a1' });
    expect(withAccountTeam({ accountId: 'a2', teamId: null }, accounts)).toEqual({ accountId: 'a2', teamId: null });
  });

  it('falls back to personal when the stored team is gone', () => {
    expect(resolveWorkspaceId('T', undefined)).toBe('T');
    expect(resolveWorkspaceId('T', [{ id: 'T' }])).toBe('T');
    expect(resolveWorkspaceId('T', [])).toBeNull();
    expect(resolveWorkspaceId(null, [{ id: 'T' }])).toBeNull();
  });
});
