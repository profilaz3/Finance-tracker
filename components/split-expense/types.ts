import type { Account, AppState, Category, Currency, Event, ExchangeRates, HomeHeaderTone, Person, Transaction } from '../../types';

export interface SplitExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSplit: (result: {
        transactions: Transaction[];
        balanceUpdates: { personId: string; currency: Currency; delta: number }[];
    }) => void;
    people: Person[];
    /** The user's own profile; it is the built-in "me", so it is not listed again as a person. */
    userProfile?: Person;
    categories: Category[];
    accounts: Account[];
    baseCurrency: Currency;
    language: 'en' | 'sr';
    // Optional: pre-fill from existing transaction
    transaction?: Transaction;
    // Events for pre-selecting participants
    events?: Event[];
    // Active event linking
    activeEvent?: Event;
    linkToActiveEvent?: boolean;
    // Toast notifications
    onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
    rates: ExchangeRates;
    /** Opens prefilled with exact per-person amounts, e.g. from splitting a scanned receipt. */
    prefill?: SplitPrefill;
    /** People picked before the form opened ("Split this bill" chips): split `transaction` evenly with them. */
    preselect?: string[];
    /** The Home header colour (Settings > Header), used for the form's top. */
    headerTone?: HomeHeaderTone;
    /** The workspace's state, for the card that shows the event after the split. */
    appState?: AppState;
    /** Adds someone to People from the form's "New person" tile. */
    onAddPerson?: (name: string) => Promise<void>;
}

/** Exact split amounts worked out elsewhere (components/receipt-scan/SplitAssign.tsx). */
export interface SplitPrefill {
    amount: number;
    currency: Currency;
    categoryId: string;
    accountId: string;
    date: string;
    note: string;
    receiptData?: Transaction['receiptData'];
    /** 'self' (I paid) or the id of the person who paid. */
    payerId: string;
    /** Amount per participant, keyed by 'self' or person id; sums to `amount`. */
    amounts: Record<string, number>;
}
