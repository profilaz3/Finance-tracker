import { describe, expect, it } from 'vitest';
import { excludeOwnProfile } from '../domain/people';
import type { Person } from '../types';

const person = (id: string, name: string): Person => ({
  id,
  name,
  color: '#000',
  defaultCurrency: 'EUR',
  balances: { EUR: 0, USD: 0, RSD: 0 },
});

const me = person('profile-me', 'Me');
const alex = person('alex', 'Alex');
const sam = person('sam', 'Sam');

describe('excludeOwnProfile', () => {
  it('drops the user profile from a people list that contains it', () => {
    expect(excludeOwnProfile([me, alex, sam], me)).toEqual([alex, sam]);
  });

  it('returns the list unchanged without a profile or when the profile is not listed', () => {
    const people = [alex, sam];
    expect(excludeOwnProfile(people, undefined)).toBe(people);
    expect(excludeOwnProfile(people, null)).toBe(people);
    expect(excludeOwnProfile(people, me)).toEqual([alex, sam]);
  });

  it('keeps the profile when existing data already references it', () => {
    expect(excludeOwnProfile([me, alex], me, ['alex', 'profile-me'])).toEqual([me, alex]);
    expect(excludeOwnProfile([me, alex], me, ['alex'])).toEqual([alex]);
  });
});
