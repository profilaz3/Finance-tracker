import { describe, expect, it } from 'vitest';
import type { Event, Person, SharedExpense } from '../types';
import {
  buildEventViewer,
  getEventOwnerIds,
  getPickableParticipants,
  isEventGuestView,
  isOwnEmailPlaceholder,
  isUsableOwnerName,
  participantName,
  readViewerPick,
  resolveOwnerName,
  viewerPickKey,
  writeViewerPick,
} from '../domain/eventViewer';
import { resolveEventParticipants } from '../utils/eventParticipants';
import { buildEventDetailViewModel } from '../components/event-detail/useEventDetailViewModel';
import { planBalances, planSettlement } from '../domain/settle';
import type { AppState } from '../types';

const OWNER = 'owner-auth';
const GUEST = 'guest-auth';

const person = (id: string, name: string): Person => ({
  id, name, color: '#000', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 },
});

// The seed's Bergamo: the owner's profile is a people row named "Me", first in personIds.
const bergamo: Event = {
  id: 'bergamo',
  name: 'Bergamo',
  personIds: ['owner-me', 'alex'],
  sharedEmails: ['guest@example.test'],
  status: 'completed',
  userId: OWNER,
};
const ownerPeople = [person('owner-me', 'Me'), person('alex', 'Alex')];

const labels = { you: 'You', organizer: 'Organizer', unknown: 'Unknown' };

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}

describe('isEventGuestView', () => {
  it('is a guest view only when the sign-in id is known and is not the owner', () => {
    expect(isEventGuestView(bergamo, GUEST)).toBe(true);
    expect(isEventGuestView(bergamo, OWNER)).toBe(false);
    expect(isEventGuestView(bergamo, null)).toBe(false);
    expect(isEventGuestView({ userId: undefined }, GUEST)).toBe(false);
  });
});

describe('getEventOwnerIds', () => {
  it('covers the literal self ids, the owner sign-in id and the profile id the form puts first', () => {
    expect(getEventOwnerIds(bergamo)).toEqual(['self', 'user-profile', OWNER, 'owner-me']);
    expect(getEventOwnerIds({ userId: OWNER, personIds: [OWNER, 'alex'] })).toEqual(['self', 'user-profile', OWNER]);
  });
});

describe('resolveOwnerName', () => {
  it('uses the organizer person name a guest can read, but not relative names like "Me"', () => {
    expect(resolveOwnerName(bergamo, ownerPeople)).toBeNull();
    expect(resolveOwnerName(bergamo, [person('owner-me', 'Nenad'), person('alex', 'Alex')])).toBe('Nenad');
    expect(resolveOwnerName({ userId: OWNER, personIds: [OWNER] }, [])).toBeNull();
    expect(isUsableOwnerName('Ja')).toBe(false);
    expect(isUsableOwnerName(' Jelena ')).toBe(true);
  });
});

describe('buildEventViewer', () => {
  it("keeps the owner's view: 'self' and the profile id are You", () => {
    const viewer = buildEventViewer({ event: bergamo, sessionUserId: OWNER, userProfileId: 'owner-me', pick: 'alex' });
    expect(viewer.isGuest).toBe(false);
    expect([...viewer.selfIds]).toEqual(['self', 'owner-me']);
    expect(viewer.viewerId).toBe('owner-me');
    expect(viewer.pick).toBeUndefined();
  });

  it('treats an unknown identity as the owner view (as before)', () => {
    const viewer = buildEventViewer({ event: bergamo, sessionUserId: null, userProfileId: undefined });
    expect(viewer.isGuest).toBe(false);
    expect(viewer.viewerId).toBe('self');
  });

  it("never makes the owner's ids You for a guest", () => {
    const viewer = buildEventViewer({ event: bergamo, sessionUserId: GUEST, userProfileId: 'self', people: ownerPeople });
    expect(viewer.isGuest).toBe(true);
    expect(viewer.selfIds.size).toBe(0);
    expect(viewer.viewerId).toBeNull();
    expect(viewer.pick).toBeUndefined();
    ['self', 'owner-me', OWNER].forEach(id => expect(viewer.ownerIds.has(id)).toBe(true));
  });

  it('follows the pick, and treats a pick that left the event (or is the owner) as unanswered', () => {
    const participantIds = ['owner-me', 'alex'];
    const alex = buildEventViewer({ event: bergamo, sessionUserId: GUEST, pick: 'alex', participantIds });
    expect([...alex.selfIds]).toEqual(['alex']);
    expect(alex.viewerId).toBe('alex');

    const notListed = buildEventViewer({ event: bergamo, sessionUserId: GUEST, pick: null, participantIds });
    expect(notListed.pick).toBeNull();
    expect(notListed.selfIds.size).toBe(0);

    expect(buildEventViewer({ event: bergamo, sessionUserId: GUEST, pick: 'sam', participantIds }).pick).toBeUndefined();
    expect(buildEventViewer({ event: bergamo, sessionUserId: GUEST, pick: 'owner-me', participantIds }).pick).toBeUndefined();
  });
});

