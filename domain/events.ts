import type { Event, EventDebt, SharedExpense } from '../types';
import { planSettlement, type SettlementPlanOptions } from './settle';
import { addSharedEmailToEvent } from '../utils/eventParticipants';

export const addEventToCollection = (events: Event[], event: Event): Event[] => [
  ...events,
  event,
];

export const upsertEventInCollection = (
  events: Event[],
  id: string,
  updates: Partial<Event>
): { events: Event[]; updatedEvent: Event | undefined } => {
  const existingEvent = events.find(event => event.id === id);
  if (!existingEvent) {
    return { events, updatedEvent: undefined };
  }

  const updatedEvent = { ...existingEvent, ...updates };
  return {
    updatedEvent,
    events: events.map(event => event.id === id ? updatedEvent : event),
  };
};

export const deleteEventFromCollection = (events: Event[], id: string): Event[] =>
  events.filter(event => event.id !== id);

export const shareEventInCollection = (
  events: Event[],
  id: string,
  email: string
): { events: Event[]; updatedEvent: Event | undefined } => {
  const existingEvent = events.find(event => event.id === id);
  if (!existingEvent) {
    return { events, updatedEvent: undefined };
  }

  const updatedEvent = addSharedEmailToEvent(existingEvent, email);
  return {
    updatedEvent,
    events: events.map(event => event.id === id ? updatedEvent : event),
  };
};

export const upsertSharedExpenseInCollection = (
  expenses: SharedExpense[],
  expense: SharedExpense
): { expenses: SharedExpense[]; isUpdate: boolean } => {
  const isUpdate = expenses.some(existingExpense => existingExpense.id === expense.id);

  if (isUpdate) {
    return {
      isUpdate: true,
      expenses: expenses.map(existingExpense => existingExpense.id === expense.id ? expense : existingExpense),
    };
  }

  return {
    isUpdate: false,
    expenses: [...expenses, expense],
  };
};

export const deleteSharedExpenseFromCollection = (expenses: SharedExpense[], id: string): SharedExpense[] =>
  expenses.filter(expense => expense.id !== id);

export type EventSettlementOptions = SettlementPlanOptions;

/**
 * Who owes whom for an event. Balances are keyed by person id (participants
 * missing from `people` are kept) and computed in integer cents; recorded
 * settlements reduce them. With `currency` + `rates`, all currencies are netted
 * into one balance per person before simplifying. See domain/settle.ts.
 */
export const calculateEventSettlement = (
  expenses: SharedExpense[],
  options: EventSettlementOptions = {},
): EventDebt[] => planSettlement(expenses, options);
