const LEGACY_USER_PROFILE_ID = 'user-profile';

type RemotePersonLike = {
  id: string;
  name: string;
  avatar?: string | null;
  color: string;
  default_currency?: string | null;
  defaultCurrency?: string | null;
  balances?: Partial<Record<'EUR' | 'USD' | 'RSD', number>> | null;
  [key: string]: unknown;
};

type RemoteTransactionLike = {
  person_id?: string | null;
  split_details?: {
    shares?: Array<{
      personId?: string | null;
    }> | null;
  } | null;
};

type RemoteEventLike = {
  person_ids?: Array<string | null | undefined> | null;
};

type RemoteSharedExpenseLike = {
  paid_by?: string | null;
  shared_with?: Array<string | null | undefined> | null;
};

const isNonEmptyId = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const normalizeUserProfileId = (
  storedId: string | null | undefined,
  authenticatedUserId?: string
): string | undefined => {
  if (isNonEmptyId(storedId) && storedId !== LEGACY_USER_PROFILE_ID) {
    return storedId;
  }

  return isNonEmptyId(authenticatedUserId) ? authenticatedUserId : storedId ?? undefined;
};

export const collectReferencedPersonIds = ({
  transactions = [],
  events = [],
  sharedExpenses = [],
}: {
  transactions?: RemoteTransactionLike[];
  events?: RemoteEventLike[];
  sharedExpenses?: RemoteSharedExpenseLike[];
}): string[] => {
  const ids = new Set<string>();

  transactions.forEach(transaction => {
    if (isNonEmptyId(transaction.person_id)) {
      ids.add(transaction.person_id);
    }

    transaction.split_details?.shares?.forEach(share => {
      if (isNonEmptyId(share.personId)) {
        ids.add(share.personId);
      }
    });
  });

  events.forEach(event => {
    event.person_ids?.forEach(personId => {
      if (isNonEmptyId(personId)) {
        ids.add(personId);
      }
    });
  });

  sharedExpenses.forEach(expense => {
    if (isNonEmptyId(expense.paid_by)) {
      ids.add(expense.paid_by);
    }

    expense.shared_with?.forEach(personId => {
      if (isNonEmptyId(personId)) {
        ids.add(personId);
      }
    });
  });

  return [...ids];
};

export const normalizeRemotePersonRecord = (person: RemotePersonLike) => ({
  id: person.id,
  name: person.name,
  avatar: person.avatar ?? undefined,
  color: person.color,
  defaultCurrency: (person.default_currency ?? person.defaultCurrency ?? 'USD') as 'EUR' | 'USD' | 'RSD',
  balances: {
    EUR: person.balances?.EUR ?? 0,
    USD: person.balances?.USD ?? 0,
    RSD: person.balances?.RSD ?? 0,
  },
});

export { LEGACY_USER_PROFILE_ID };