describe('participantName', () => {
  it('labels ids from the viewer: You, person names, then the organizer', () => {
    const guest = buildEventViewer({ event: bergamo, sessionUserId: GUEST, pick: 'alex', people: ownerPeople });
    const people = resolveEventParticipants({ event: bergamo, people: ownerPeople, fallbackCurrency: 'EUR', viewerUserId: GUEST });
    expect(participantName('alex', guest, people, labels)).toBe('You');
    expect(participantName('owner-me', guest, people, labels)).toBe('Organizer');
    expect(participantName('self', guest, people, labels)).toBe('Organizer');
    expect(participantName('nobody', guest, people, labels)).toBe('Unknown');

    const named = buildEventViewer({ event: bergamo, sessionUserId: GUEST, people: [person('owner-me', 'Nenad')] });
    expect(participantName('self', named, [], labels)).toBe('Nenad');

    const owner = buildEventViewer({ event: bergamo, sessionUserId: OWNER, userProfileId: 'owner-me' });
    expect(participantName('owner-me', owner, ownerPeople, labels)).toBe('You');
    expect(participantName('alex', owner, ownerPeople, labels)).toBe('Alex');
  });
});

describe('getPickableParticipants', () => {
  it("lists everyone except the owner's self, including the guest's own invite", () => {
    const event = { ...bergamo, sharedEmails: ['guest@example.test', 'new@example.test', 'third@example.test'] };
    const people = resolveEventParticipants({ event, people: ownerPeople, fallbackCurrency: 'EUR', viewerUserId: GUEST });
    const viewer = buildEventViewer({ event, sessionUserId: GUEST });
    const options = getPickableParticipants(people, viewer).map(entry => entry.id);
    // Two invites are not linked to a person yet (three emails, one linked participant).
    expect(options).toEqual(['alex', 'shared-email:new@example.test', 'shared-email:third@example.test']);
    expect(isOwnEmailPlaceholder('shared-email:third@example.test', 'Third@Example.test')).toBe(true);
    expect(isOwnEmailPlaceholder('alex', 'third@example.test')).toBe(false);
  });
});

describe('resolveEventParticipants for a guest', () => {
  it('shows the owner profile row under the organizer name, not as "Me"', () => {
    const participants = resolveEventParticipants({
      event: bergamo,
      people: ownerPeople,
      userProfile: person('guest-profile', 'Guest'),
      fallbackCurrency: 'EUR',
      viewerUserId: GUEST,
    });
    expect(participants.map(entry => [entry.id, entry.name])).toEqual([['owner-me', 'Organizer'], ['alex', 'Alex']]);
  });

  it("keeps the owner's own view unchanged", () => {
    const participants = resolveEventParticipants({
      event: bergamo,
      people: ownerPeople.filter(entry => entry.id !== 'owner-me'),
      userProfile: person('owner-me', 'Me'),
      fallbackCurrency: 'EUR',
      viewerUserId: OWNER,
    });
    expect(participants.map(entry => [entry.id, entry.name])).toEqual([['owner-me', 'Me'], ['alex', 'Alex']]);
  });
});

