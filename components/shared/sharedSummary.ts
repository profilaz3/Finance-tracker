import type { AppState, Currency, Event, ExchangeRates, Person } from '../../types';
import { convertAmount } from '../../services/currencyService';
import { planBalances, planSettlement, spendingExpenses } from '../../domain/settle';
import { readViewerPick } from '../../domain/eventViewer';
import { buildEventDetailViewModel } from '../event-detail/useEventDetailViewModel';

export interface PersonBalanceLine {
  person: Person;
  /** Everything they owe you (+) or you owe them (−), in the base currency. */
  net: number;
  /** Non-zero balances, biggest first, each in its own currency. */
  balances: Array<[Currency, number]>;
}

/** Each person with their balances (yourself left out), biggest debt either way first. */
export const personBalanceLines = (
  people: Person[],
  selfId: string | undefined,
  baseCurrency: Currency,
  rates: ExchangeRates,
): PersonBalanceLine[] =>
  people
    .filter(person => person.id !== selfId)
    .map(person => {
      const balances = (Object.entries(person.balances) as Array<[Currency, number]>)
        .filter(([, amount]) => Math.abs(amount) >= 0.005)
        .map(([currency, amount]) => ({ currency, amount, base: convertAmount(amount, currency, baseCurrency, rates) }))
        .sort((a, b) => Math.abs(b.base) - Math.abs(a.base));
      return {
        person,
        net: balances.reduce((sum, entry) => sum + entry.base, 0),
        balances: balances.map(entry => [entry.currency, entry.amount] as [Currency, number]),
      };
    });

export interface DebtTotals {
  owed: number;
  owe: number;
  owedBy: Person[];
  owing: Person[];
}

/** Owed to you and you owe, per currency converted to the base one (as Home counts them). */
export const debtTotals = (lines: PersonBalanceLine[], baseCurrency: Currency, rates: ExchangeRates): DebtTotals => {
  let owed = 0;
  let owe = 0;
  const owedBy: Array<[Person, number]> = [];
  const owing: Array<[Person, number]> = [];
  for (const line of lines) {
    let plus = 0;
    let minus = 0;
    for (const [currency, amount] of line.balances) {
      const base = convertAmount(amount, currency, baseCurrency, rates);
      if (amount > 0) plus += base;
      else minus -= base;
    }
    owed += plus;
    owe += minus;
    if (plus > 0.004) owedBy.push([line.person, plus]);
    if (minus > 0.004) owing.push([line.person, minus]);
  }
  const byAmount = (a: [Person, number], b: [Person, number]) => b[1] - a[1];
  return {
    owed,
    owe,
    owedBy: owedBy.sort(byAmount).map(([person]) => person),
    owing: owing.sort(byAmount).map(([person]) => person),
  };
};

export interface EventMoney {
  /** The currency most of the spending was in (the base currency when there is none). */
  currency: Currency;
  /** Total spending in `currency`; settlements are not spending. */
  total: number;
  /** Your balance in the event in `currency`: + you are owed, − you owe. */
  mine: number;
}

/**
 * Spending and your balance for one event, worked out like the event screen does (shared expenses
 * plus linked entries, settlements counted in the balance, your stored "Which one are you?" answer).
 */
export const eventMoney = (event: Event, state: AppState, sessionUserId: string | null | undefined): EventMoney => {
  const model = buildEventDetailViewModel({
    event,
    state,
    sessionUserId,
    pick: readViewerPick(sessionUserId, event.id),
  });
  const spending = spendingExpenses(model.allExpensesForSummary);
  const byCurrency = new Map<Currency, number>();
  for (const expense of spending) {
    byCurrency.set(expense.currency, (byCurrency.get(expense.currency) ?? 0) + convertAmount(expense.amount, expense.currency, state.baseCurrency, state.rates));
  }
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? state.baseCurrency;
  const total = spending.reduce((sum, expense) => sum + convertAmount(expense.amount, expense.currency, currency, state.rates), 0);
  let mine = 0;
  if (model.viewer.selfIds.size > 0 && model.allExpensesForSummary.length > 0) {
    const balances = planBalances(planSettlement(model.allExpensesForSummary, { currency, rates: state.rates }));
    for (const id of model.viewer.selfIds) mine += balances.get(id) ?? 0;
  }
  return { currency, total, mine: Math.abs(mine) < 0.005 ? 0 : mine };
};

export interface PersonEventBalance {
  event: Event;
  currency: Currency;
  /** What they owe you in the event (+) or you owe them (−), in `currency`. */
  amount: number;
}

/**
 * What is open between you and one person inside each event, from the same settle-up plan as
 * the event screen (in the event's main currency). Events where you are not a participant, or
 * where you two are even, are left out.
 */
export const personEventBalances = (person: Person, state: AppState, sessionUserId: string | null | undefined): PersonEventBalance[] => {
  const result: PersonEventBalance[] = [];
  for (const event of state.events) {
    if (event.status === 'archived') continue;
    const model = buildEventDetailViewModel({ event, state, sessionUserId, pick: readViewerPick(sessionUserId, event.id) });
    const { selfIds } = model.viewer;
    if (selfIds.size === 0 || selfIds.has(person.id) || !model.eventPeople.some(entry => entry.id === person.id)) continue;
    const { currency } = eventMoney(event, state, sessionUserId);
    let amount = 0;
    for (const debt of planSettlement(model.allExpensesForSummary, { currency, rates: state.rates })) {
      if (debt.from === person.id && selfIds.has(debt.to)) amount += debt.amount;
      else if (selfIds.has(debt.from) && debt.to === person.id) amount -= debt.amount;
    }
    if (Math.abs(amount) >= 0.005) result.push({ event, currency, amount });
  }
  return result;
};

/** Day `day` of `total` while a dated event is on today; null otherwise. */
export const eventDayOf = (event: Pick<Event, 'startDate' | 'endDate'>, now: Date = new Date()): { day: number; total: number } | null => {
  if (!event.startDate || !event.endDate) return null;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const total = Math.round((day(end) - day(start)) / 86_400_000) + 1;
  const index = Math.round((day(now) - day(start)) / 86_400_000) + 1;
  return index >= 1 && index <= total ? { day: index, total } : null;
};
