import { Account, AppState, Category, Currency, Event, Person, RecurringTransaction, SharedExpense, Team, TeamMember, TeamRole, Transaction } from '../types';
import { normalizeUserProfileId } from '../utils/remotePeople';
import { parseSettingsPrefs } from '../utils/settingsPrefs';

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
    prefs?: unknown;
}

export type SupabaseTransactionRow = SupabaseRecord & {
    receipt_data?: unknown;
    category_id?: string;
    account_id?: string;
    person_id?: string;
    split_details?: unknown;
    event_id?: string | null;
    transfer_id?: string | null;
    team_id?: string | null;
};

export type SupabaseAccountRow = SupabaseRecord & {
    initial_balance?: number;
    order_index?: number;
    team_id?: string | null;
};

export type SupabaseCategoryRow = SupabaseRecord & {
    team_id?: string | null;
};

export type SupabaseEventRow = SupabaseRecord & {
    start_date?: string;
    end_date?: string;
    person_ids?: string[] | null;
    shared_emails?: string[] | null;
    image_url?: string;
    user_id?: string;
    team_id?: string | null;
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
    user_id?: string;
    team_id?: string | null;
};

export interface SupabaseTeamMemberRow {
    team_id?: string;
    email: string;
    user_id?: string | null;
    role: string;
}

export interface SupabaseTeamRow {
    id: string;
    name: string;
    owner_id: string;
    color?: string | null;
    created_at?: string | null;
    team_members?: SupabaseTeamMemberRow[] | null;
}

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

const VALID_TEAM_ROLES: TeamRole[] = ['owner', 'admin', 'member'];

/** Spread into a mapped entity: adds `teamId` only for team rows, so personal rows keep their shape. */
const teamIdField = (teamId: unknown): { teamId?: string } =>
    typeof teamId === 'string' && teamId ? { teamId } : {};

/** Database columns for an entity's team link: omitted when unset (works before the column exists), null to detach. */
export const teamIdColumn = (teamId: string | null | undefined): { team_id?: string | null } => {
    if (teamId === null) return { team_id: null };
    return teamId ? { team_id: teamId } : {};
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
        eventId: row.event_id || undefined,
        transferId: row.transfer_id || undefined,
        ...teamIdField(row.team_id)
    } as Transaction;
}

export function mapAccountRow(row: SupabaseAccountRow): Account {
    return {
        ...row,
        initialBalance: row.initial_balance,
        order: row.order_index,
        ...teamIdField(row.team_id)
    } as Account;
}

export function mapCategoryRow(row: SupabaseCategoryRow): Category {
    return {
        ...row,
        ...teamIdField(row.team_id)
    } as unknown as Category;
}

export function mapEventRow(row: SupabaseEventRow): Event {
    return {
        ...row,
        startDate: row.start_date,
        endDate: row.end_date,
        personIds: row.person_ids || [],
        sharedEmails: row.shared_emails || [],
        imageUrl: row.image_url,
        userId: row.user_id,
        ...teamIdField(row.team_id)
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
        isActive: row.is_active,
        ...(row.user_id ? { userId: row.user_id } : {}),
        ...teamIdField(row.team_id)
    };
}

const normalizeTeamRole = (role: string): TeamRole =>
    VALID_TEAM_ROLES.includes(role as TeamRole) ? (role as TeamRole) : 'member';

const TEAM_ROLE_ORDER: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 };

export function mapTeamMemberRow(row: SupabaseTeamMemberRow): TeamMember {
    return {
        email: row.email,
        role: normalizeTeamRole(row.role),
        ...(row.user_id ? { userId: row.user_id } : {})
    };
}

/** Members are ordered owner, admins, members, then by email. */
export function mapTeamRow(row: SupabaseTeamRow): Team {
    const members = (row.team_members ?? [])
        .map(mapTeamMemberRow)
        .sort((a, b) => TEAM_ROLE_ORDER[a.role] - TEAM_ROLE_ORDER[b.role] || a.email.localeCompare(b.email));
    return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        ...(row.color ? { color: row.color } : {}),
        ...(row.created_at ? { createdAt: row.created_at } : {}),
        members
    };
}

export function mapSettingsRow(
    row: SupabaseSettingsRow | null | undefined,
    userId: string
): Pick<AppState, 'baseCurrency' | 'theme' | 'language' | 'userProfile' | 'appearance' | 'homeLayout' | 'budget' | 'paymentDetails'> {
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
        userProfile,
        ...parseSettingsPrefs(row?.prefs)
    };
}

/** Pages are fetched by id; restore the user's account order (unordered rows keep their place at the end). */
export const sortAccountsByOrder = (accounts: Account[]): Account[] =>
    accounts
        .map((account, index) => ({ account, index }))
        .sort((a, b) => {
            const orderA = a.account.order ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.account.order ?? Number.MAX_SAFE_INTEGER;
            return orderA - orderB || a.index - b.index;
        })
        .map(entry => entry.account);
