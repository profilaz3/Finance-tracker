import { describe, expect, it } from 'vitest';
import {
  collectReferencedPersonIds,
  normalizeRemotePersonRecord,
  normalizeUserProfileId,
} from '../utils/remotePeople';

describe('collectReferencedPersonIds', () => {
  it('collects unique person ids from remote state records', () => {
    const ids = collectReferencedPersonIds({
      transactions: [
        {
          person_id: 'person-1',
          split_details: {
            shares: [
              { personId: 'person-2' },
              { personId: 'person-3' },
            ],
          },
        },
        {
          person_id: 'person-1',
          split_details: null,
        },
      ],
      events: [
        {
          person_ids: ['person-3', 'person-4'],
        },
      ],
      sharedExpenses: [
        {
          paid_by: 'person-5',
          shared_with: ['person-2', 'person-6'],
        },
      ],
    });

    expect(ids).toEqual([
      'person-1',
      'person-2',
      'person-3',
      'person-4',
      'person-5',
      'person-6',
    ]);
  });

  it('ignores empty and missing ids', () => {
    const ids = collectReferencedPersonIds({
      transactions: [
        {
          person_id: null,
          split_details: {
            shares: [
              { personId: '' },
              { personId: undefined },
            ],
          },
        },
      ],
      events: [
        {
          person_ids: [null, '', undefined],
        },
      ],
      sharedExpenses: [
        {
          paid_by: undefined,
          shared_with: [null, ''],
        },
      ],
    });

    expect(ids).toEqual([]);
  });
});

describe('normalizeUserProfileId', () => {
  it('replaces the legacy placeholder with the authenticated user id', () => {
    expect(normalizeUserProfileId('user-profile', 'auth-user-1')).toBe('auth-user-1');
  });

  it('preserves real stored ids', () => {
    expect(normalizeUserProfileId('person-1', 'auth-user-1')).toBe('person-1');
  });
});

describe('normalizeRemotePersonRecord', () => {
  it('maps remote rows to the app person shape without database-only fields', () => {
    expect(normalizeRemotePersonRecord({
      id: 'person-1',
      name: 'Judie',
      avatar: 'https://example.com/avatar.png',
      color: '#fff',
      default_currency: 'RSD',
      defaultCurrency: 'USD',
      balances: { RSD: 12 },
      user_id: 'user-1',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    })).toEqual({
      id: 'person-1',
      name: 'Judie',
      avatar: 'https://example.com/avatar.png',
      color: '#fff',
      defaultCurrency: 'RSD',
      balances: { RSD: 12, EUR: 0, USD: 0 },
    });
  });
});
