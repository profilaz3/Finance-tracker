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
    amount: string;
    setAmount: (val: string) => void;
    currency: Currency;
    setCurrency: (val: Currency) => void;
    transactionDate: string;
    setTransactionDate: (val: string) => void;
    fees: string;
    setFees: (val: string) => void;
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
    setShares: React.Dispatch<React.SetStateAction<SplitShare[]>>;
    amount: string;
    fees: string;
    currency: Currency;
    people: Person[];
    language: 'en' | 'sr';
    t: Record<string, string>;
    togglePersonIncluded: (personId: string) => void;
    updateShareAmount: (personId: string, value: string) => void;
    updateSharePercentage: (personId: string, value: string) => void;
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
    updateRecipientAmount: (personId: string, value: string) => void;
    currency: Currency;
    language: 'en' | 'sr';
    getPerson: (id: string) => Person | undefined;
}
