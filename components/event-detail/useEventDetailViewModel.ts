import { useMemo } from 'react';
import type { AppState, Event, SharedExpense } from '../../types';
import type { UnifiedExpense } from './types';
import { resolveEventParticipants } from '../../utils/eventParticipants';
import { buildEventViewer, SELF_ID, type EventViewer, type ViewerPick } from '../../domain/eventViewer';

interface BuildEventDetailViewModelOptions {
  event: Event;
  state: AppState;
  /** The signed-in user's auth id (useSessionIdentity); unknown, the owner's view is shown. */
  sessionUserId?: string | null;
  /** A guest's stored answer to "Which one are you?" (domain/eventViewer). */
  pick?: ViewerPick;
}

export interface EventDetailViewModel {
  /** Who is looking: which ids are "You" and which are the organizer. */
  viewer: EventViewer;
  eventPeople: ReturnType<typeof resolveEventParticipants>;
  eventSharedExpenses: SharedExpense[];
  linkedTransactions: AppState['transactions'];
  transactionsAsSharedExpenses: SharedExpense[];
  allExpensesForSummary: SharedExpense[];
  unifiedExpenses: UnifiedExpense[];
}

const buildTransactionExpense = ({
  transaction,
  event,
  state,
  userId,
}: {
  transaction: AppState['transactions'][number];
  event: Event;
  state: AppState;
  /** Who paid: the viewer (a linked transaction is always the viewer's own spending). */
  userId: string;
}): SharedExpense => {
  const category = state.categories.find(entry => entry.id === transaction.categoryId);

  if (transaction.splitDetails) {
    const otherPersonIds = transaction.splitDetails.shares?.map(share => share.personId) || [];
    const sharedWith = [userId, ...otherPersonIds];
    const splitDetails = otherPersonIds.reduce<Record<string, number>>(
      (accumulator, personId, index) => ({
        ...accumulator,
        [personId]: transaction.splitDetails?.shares[index]?.amount || 0,
      }),
      { [userId]: transaction.splitDetails.myPortion || 0 },
    );

    return {
      id: transaction.id,
      eventId: event.id,
      name: transaction.note || category?.name || 'Expense',
      amount: transaction.splitDetails.totalAmount || transaction.amount,
      currency: transaction.currency,
      paidBy: userId,
      sharedWith,
      date: transaction.date,
      splitType: 'exact',
      splitDetails,
      category: category?.name || 'Other',
    };
  }

  return {
    id: transaction.id,
    eventId: event.id,
    name: transaction.note || category?.name || 'Expense',
    amount: transaction.amount,
    currency: transaction.currency,
    paidBy: userId,
    sharedWith: [userId],
    date: transaction.date,
    splitType: 'equal',
    category: category?.name || 'Other',
  };
};

export const buildEventDetailViewModel = ({
  event,
  state,
  sessionUserId,
  pick,
}: BuildEventDetailViewModelOptions): EventDetailViewModel => {
  const eventSharedExpenses = (state.sharedExpenses || []).filter(expense => expense.eventId === event.id);
  const eventPeople = resolveEventParticipants({
    event,
    people: state.people || [],
    userProfile: state.userProfile,
    fallbackCurrency: state.baseCurrency,
    viewerUserId: sessionUserId,
  });
  const viewer = buildEventViewer({
    event,
    sessionUserId,
    userProfileId: state.userProfile?.id,
    pick,
    participantIds: eventPeople.map(person => person.id),
    people: state.people || [],
  });
  const linkedTransactions = (state.transactions || []).filter(transaction => transaction.eventId === event.id);

  // A guest's own transactions are paid by the participant they said they are. Not listed, they
  // stay keyed by the guest's own profile (or sign-in id), never by the organizer's 'self'.
  const payerId = viewer.isGuest
    ? viewer.viewerId ?? state.userProfile?.id ?? sessionUserId ?? 'viewer'
    : state.userProfile?.id || SELF_ID;
  const transactionsAsSharedExpenses = linkedTransactions
    .filter(transaction => transaction.type === 'expense')
    .map(transaction => buildTransactionExpense({ transaction, event, state, userId: payerId }));

  const allExpensesForSummary = [...eventSharedExpenses, ...transactionsAsSharedExpenses];

  const unifiedExpenses: UnifiedExpense[] = [
    ...linkedTransactions.map(transaction => ({
      type: 'transaction' as const,
      data: transaction,
      date: new Date(transaction.date),
    })),
    ...eventSharedExpenses.map(expense => ({
      type: 'sharedExpense' as const,
      data: expense,
      date: new Date(expense.date),
    })),
  ].sort((left, right) => right.date.getTime() - left.date.getTime());

  return {
    viewer,
    eventPeople,
    eventSharedExpenses,
    linkedTransactions,
    transactionsAsSharedExpenses,
    allExpensesForSummary,
    unifiedExpenses,
  };
};

export const useEventDetailViewModel = ({ event, state, sessionUserId, pick }: BuildEventDetailViewModelOptions): EventDetailViewModel => (
  useMemo(
    () => buildEventDetailViewModel({ event, state, sessionUserId, pick }),
    [event, state, sessionUserId, pick],
  )
);
