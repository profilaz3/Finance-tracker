import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EventDebtSummary } from '../components/EventDebtSummary';
import { calculateEventSettlement } from '../domain/events';
import { resolveEventParticipants } from '../utils/eventParticipants';
import type { Event, ExchangeRates, Person, SharedExpense } from '../types';

// M13 regression tests (inverted audit proof tests).

const person = (id: string, name = id): Person => ({
  id, name, color: '#000', defaultCurrency: 'EUR', balances: { EUR: 0, USD: 0, RSD: 0 },
});

const expense = (overrides: Partial<SharedExpense>): SharedExpense => ({
  id: 'x', eventId: 'e', name: 'Dinner', amount: 0, currency: 'EUR', paidBy: 'a', sharedWith: [], date: '2026-01-01',
  ...overrides,
});

const rates: ExchangeRates = { base: 'EUR', date: '2026-01-01', rates: { EUR: 1, USD: 1, RSD: 100 } };

describe('calculateEventSettlement', () => {
  it('keeps debts to participants missing from people', () => {
    const debts = calculateEventSettlement([
      expense({ amount: 90, paidBy: 'me', sharedWith: ['me', 'p-not-in-event', 'p2-not-in-event'] }),
    ]);
    expect(debts).toEqual(expect.arrayContaining([
      { from: 'p-not-in-event', to: 'me', amount: 30, currency: 'EUR' },
      { from: 'p2-not-in-event', to: 'me', amount: 30, currency: 'EUR' },
    ]));

    const html = renderToStaticMarkup(createElement(EventDebtSummary, {
      expenses: [expense({ amount: 90, paidBy: 'me', sharedWith: ['me', 'p-not-in-event', 'p2-not-in-event'] })],
      people: [person('me', 'Me')],
      baseCurrency: 'EUR',
    }));
    expect(html).toContain('Who Owes Who');
    expect((html.match(/font-bold text-primary/g) || []).length).toBe(2);
    expect(html).toContain('Unknown');
  });

  it('shows one-cent debts and splits the remainder exactly', () => {
    expect(calculateEventSettlement([expense({ amount: 0.02, paidBy: 'a', sharedWith: ['a', 'b'] })]))
      .toEqual([{ from: 'b', to: 'a', amount: 0.01, currency: 'EUR' }]);

    const debts = calculateEventSettlement([expense({ amount: 100, paidBy: 'a', sharedWith: ['a', 'b', 'c'] })]);
    expect(debts.reduce((sum, debt) => sum + Math.round(debt.amount * 100), 0)).toBe(6666);
    expect(debts.map(debt => debt.amount)).toEqual([33.33, 33.33]);
  });

  it('nets balances across currencies into the summary currency', () => {
    const debts = calculateEventSettlement([
      expense({ id: '1', amount: 20, currency: 'EUR', paidBy: 'a', sharedWith: ['a', 'b'] }),
      expense({ id: '2', amount: 1000, currency: 'RSD', paidBy: 'b', sharedWith: ['a', 'b'] }),
    ], { currency: 'EUR', rates });
    expect(debts).toEqual([{ from: 'b', to: 'a', amount: 5, currency: 'EUR' }]);
  });

  it('simplifies chains of debts', () => {
    const debts = calculateEventSettlement([
      expense({ id: '1', amount: 10, paidBy: 'a', sharedWith: ['b'] }),
      expense({ id: '2', amount: 10, paidBy: 'b', sharedWith: ['c'] }),
    ]);
    expect(debts).toEqual([{ from: 'c', to: 'a', amount: 10, currency: 'EUR' }]);
  });
});

describe('resolveEventParticipants in a collaborator view', () => {
  it('labels the organizer instead of reusing an invitee email name', () => {
    const event: Event = {
      id: 'e', name: 'Trip', personIds: ['alice-auth-id', 'bob-local-person'], sharedEmails: ['carol@x.com'],
      status: 'active', userId: 'alice-auth-id',
    };
    const participants = resolveEventParticipants({
      event, people: [], userProfile: person('carol-auth-id', 'Carol'), fallbackCurrency: 'EUR',
    });

    expect(participants.find(p => p.id === 'alice-auth-id')!.name).toBe('Organizer');
    expect(participants.find(p => p.id === 'bob-local-person')!.name).toBe('Guest 1');
    expect(participants.some(p => p.name === 'Carol')).toBe(false);
  });
});
