import { convertAmount } from '../services/currencyService';
import type { Currency, Event, EventDebt, ExchangeRates, SharedExpense } from '../types';
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

export interface EventSettlementOptions {
  /** Net everything in this currency (requires `rates`); otherwise settle each currency separately. */
  currency?: Currency;
  rates?: ExchangeRates;
}

type CentBalances = Map<string, number>;

const addCents = (balances: CentBalances, personId: string, cents: number) => {
  balances.set(personId, (balances.get(personId) ?? 0) + cents);
};

/** Equal shares in integer cents; the payer (then list order) absorbs the extra cents. */
const splitEqualCents = (totalCents: number, participantIds: string[], payerId: string): Map<string, number> => {
  const ordered = [...participantIds].sort((left, right) => Number(right === payerId) - Number(left === payerId));
  const base = Math.floor(totalCents / ordered.length);
  const remainder = totalCents - base * ordered.length;
  return new Map(ordered.map((personId, index) => [personId, base + (index < remainder ? 1 : 0)]));
};

const greedySettle = (balances: CentBalances, currency: Currency): EventDebt[] => {
  const debtors = [...balances.entries()].filter(([, cents]) => cents <= -1).map(([id, cents]) => ({ id, cents: -cents }));
  const creditors = [...balances.entries()].filter(([, cents]) => cents >= 1).map(([id, cents]) => ({ id, cents }));
  debtors.sort((left, right) => right.cents - left.cents || left.id.localeCompare(right.id));
  creditors.sort((left, right) => right.cents - left.cents || left.id.localeCompare(right.id));

  const debts: EventDebt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i].cents, creditors[j].cents);
    if (cents >= 1) {
      debts.push({ from: debtors[i].id, to: creditors[j].id, amount: cents / 100, currency });
    }
    debtors[i].cents -= cents;
    creditors[j].cents -= cents;
    if (debtors[i].cents < 1) i++;
    if (creditors[j].cents < 1) j++;
  }
  return debts;
};

/**
 * Who owes whom for an event. Balances are keyed by person id (participants
 * missing from `people` are kept), computed in integer cents, and every debt
 * of at least one cent is returned. With `currency` + `rates`, all currencies
 * are netted into one balance per person before simplifying.
 */
export const calculateEventSettlement = (
  expenses: SharedExpense[],
  options: EventSettlementOptions = {},
): EventDebt[] => {
  const byCurrency = new Map<Currency, CentBalances>();

  expenses.forEach(expense => {
    const { paidBy, amount, currency, sharedWith, splitType, splitDetails } = expense;
    if (!sharedWith || sharedWith.length === 0) return;

    const shares = splitType === 'exact' && splitDetails
      ? new Map(sharedWith.map(personId => [personId, Math.round((splitDetails[personId] || 0) * 100)]))
      : splitEqualCents(Math.round(amount * 100), sharedWith, paidBy);

    const balances = byCurrency.get(currency) ?? new Map<string, number>();
    byCurrency.set(currency, balances);

    // The payer is owed everything consumed (their own share nets out below).
    let consumedCents = 0;
    shares.forEach((cents, personId) => {
      addCents(balances, personId, -cents);
      consumedCents += cents;
    });
    addCents(balances, paidBy, consumedCents);
  });

  const { currency: target, rates } = options;
  if (!target || !rates) {
    return [...byCurrency.entries()].flatMap(([currency, balances]) => greedySettle(balances, currency));
  }

  const netted: CentBalances = new Map();
  byCurrency.forEach((balances, currency) => {
    balances.forEach((cents, personId) => {
      addCents(netted, personId, Math.round(convertAmount(cents / 100, currency, target, rates) * 100));
    });
  });

  // Conversion rounding can leave a cent of imbalance; absorb it in the largest balance.
  const drift = [...netted.values()].reduce((sum, cents) => sum + cents, 0);
  if (drift !== 0 && netted.size > 0) {
    const [largestId] = [...netted.entries()].sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))[0];
    addCents(netted, largestId, -drift);
  }

  return greedySettle(netted, target);
};
