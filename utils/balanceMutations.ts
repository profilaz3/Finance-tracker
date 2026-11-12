import type { Currency, Person } from '../types';

const round2 = (value: number) => Math.round(value * 100) / 100;

export const calculateAdjustedInitialBalance = ({
  currentBalance,
  currentInitialBalance,
  desiredDisplayedBalance,
}: {
  currentBalance: number;
  currentInitialBalance: number;
  desiredDisplayedBalance: number;
}): number => {
  const transactionImpact = currentBalance - currentInitialBalance;
  return round2(desiredDisplayedBalance - transactionImpact);
};

export const applyPersonBalanceUpdates = (
  people: Person[],
  updates: { personId: string; currency: Currency; delta: number }[]
): Person[] => {
  if (updates.length === 0) {
    return people;
  }

  return people.map(person => {
    const personUpdates = updates.filter(update => update.personId === person.id);
    if (personUpdates.length === 0) {
      return person;
    }

    const balances = { ...person.balances };
    for (const update of personUpdates) {
      balances[update.currency] = round2((balances[update.currency] || 0) + update.delta);
    }

    return {
      ...person,
      balances,
    };
  });
};

