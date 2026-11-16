import type { AppState, Currency, Event, Transaction } from '../../types';
import { convertAmount } from '../../services/currencyService';
import { planBalances, planSettlement, spendingExpenses } from '../../domain/settle';
import { readViewerPick } from '../../domain/eventViewer';
import { buildEventDetailViewModel } from '../event-detail/useEventDetailViewModel';

export interface EventPreviewPerson {
    id: string;
    name: string;
    amount: number;
    /** One of the ids that mean the viewer. */
    self: boolean;
    color?: string;
    image?: string;
}

export interface EventPreview {
    currency: Currency;
    /** Your balance in the event: + you are owed, − you owe. */
    mine: number;
    /** Who paid how much of the event's spending, biggest first. */
    payers: EventPreviewPerson[];
    /** The settle-up payments you are part of: `amount` > 0 comes to you, < 0 goes from you. */
    moves: EventPreviewPerson[];
}

/**
 * The event as the event screen would show it once `pending` (the split being made) is saved:
 * your balance, who paid what, and the settle-up payments that involve you. Null when the viewer
 * is not known in the event (a guest who has not said which person they are).
 */
export const eventSplitPreview = (
    event: Event,
    state: AppState,
    sessionUserId: string | null | undefined,
    pending?: Transaction,
): EventPreview | null => {
    const withPending: AppState = pending
        ? { ...state, transactions: [pending, ...state.transactions.filter(entry => entry.id !== pending.id)] }
        : state;
    const model = buildEventDetailViewModel({
        event,
        state: withPending,
        sessionUserId,
        pick: readViewerPick(sessionUserId, event.id),
    });
    const { selfIds } = model.viewer;
    const expenses = model.allExpensesForSummary;
    if (selfIds.size === 0 || expenses.length === 0) return null;

    const spending = spendingExpenses(expenses);
    // The currency most of the spending was in, like the event screen.
    const weight = new Map<Currency, number>();
    for (const expense of spending) {
        weight.set(expense.currency, (weight.get(expense.currency) ?? 0) + convertAmount(expense.amount, expense.currency, state.baseCurrency, state.rates));
    }
    const currency = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? state.baseCurrency;

    const people = new Map([...state.people, ...model.eventPeople].map(person => [person.id, person]));
    const describe = (id: string, amount: number): EventPreviewPerson => {
        const person = people.get(id);
        return { id, name: person?.name ?? '?', amount, self: selfIds.has(id), color: person?.color, image: person?.avatar };
    };

    const paid = new Map<string, number>();
    for (const expense of spending) {
        // Everything the viewer paid counts once, under one id.
        const id = selfIds.has(expense.paidBy) ? [...selfIds][0] : expense.paidBy;
        paid.set(id, (paid.get(id) ?? 0) + convertAmount(expense.amount, expense.currency, currency, state.rates));
    }
    const payers = [...paid.entries()]
        .filter(([, amount]) => amount > 0.004)
        .sort((a, b) => b[1] - a[1])
        .map(([id, amount]) => describe(id, Math.round(amount * 100) / 100));

    const debts = planSettlement(expenses, { currency, rates: state.rates });
    const balances = planBalances(debts);
    let mine = 0;
    for (const id of selfIds) mine += balances.get(id) ?? 0;

    const moves = debts
        .filter(debt => selfIds.has(debt.from) !== selfIds.has(debt.to))
        .map(debt => (selfIds.has(debt.to) ? describe(debt.from, debt.amount) : describe(debt.to, -debt.amount)))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    return { currency, mine: Math.abs(mine) < 0.005 ? 0 : Math.round(mine * 100) / 100, payers, moves };
};
