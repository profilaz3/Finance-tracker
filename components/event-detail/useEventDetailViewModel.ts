import { useMemo } from 'react';
import type { AppState, Event, SharedExpense } from '../../types';
import type { UnifiedExpense } from './types';
import { resolveEventParticipants } from '../../utils/eventParticipants';

interface BuildEventDetailViewModelOptions {
  event: Event;
  state: AppState;
}

export interface EventDetailViewModel {
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
}: {
  transaction: AppState['transactions'][number];
  event: Event;
  state: AppState;
}): SharedExpense => {
  const category = state.categories.find(entry => entry.id === transaction.categoryId);
  const userId = state.userProfile?.id || '';

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
}: BuildEventDetailViewModelOptions): EventDetailViewModel => {
  const eventSharedExpenses = (state.sharedExpenses || []).filter(expense => expense.eventId === event.id);
  const eventPeople = resolveEventParticipants({
    event,
    people: state.people || [],
    userProfile: state.userProfile,
    fallbackCurrency: state.baseCurrency,
  });
  const linkedTransactions = (state.transactions || []).filter(transaction => transaction.eventId === event.id);

  const transactionsAsSharedExpenses = linkedTransactions
    .filter(transaction => transaction.type === 'expense')
    .map(transaction => buildTransactionExpense({ transaction, event, state }));

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
    eventPeople,
    eventSharedExpenses,
    linkedTransactions,
    transactionsAsSharedExpenses,
    allExpensesForSummary,
    unifiedExpenses,
  };
};

export const useEventDetailViewModel = ({ event, state }: BuildEventDetailViewModelOptions): EventDetailViewModel => (
  useMemo(
    () => buildEventDetailViewModel({ event, state }),
    [event, state],
  )
);
