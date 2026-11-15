import { Person, Currency, Transaction, Category, Account, SplitMode, SplitMethod, SplitShare, Event, ExchangeRates } from '../../types';

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
    /** 'self' (I paid: "I paid" mode) or a person id ("Someone paid for me" mode). */
    payerId: string;
    /** Amount per participant, keyed by 'self' or person id; sums to `amount`. */
    amounts: Record<string, number>;
}

export interface Recipient {
    personId: string; // 'self' for user, or person.id
    name: string;
    amount: number;
    isIncluded: boolean;
}

export interface ModeToggleProps {
    mode: SplitMode;
    setMode: (mode: SplitMode) => void;
    language: 'en' | 'sr';
}

export interface CommonFieldsProps {
    mode: SplitMode;
    amount: number | undefined;
    /** Parsed amount (undefined while empty or unreadable) and the raw text. */
    onAmountChange: (amount: number | undefined, text: string) => void;
    /** Text is present but cannot be read as an amount. */
    amountInvalid: boolean;
    currency: Currency;
    setCurrency: (val: Currency) => void;
    transactionDate: string;
    setTransactionDate: (val: string) => void;
    /** Fees in USD (always stored in USD). */
    fees: number | undefined;
    onFeesChange: (amount: number | undefined, text: string) => void;
    feesInvalid: boolean;
    /** The fees converted into the split currency, added to the total. */
    feesInSplitCurrency: number;
    note: string;
    setNote: (val: string) => void;
    categoryId: string;
    setCategoryId: (val: string) => void;
    accountId: string;
    setAccountId: (val: string) => void;
    categories: Category[];
    accounts: Account[];
    language: 'en' | 'sr';
    t: Record<string, string>;
}

export interface IPaidSectionProps {
    splitMethod: SplitMethod;
    setSplitMethod: (method: SplitMethod) => void;
    shares: SplitShare[];
    /** Total to split, fees included. */
    totalToSplit: number;
    currency: Currency;
    people: Person[];
    language: 'en' | 'sr';
    t: Record<string, string>;
    togglePersonIncluded: (personId: string) => void;
    updateShareAmount: (personId: string, amount: number | undefined, text: string) => void;
    updateSharePercentage: (personId: string, percentage: number | undefined, text: string) => void;
    /** Share fields whose text cannot be read (keyed by person id). */
    invalidShares: Record<string, boolean>;
    remainingAmount: number;
    remainingPercentage: number;
    includedCount: number;
    yourPortionPreview: number;
}

export interface TheyPaidSectionProps {
    people: Person[];
    payerId: string;
    setPayerId: (id: string) => void;
    availableRecipients: Recipient[];
    includedRecipients: Recipient[];
    recipientTotal: number;
    toggleRecipient: (personId: string) => void;
    updateRecipientAmount: (personId: string, amount: number | undefined, text: string) => void;
    /** Amount fields whose text cannot be read (keyed by person id). */
    invalidRecipients: Record<string, boolean>;
    currency: Currency;
    language: 'en' | 'sr';
    getPerson: (id: string) => Person | undefined;
}
