import { describe, expect, it } from 'vitest';
import { applyPersonBalanceUpdates, calculateAdjustedInitialBalance } from '../utils/balanceMutations';
import type { Person } from '../types';

describe('balance mutations', () => {
  it('calculates the initial balance needed to reach a desired displayed balance', () => {
    expect(calculateAdjustedInitialBalance({
      currentBalance: 150,
      currentInitialBalance: 100,
      desiredDisplayedBalance: 220,
    })).toBe(170);

    expect(calculateAdjustedInitialBalance({
      currentBalance: 40,
      currentInitialBalance: 100,
      desiredDisplayedBalance: -10,
    })).toBe(50);
  });

  it('applies person balance deltas with rounding and ignores unknown people', () => {
    const people: Person[] = [
      {
        id: 'p1',
        name: 'Marko',
        color: '#000',
        defaultCurrency: 'RSD',
        balances: { EUR: 10, USD: 0, RSD: 100 },
      },
      {
        id: 'p2',
        name: 'Ana',
        color: '#111',
        defaultCurrency: 'EUR',
        balances: { EUR: -5, USD: 1, RSD: 0 },
      },
    ];

    const updated = applyPersonBalanceUpdates(people, [
      { personId: 'p1', currency: 'RSD', delta: 2.335 },
      { personId: 'p1', currency: 'RSD', delta: -0.105 },
      { personId: 'p2', currency: 'EUR', delta: 3.111 },
      { personId: 'missing', currency: 'USD', delta: 999 },
    ]);

    expect(updated).toEqual([
      {
        ...people[0],
        balances: { EUR: 10, USD: 0, RSD: 102.24 },
      },
      {
        ...people[1],
        balances: { EUR: -1.89, USD: 1, RSD: 0 },
      },
    ]);
  });
});
