import { Account, Category, Currency, Person, Transaction } from '../types';
import { resolveRepaymentCategory } from './money';

interface BuildPersonInput {
  createId: () => string;
  name: string;
  defaultCurrency: Currency;
  color: string;
  avatar?: string;
}

interface BuildUserProfileInput {
  profileId: string;
  name: string;
  defaultCurrency: Currency;
  color: string;
  avatar?: string;
}

interface BuildSettlementDraftInput {
  createId: () => string;
  person: Person;
  currency: Currency;
  categories: Category[];
  defaultAccountId: string;
  settleAmount?: number;
  nowIso?: string;
}

const roundAmount = (value: number) => Math.round(value * 100) / 100;

export const buildPerson = ({
  createId,
  name,
  defaultCurrency,
  color,
  avatar,
}: BuildPersonInput): Person => ({
  id: createId(),
  name,
  defaultCurrency,
  color,
  avatar,
  balances: { [defaultCurrency]: 0 } as Record<Currency, number>,
});

export const buildUserProfile = ({
  profileId,
  name,
  defaultCurrency,
  color,
  avatar,
}: BuildUserProfileInput): Person => ({
  id: profileId,
  name,
  defaultCurrency,
  color,
  avatar,
  balances: {} as Record<Currency, number>,
});

export const updatePersonInCollection = (people: Person[], id: string, updates: Partial<Person>): Person[] =>
  people.map(person => person.id === id ? { ...person, ...updates } : person);

export const removePersonFromCollection = (people: Person[], id: string): Person[] =>
  people.filter(person => person.id !== id);

export const updatePersonBalanceInCollection = (
  people: Person[],
  personId: string,
  currency: Currency,
  newBalance: number
): { people: Person[]; updatedPerson: Person | undefined } => {
  let updatedPerson: Person | undefined;
  const nextPeople = people.map(person => {
    if (person.id !== personId) {
      return person;
    }

    updatedPerson = {
      ...person,
      balances: {
        ...person.balances,
        [currency]: roundAmount(newBalance),
      },
    };
    return updatedPerson;
  });

  return { people: nextPeople, updatedPerson };
};

export const addAccountToCollection = (accounts: Account[], account: Account): Account[] => [
  ...accounts,
  account,
];

export const removeAccountFromCollection = (accounts: Account[], id: string): Account[] =>
  accounts.filter(account => account.id !== id);

export const buildSettlementDraft = ({
  createId,
  person,
  currency,
  categories,
  defaultAccountId,
  settleAmount,
  nowIso,
}: BuildSettlementDraftInput): {
  transaction: Transaction;
  updatedPerson: Person;
  isPartial: boolean;
  /** Set when the repayment category was missing and must be added to state. */
  createdCategory: Category | null;
} | null => {
  const balance = person.balances[currency];
  if (!balance) {
    return null;
  }
  // A partial payment must be positive and cannot flip who owes whom.
  if (settleAmount !== undefined && (!(settleAmount > 0) || roundAmount(settleAmount) > roundAmount(Math.abs(balance)))) {
    return null;
  }

  const type = balance > 0 ? 'income' : 'expense';
  const amount = settleAmount !== undefined ? settleAmount : Math.abs(balance);
  const newBalance = balance > 0 ? balance - amount : balance + amount;
  // Settlements are debt movements, not income or spending: always record them
  // under the repayment categories (which analytics exclude).
  const { category, created } = resolveRepaymentCategory(categories, type);
  const isPartial = settleAmount !== undefined && settleAmount < Math.abs(balance);

  return {
    isPartial,
    createdCategory: created ? category : null,
    updatedPerson: {
      ...person,
      balances: {
        ...person.balances,
        [currency]: roundAmount(newBalance),
      },
    },
    transaction: {
      id: createId(),
      date: nowIso ?? new Date().toISOString(),
      amount,
      currency,
      categoryId: category.id,
      accountId: defaultAccountId,
      personId: person.id,
      type,
      subcategory: 'Settlement',
      note: isPartial ? `Partial settlement (${currency})` : `Settled ${currency} balance`,
    },
  };
};

/**
 * People to offer in flows that already have a built-in "me" (splitting a bill, moving money):
 * the user's own profile can also sit in the people list, so it is dropped to keep the user
 * listed once. Ids in `keepIds` stay (existing records that already reference the profile).
 */
export const excludeOwnProfile = (
  people: Person[],
  userProfile?: Pick<Person, 'id'> | null,
  keepIds: Iterable<string> = [],
): Person[] => {
  if (!userProfile?.id) return people;
  const keep = new Set(keepIds);
  if (keep.has(userProfile.id)) return people;
  return people.filter(person => person.id !== userProfile.id);
};
