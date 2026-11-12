import { describe, expect, it } from 'vitest';
import {
  addEventToCollection,
  deleteEventFromCollection,
  deleteSharedExpenseFromCollection,
  shareEventInCollection,
  upsertEventInCollection,
  upsertSharedExpenseInCollection,
} from '../domain/events';
import type { Event, SharedExpense } from '../types';

describe('event domain helpers', () => {
  it('adds, updates, and deletes events in a collection', () => {
    const event: Event = {
      id: 'event-1',
      name: 'Trip',
      personIds: ['person-1'],
      status: 'active',
    };

    const added = addEventToCollection([], event);
    expect(added).toEqual([event]);

    const updated = upsertEventInCollection(added, 'event-1', { name: 'Bergamo Trip' });
    expect(updated.updatedEvent).toBeDefined();
    const updatedEvent = updated.updatedEvent!;
    expect(updatedEvent.name).toBe('Bergamo Trip');
    expect(updated.events[0].name).toBe('Bergamo Trip');

    const removed = deleteEventFromCollection(updated.events, 'event-1');
    expect(removed).toEqual([]);
  });

  it('normalizes shared emails and returns the updated event when sharing', () => {
    const event: Event = {
      id: 'event-1',
      name: 'Trip',
      personIds: ['person-1'],
      sharedEmails: ['owner@example.com'],
      status: 'active',
    };

    const shared = shareEventInCollection([event], 'event-1', ' Guest@Example.com ');
    expect(shared.updatedEvent).toBeDefined();
    const sharedEvent = shared.updatedEvent!;
    expect(sharedEvent.sharedEmails).toEqual(['owner@example.com', 'guest@example.com']);
    expect(shared.events[0].sharedEmails).toEqual(['owner@example.com', 'guest@example.com']);
  });

  it('upserts and deletes shared expenses', () => {
    const expense: SharedExpense = {
      id: 'expense-1',
      eventId: 'event-1',
      name: 'Dinner',
      amount: 42,
      currency: 'EUR',
      paidBy: 'person-1',
      sharedWith: ['person-2'],
      date: '2026-04-05T12:00:00.000Z',
    };

    const added = upsertSharedExpenseInCollection([], expense);
    expect(added.expenses).toEqual([expense]);
    expect(added.isUpdate).toBe(false);

    const updated = upsertSharedExpenseInCollection(added.expenses, { ...expense, amount: 55 });
    expect(updated.isUpdate).toBe(true);
    expect(updated.expenses[0].amount).toBe(55);

    const removed = deleteSharedExpenseFromCollection(updated.expenses, 'expense-1');
    expect(removed).toEqual([]);
  });
});