describe('viewer pick store', () => {
  it('keeps one answer per sign-in user and event, null meaning "not listed"', () => {
    const storage = new MemoryStorage();
    expect(readViewerPick(GUEST, 'bergamo', storage)).toBeUndefined();
    expect(writeViewerPick(GUEST, 'bergamo', 'alex', storage)).toBe(true);
    expect(readViewerPick(GUEST, 'bergamo', storage)).toBe('alex');
    expect(readViewerPick('someone-else', 'bergamo', storage)).toBeUndefined();
    expect(readViewerPick(GUEST, 'other-event', storage)).toBeUndefined();
    expect([...storage.items.keys()]).toEqual([viewerPickKey(GUEST, 'bergamo')]);
    expect(viewerPickKey(GUEST, 'bergamo')).toBe('gemini_finance_data_v5:event-viewer:guest-auth:bergamo');

    writeViewerPick(GUEST, 'bergamo', null, storage);
    expect(readViewerPick(GUEST, 'bergamo', storage)).toBeNull();
    writeViewerPick(GUEST, 'bergamo', undefined, storage);
    expect(readViewerPick(GUEST, 'bergamo', storage)).toBeUndefined();
  });

  it('ignores garbage and survives storage that throws', () => {
    const storage = new MemoryStorage();
    storage.setItem(viewerPickKey(GUEST, 'bergamo'), '{not json');
    expect(readViewerPick(GUEST, 'bergamo', storage)).toBeUndefined();
    storage.setItem(viewerPickKey(GUEST, 'bergamo'), JSON.stringify({ personId: 42 }));
    expect(readViewerPick(GUEST, 'bergamo', storage)).toBeUndefined();

    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(readViewerPick(GUEST, 'bergamo', broken)).toBeUndefined();
    expect(writeViewerPick(GUEST, 'bergamo', 'alex', broken)).toBe(false);
    expect(writeViewerPick(null, 'bergamo', 'alex', storage)).toBe(false);
  });
});

describe('event detail for a guest', () => {
  const expenses: SharedExpense[] = [
    { id: 'train', eventId: 'bergamo', name: 'Train', amount: 48, currency: 'EUR', paidBy: 'owner-me', sharedWith: ['owner-me', 'alex'], date: '2026-10-24', splitType: 'equal' },
    { id: 'hotel', eventId: 'bergamo', name: 'Hotel', amount: 180, currency: 'EUR', paidBy: 'alex', sharedWith: ['owner-me', 'alex'], date: '2026-10-25', splitType: 'equal' },
  ];
  const state = {
    people: ownerPeople,
    // The guest has no profile yet, so the old code fell back to the owner's 'self'.
    userProfile: undefined,
    baseCurrency: 'EUR',
    sharedExpenses: expenses,
    transactions: [{ id: 'own', date: '2026-10-26', amount: 10, currency: 'EUR', categoryId: 'c', accountId: 'a', type: 'expense', eventId: 'bergamo' }],
    categories: [],
  } as unknown as AppState;

  it("balances follow the guest's pick, and their own transactions never land on the owner", () => {
    const asAlex = buildEventDetailViewModel({ event: bergamo, state, sessionUserId: GUEST, pick: 'alex' });
    expect(asAlex.viewer.viewerId).toBe('alex');
    const linked = asAlex.transactionsAsSharedExpenses[0];
    expect(linked.paidBy).toBe('alex');
    const balances = planBalances(planSettlement(asAlex.allExpensesForSummary));
    expect(balances.get('alex')).toBe(66);

    const notListed = buildEventDetailViewModel({ event: bergamo, state, sessionUserId: GUEST, pick: null });
    expect(notListed.viewer.viewerId).toBeNull();
    expect(notListed.transactionsAsSharedExpenses[0].paidBy).toBe(GUEST);
    expect(notListed.eventPeople.find(entry => entry.id === 'owner-me')?.name).toBe('Organizer');
  });
});
