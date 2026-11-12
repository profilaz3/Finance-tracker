import { Account, AppState, Currency, Event, Person, RecurringTransaction, SharedExpense, Transaction } from '../types';
import { normalizeUserProfileId } from '../utils/remotePeople';

type SupabaseRecord = Record<string, unknown>;

export interface SupabaseSettingsRow {
    base_currency?: string;
    theme?: string;
    language?: string;
    user_profile?: {
        id: string;
        name: string;
        avatar?: string;
        color: string;
        defaultCurrency: string;
        balances: Record<string, number>;
    } | null;
}

export type SupabaseTransactionRow = SupabaseRecord & {
    receipt_data?: unknown;
    category_id?: string;
    account_id?: string;
    person_id?: string;
    split_details?: unknown;
    event_id?: string | null;
};

export type SupabaseAccountRow = SupabaseRecord & {
    initial_balance?: number;
    order_index?: number;
};

export type SupabaseEventRow = SupabaseRecord & {
    start_date?: string;
    end_date?: string;
    person_ids?: string[] | null;
    shared_emails?: string[] | null;
    image_url?: string;
    user_id?: string;
};

export type SupabaseSharedExpenseRow = SupabaseRecord & {
    event_id?: string;
    paid_by?: string;
    shared_with?: string[] | null;
    split_type?: string | null;
    split_details?: unknown;
    category?: string | null;
};

export type SupabaseRecurringTransactionRow = SupabaseRecord & {
    id: string;
    name: string;
    amount: number;
    currency: Currency;
    category_id: string;
    account_id: string;
    type: RecurringTransaction['type'];
    note?: string;
    subcategory?: string;
    frequency: RecurringTransaction['frequency'];
    start_date: string;
    end_date?: string;
    last_generated?: string;
    next_due: string;
    is_active: boolean;
};

const VALID_CURRENCIES: Currency[] = ['EUR', 'USD', 'RSD'];
const VALID_LANGUAGES: AppState['language'][] = ['en', 'sr'];
const VALID_THEMES: AppState['theme'][] = [
    'neon',
    'racing-orange',
    'graphite',
    'coffee',
    'gilded',
    'crimson-red',
    'lime-dark',
    'sterling',
    'canyon',
    'cyberpunk-pink',
    'harbor',
    'galaxy',
    'evergreen',
    'linen',
    'mist',
    'light'
];

const LEGACY_THEME_MAP: Record<string, AppState['theme']> = {
    'oled': 'graphite',
    'royal-purple': 'galaxy',
    'emerald-light': 'evergreen',
    'monochrome-light': 'mist'
};

const normalizeCurrency = (currency?: string, fallback: Currency = 'RSD'): Currency =>
    VALID_CURRENCIES.includes(currency as Currency) ? (currency as Currency) : fallback;

const normalizeLanguage = (language?: string): AppState['language'] =>
    VALID_LANGUAGES.includes(language as AppState['language']) ? (language as AppState['language']) : 'en';

const normalizeTheme = (theme?: string, fallback: AppState['theme'] = 'lime-dark'): AppState['theme'] => {
    if (!theme) return fallback;
    const mappedTheme = LEGACY_THEME_MAP[theme] ?? theme;
    return VALID_THEMES.includes(mappedTheme as AppState['theme']) ? (mappedTheme as AppState['theme']) : 'neon';
};

export function mapTransactionRow(row: SupabaseTransactionRow): Transaction {
    return {
        ...row,
        receiptData: row.receipt_data,
        categoryId: row.category_id,
        accountId: row.account_id,
        personId: row.person_id,
        splitDetails: row.split_details || undefined,
        eventId: row.event_id || undefined
    } as Transaction;
}

export function mapAccountRow(row: SupabaseAccountRow): Account {
    return {
        ...row,
        initialBalance: row.initial_balance,
        order: row.order_index
    } as Account;
}

export function mapEventRow(row: SupabaseEventRow): Event {
    return {
        ...row,
        startDate: row.start_date,
        endDate: row.end_date,
        personIds: row.person_ids || [],
        sharedEmails: row.shared_emails || [],
        imageUrl: row.image_url,
        userId: row.user_id
    } as Event;
}

export function mapSharedExpenseRow(row: SupabaseSharedExpenseRow): SharedExpense {
    return {
        ...row,
        eventId: row.event_id,
        paidBy: row.paid_by,
        sharedWith: row.shared_with || [],
        splitType: row.split_type || 'equal',
        splitDetails: row.split_details,
        category: row.category || 'Activities'
    } as SharedExpense;
}

export function mapRecurringTransactionRow(row: SupabaseRecurringTransactionRow): RecurringTransaction {
    return {
        id: row.id,
        name: row.name,
        amount: row.amount,
        currency: row.currency,
        categoryId: row.category_id,
        accountId: row.account_id,
        type: row.type,
        note: row.note,
        subcategory: row.subcategory,
        frequency: row.frequency,
        startDate: row.start_date,
        endDate: row.end_date,
        lastGenerated: row.last_generated,
        nextDue: row.next_due,
        isActive: row.is_active
    };
}

export function mapSettingsRow(
    row: SupabaseSettingsRow | null | undefined,
    userId: string
): Pick<AppState, 'baseCurrency' | 'theme' | 'language' | 'userProfile'> {
    const rawUserProfile = row?.user_profile;
    const userProfile: Person | undefined = rawUserProfile ? {
        id: normalizeUserProfileId(rawUserProfile.id, userId) ?? userId,
        name: rawUserProfile.name,
        avatar: rawUserProfile.avatar,
        color: rawUserProfile.color,
        defaultCurrency: normalizeCurrency(rawUserProfile.defaultCurrency),
        balances: rawUserProfile.balances || {}
    } : undefined;

    return {
        baseCurrency: normalizeCurrency(row?.base_currency),
        theme: normalizeTheme(row?.theme),
        language: normalizeLanguage(row?.language),
        userProfile
    };
}
