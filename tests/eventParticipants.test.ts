import { describe, expect, it } from 'vitest';
import type { Event, Person } from '../types';
import {
  addSharedEmailToEvent,
  getParticipantInitials,
  getParticipantTooltipLabel,
  isInvitedEmailPlaceholder,
  normalizeParticipantEmail,
  resolveEventParticipants,
} from '../utils/eventParticipants';

const makePerson = (overrides: Partial<Person>): Person => ({
  id: 'person-1',
  name: 'Person',
  color: '#123456',
  defaultCurrency: 'EUR',
  balances: { EUR: 0, USD: 0, RSD: 0 },
  ...overrides,
});

const makeEvent = (overrides: Partial<Event>): Event => ({
  id: 'event-1',
  name: 'Trip',
  personIds: [],
  status: 'active',
  ...overrides,
});

describe('resolveEventParticipants', () => {
  it('includes known people and creates placeholders for missing participant ids', () => {
    const participants = resolveEventParticipants({
      event: makeEvent({
        personIds: ['known-person', 'missing-person'],
        sharedEmails: ['guest@example.com'],
      }),
      people: [makePerson({ id: 'known-person', name: 'Judie' })],
      userProfile: undefined,
      fallbackCurrency: 'EUR',
    });

    expect(participants).toHaveLength(2);
    expect(participants[0]).toMatchObject({ id: 'known-person', name: 'Judie' });
    expect(participants[1]).toMatchObject({
      id: 'missing-person',
      name: 'Guest',
      color: '#9E9E9E',
      defaultCurrency: 'EUR',
    });
  });

  it('formats shared email local parts into readable placeholder names', () => {
    const participants = resolveEventParticipants({
      event: makeEvent({
        personIds: ['missing-person'],
        sharedEmails: ['john.doe_99@example.com'],
      }),
      people: [],
      userProfile: undefined,
      fallbackCurrency: 'EUR',
    });

    expect(participants[0]).toMatchObject({
      id: 'missing-person',
      name: 'John Doe 99',
    });
  });

  it('shows invited email placeholders immediately when shared emails outnumber linked people', () => {
    const participants = resolveEventParticipants({
      event: makeEvent({
        personIds: ['known-person'],
        sharedEmails: ['known@example.com', 'new.guest@example.com'],
      }),
      people: [makePerson({ id: 'known-person', name: 'Judie' })],
      userProfile: undefined,
      fallbackCurrency: 'EUR',
    });

    expect(participants).toHaveLength(2);
    expect(participants[1]).toMatchObject({
      id: 'shared-email:new.guest@example.com',
      name: 'New Guest',
    });
  });

  it('excludes the owner from linked invite counting when only the event owner id is available', () => {
    const participants = resolveEventParticipants({
      event: makeEvent({
        userId: 'owner-1',
        personIds: ['owner-1', 'guest-1'],
        sharedEmails: ['existing.guest@example.com', 'new.guest@example.com'],
      }),
      people: [makePerson({ id: 'owner-1', name: 'Owner' })],
      userProfile: undefined,
      fallbackCurrency: 'EUR',
    });

    expect(participants).toMatchObject([
      { id: 'owner-1', name: 'Owner' },
      { id: 'guest-1', name: 'Existing Guest' },
      { id: 'shared-email:new.guest@example.com', name: 'New Guest' },
    ]);
  });

  it('uses the user profile when the event references the current user id', () => {
    const userProfile = makePerson({ id: 'user-1', name: 'Nenad' });

    const participants = resolveEventParticipants({
      event: makeEvent({ personIds: ['user-1'] }),
      people: [],
      userProfile,
      fallbackCurrency: 'RSD',
    });

    expect(participants).toEqual([userProfile]);
  });

  it('falls back to numbered guest labels when emails are unavailable', () => {
    const participants = resolveEventParticipants({
      event: makeEvent({ personIds: ['missing-1', 'missing-2'] }),
      people: [],
      userProfile: undefined,
      fallbackCurrency: 'USD',
    });

    expect(participants).toMatchObject([
      { id: 'missing-1', name: 'Guest 1' },
      { id: 'missing-2', name: 'Guest 2' },
    ]);
  });
});

describe('getParticipantInitials', () => {
  it('uses the first letter from the first two words when a display name has multiple words', () => {
    expect(getParticipantInitials('John Doe 99')).toBe('JD');
  });

  it('uses the first two letters for single-word display names', () => {
    expect(getParticipantInitials('Guest')).toBe('GU');
    expect(getParticipantInitials('Joudennabb')).toBe('JO');
  });

  it('falls back safely when the label is empty', () => {
    expect(getParticipantInitials('')).toBe('?');
  });
});

describe('event participant helpers', () => {
  it('normalizes shared emails before persisting invite state', () => {
    expect(normalizeParticipantEmail('  Friend@Example.COM  ')).toBe('friend@example.com');
  });

  it('adds a normalized shared email only once when updating an event locally', () => {
    const event = addSharedEmailToEvent(
      makeEvent({ sharedEmails: ['friend@example.com'] }),
      ' Friend@Example.COM '
    );

    expect(event.sharedEmails).toEqual(['friend@example.com']);
  });

  it('labels email-only placeholders as invited guests', () => {
    const placeholder = makePerson({
      id: 'shared-email:guest@example.com',
      name: 'Guest',
    });

    expect(isInvitedEmailPlaceholder(placeholder.id)).toBe(true);
    expect(getParticipantTooltipLabel(placeholder)).toBe('Invited guest: Guest');
  });
});
