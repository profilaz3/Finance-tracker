import { createClient, isAuthRetryableFetchError, SupabaseClient, User } from '@supabase/supabase-js';
import { AppState, Transaction, Category, Account, Person, Event, SharedExpense, RecurringTransaction } from '../types';
import { CONFIG } from '../config';
import { SettingsSyncPayload } from '../utils/settingsSync';
import { collectReferencedPersonIds, normalizeRemotePersonRecord } from '../utils/remotePeople';
import {
    mapAccountRow,
    mapEventRow,
    mapRecurringTransactionRow,
    mapSettingsRow,
    mapSharedExpenseRow,
    mapTransactionRow,
    sortAccountsByOrder
} from './supabaseMappers';
import type { SupabaseRecurringTransactionRow, SupabaseSettingsRow } from './supabaseMappers';
import { toSyncError } from './syncErrors';

export type { RemoteSlice, RemoteStateResult } from './hydration';
import type { RemoteSlice, RemoteStateResult } from './hydration';

export type UserVerification = 'valid' | 'invalid' | 'unknown';

type Row = Record<string, unknown>;
type ListResult<T> = { data: T[]; error: null } | { data: null; error: Error };

const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseAnonKey = CONFIG.SUPABASE_ANON_KEY;

// Validate environment variables at startup
const SUPABASE_CONFIGURED = !!(supabaseUrl && supabaseAnonKey);
const globalSupabase = globalThis as typeof globalThis & {
    __financeSupabaseClient__?: SupabaseClient | null;
};

if (!SUPABASE_CONFIGURED && import.meta.env.DEV) {
    console.warn('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export class SupabaseService {
    private _client: SupabaseClient | null = null;

    private cachedUser: User | null = null;
    private cachedUserAt = 0;
    private readonly USER_TTL_MS = CONFIG.USER_CACHE_TTL_MS;
    private inflightUserPromise: Promise<User | null> | null = null;

    get client(): SupabaseClient {
        if (!this._client) {
            if (!SUPABASE_CONFIGURED) {
                throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
            }
            this._client = globalSupabase.__financeSupabaseClient__ ?? createClient(supabaseUrl!, supabaseAnonKey!);
            globalSupabase.__financeSupabaseClient__ = this._client;
        }
        return this._client;
    }

    isConfigured(): boolean {
        return SUPABASE_CONFIGURED;
    }

    // Auth
    async signUp(email: string, password: string) {
        return this.client.auth.signUp({ email, password });
    }

    async signIn(email: string, password: string) {
        return this.client.auth.signInWithPassword({ email, password });
    }

    /**
     * Sign out everywhere when the network allows it, and always drop the local
     * session: a global sign-out that cannot reach the server leaves the token in
     * storage, so fall back to `scope: 'local'` (no network) and finally remove
     * the stored session ourselves.
     */
    async signOut(): Promise<{ error: null }> {
        this.invalidateUserCache();

        try {
            const { error } = await this.client.auth.signOut();
            if (!error) return { error: null };
            console.warn('Global sign-out failed, signing out locally:', error);
        } catch (error) {
            console.warn('Global sign-out threw, signing out locally:', error);
        }

        try {
            await this.client.auth.signOut({ scope: 'local' });
        } catch (error) {
            console.warn('Local sign-out failed:', error);
        }

        this.removeStoredSession();
        return { error: null };
    }

    private get authStorageKey(): string | null {
        try {
            const key = (this.client.auth as unknown as { storageKey?: unknown }).storageKey;
            return typeof key === 'string' && key ? key : null;
        } catch {
            return null;
        }
    }

    private removeStoredSession(): void {
        const key = this.authStorageKey;
        if (!key) return;
        try {
            localStorage.removeItem(key);
            localStorage.removeItem(`${key}-user`);
            localStorage.removeItem(`${key}-code-verifier`);
        } catch {
            // Storage unavailable
        }
    }

    private readStoredSessionUser(): User | null {
        const key = this.authStorageKey;
        if (!key) return null;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as { user?: User; currentSession?: { user?: User } } | null;
            const user = parsed?.user ?? parsed?.currentSession?.user ?? null;
            if (user) return user;
            const rawUser = localStorage.getItem(`${key}-user`);
            const parsedUser = rawUser ? JSON.parse(rawUser) as { user?: User } | null : null;
            return parsedUser?.user ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Resolve the signed-in user from the locally stored session (no network
     * needed). When the access token has expired and cannot be refreshed because
     * the device is offline, the stored session is still trusted so the app opens
     * offline; the server re-validates it as soon as a request is made.
     */
    async getSessionUser(): Promise<User | null> {
        try {
            const { data, error } = await this.client.auth.getSession();
            if (data?.session?.user) return data.session.user;
            if (!error) return null;
            if (!isAuthRetryableFetchError(error)) return null;
        } catch (error) {
            console.warn('Reading the local session failed:', error);
        }
        return this.readStoredSessionUser();
    }

    /**
     * Confirm the session with the auth server. `unknown` means the server could
     * not be reached (keep the local session); `invalid` means it was rejected.
     */
    async verifyUser(): Promise<UserVerification> {
        try {
            const { data, error } = await this.client.auth.getUser();
            if (data?.user) {
                this.cachedUser = data.user;
                this.cachedUserAt = Date.now();
                return 'valid';
            }
            if (error && isAuthRetryableFetchError(error)) return 'unknown';
            const status = (error as { status?: number } | null)?.status;
            if (typeof status === 'number' && status >= 500) return 'unknown';
            return 'invalid';
        } catch {
            return 'unknown';
        }
    }

    private invalidateUserCache(): void {
        this.cachedUser = null;
        this.cachedUserAt = 0;
        this.inflightUserPromise = null;
    }

    async getUser(): Promise<User | null> {
        if (this.cachedUser && Date.now() - this.cachedUserAt < this.USER_TTL_MS) {
            return this.cachedUser;
        }

        if (this.inflightUserPromise) {
            return this.inflightUserPromise;
        }

        this.inflightUserPromise = (async () => {
            try {
                const { data: { user } } = await this.client.auth.getUser();
                this.cachedUser = user;
                this.cachedUserAt = Date.now();
                return user;
            } finally {
                this.inflightUserPromise = null;
            }
        })();

        return this.inflightUserPromise;
    }

    async deleteUserAccount() {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        // Get the auth token
        const { data: { session } } = await this.client.auth.getSession();
        if (!session) throw new Error('No session found');

        // Call the edge function to delete the user
        const response = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete account');
        }

        // Sign out after successful deletion
        await this.signOut();
    }

    /**
     * Fetch every row of a list query, paging with `.range()` so tables larger
     * than PostgREST's max-rows (1000 by default) come back complete.
     */
    private async fetchAllRows<T = Row>(table: string, eq?: { column: string; value: string }): Promise<ListResult<T>> {
        const pageSize = CONFIG.FETCH_PAGE_SIZE;
        const rows: T[] = [];
        let total: number | null = null;

        for (let from = 0; ; from += pageSize) {
            let query = this.client
                .from(table)
                .select('*', from === 0 ? { count: 'exact' } : undefined);
            if (eq) query = query.eq(eq.column, eq.value);

            const { data, error, status, count } = await query
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);

            if (error) return { data: null, error: toSyncError(error, status) };
            if (from === 0 && typeof count === 'number') total = count;

            const page = (data ?? []) as T[];
            rows.push(...page);

            if (page.length === 0) break;
            if (total !== null ? rows.length >= total : page.length < pageSize) break;
        }

        return { data: rows, error: null };
    }

    // Data Sync
    async fetchFullState(): Promise<RemoteStateResult> {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const own = { column: 'user_id', value: user.id };
        const [
            transactionsResult,
            categoriesResult,
            accountsResult,
            peopleResult,
            settingsResult,
            eventsResult,
            sharedExpensesResult,
            recurringResult,
        ] = await Promise.all([
            this.fetchAllRows('transactions', own),
            this.fetchAllRows('categories', own),
            this.fetchAllRows('accounts', own),
            this.fetchAllRows('people'), // Rely on RLS for shared event access
            this.client.from('settings').select('*').eq('user_id', user.id).maybeSingle(),
            this.fetchAllRows('events'), // Rely on RLS to fetch owned + shared events
            this.fetchAllRows('shared_expenses'),
            this.fetchAllRows<SupabaseRecurringTransactionRow>('recurring_transactions', own),
        ]);

        const failedSlices: RemoteSlice[] = [];
        const errors: Array<{ scope: RemoteSlice; error: unknown }> = [];
        const track = <T>(scope: RemoteSlice, result: { data: T | null; error: unknown }): T | null => {
            if (result.error) {
                failedSlices.push(scope);
                errors.push({ scope, error: result.error });
                return null;
            }
            return result.data;
        };

        const transactions = track('transactions', transactionsResult);
        const categories = track('categories', categoriesResult);
        const accounts = track('accounts', accountsResult);
        const events = track('events', eventsResult);
        const sharedExpenses = track('sharedExpenses', sharedExpensesResult);
        const recurringTransactions = track('recurringTransactions', recurringResult);
        const settings = track('settings', settingsResult) as SupabaseSettingsRow | null;

        let people: Row[] | null = peopleResult.error ? null : peopleResult.data;
        const referencedPersonIds = collectReferencedPersonIds({
            transactions: transactions ?? [],
            events: events ?? [],
            sharedExpenses: sharedExpenses ?? [],
        });
        if ((people === null || people.length === 0) && referencedPersonIds.length > 0) {
            try {
                people = await this.fetchPeopleViaRest(referencedPersonIds) as unknown as Row[];
            } catch (fallbackPeopleError) {
                console.error('Supabase fallback people fetch error:', fallbackPeopleError);
            }
        }
        if (people === null) {
            failedSlices.push('people');
            errors.push({ scope: 'people', error: peopleResult.error });
        }

        if (errors.length > 0) {
            console.error('Supabase fetch errors:', errors);
        }

        const state: Partial<AppState> = {};
        if (transactions) state.transactions = transactions.map(mapTransactionRow);
        if (categories) state.categories = categories as unknown as Category[];
        if (accounts) state.accounts = sortAccountsByOrder(accounts.map(mapAccountRow));
        if (people) state.people = people.map(p => normalizeRemotePersonRecord(p as Parameters<typeof normalizeRemotePersonRecord>[0])) as Person[];
        if (events) state.events = events.map(mapEventRow);
        if (sharedExpenses) state.sharedExpenses = sharedExpenses.map(mapSharedExpenseRow);
        if (recurringTransactions) state.recurringTransactions = recurringTransactions.map(mapRecurringTransactionRow);
        const hasSettingsRow = !settingsResult.error && settings !== null;
        if (hasSettingsRow) Object.assign(state, mapSettingsRow(settings, user.id));

        return { state, failedSlices, hasSettingsRow };
    }

    async syncTransaction(transaction: Transaction) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');



        const { error, status } = await this.client.from('transactions').upsert({
            id: transaction.id,
            user_id: user.id,
            date: transaction.date,
            amount: transaction.amount,
            currency: transaction.currency,
            category_id: transaction.categoryId,
            account_id: transaction.accountId,
            person_id: transaction.personId,
            subcategory: transaction.subcategory,
            note: transaction.note,
            type: transaction.type,
            receipt_data: transaction.receiptData,
            fees: transaction.fees,
            split_details: transaction.splitDetails || null,
            event_id: transaction.eventId || null
        });

        if (error) throw toSyncError(error, status);
    }

    async deleteTransaction(id: string) {
        const { error, status } = await this.client.from('transactions').delete().eq('id', id);
        if (error) throw toSyncError(error, status);
    }

    async syncCategory(category: Category) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error, status } = await this.client.from('categories').upsert({
            id: category.id,
            user_id: user.id,
            name: category.name,
            type: category.type,
            subcategories: category.subcategories,
            color: category.color,
            icon: category.icon
        });

        if (error) throw toSyncError(error, status);
    }

    async deleteCategory(id: string) {
        const { error, status } = await this.client.from('categories').delete().eq('id', id);
        if (error) throw toSyncError(error, status);
    }

    async syncAccount(account: Account) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error, status } = await this.client.from('accounts').upsert({
            id: account.id,
            user_id: user.id,
            name: account.name,
            type: account.type,
            currency: account.currency,
            color: account.color,
            initial_balance: account.initialBalance,
            icon: account.icon,
            order_index: account.order
        });

        if (error) throw toSyncError(error, status);
    }

    async deleteAccount(id: string) {
        const { error, status } = await this.client.from('accounts').delete().eq('id', id);
        if (error) throw toSyncError(error, status);
    }

    async syncPerson(person: Person) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error, status } = await this.client.from('people').upsert({
            id: person.id,
            user_id: user.id,
            name: person.name,
            avatar: person.avatar,
            color: person.color,
            default_currency: person.defaultCurrency,
            balances: person.balances
        });

        if (error) throw toSyncError(error, status);
    }

    async deletePerson(id: string) {
        const { error, status } = await this.client.from('people').delete().eq('id', id);
        if (error) throw toSyncError(error, status);
    }

    private async fetchPeopleViaRest(personIds?: string[]): Promise<Person[]> {
        const user = await this.getUser();
        const { data: { session } } = await this.client.auth.getSession();

        if (!user || !session || !SUPABASE_CONFIGURED) {
            return [];
        }

        const query = new URLSearchParams({ select: '*' });
        if (personIds && personIds.length > 0) {
            query.set('id', `in.(${personIds.join(',')})`);
        } else {
            query.set('user_id', `eq.${user.id}`);
        }

        const response = await fetch(`${supabaseUrl}/rest/v1/people?${query.toString()}`, {
            headers: {
                apikey: supabaseAnonKey!,
                Authorization: `Bearer ${session.access_token}`,
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Fallback people fetch failed with status ${response.status}`);
        }

        const rows = await response.json();
        return Array.isArray(rows)
            ? rows.map(p => normalizeRemotePersonRecord(p)) as Person[]
            : [];
    }

    async syncSettings(settings: SettingsSyncPayload) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error, status } = await this.client.from('settings').upsert({
            user_id: user.id,
            base_currency: settings.baseCurrency,
            theme: settings.theme,
            language: settings.language,
            user_profile: settings.userProfile ? {
                id: settings.userProfile.id,
                name: settings.userProfile.name,
                avatar: settings.userProfile.avatar,
                color: settings.userProfile.color,
                defaultCurrency: settings.userProfile.defaultCurrency,
                balances: settings.userProfile.balances
            } : null
        }, { onConflict: 'user_id' });

        if (error) {
            throw toSyncError(error, status);
        }
    }

    // Storage
    async uploadAvatar(file: File): Promise<string> {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await this.client.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = this.client.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return publicUrl;
    }

    // Events
    async syncEvent(event: Event) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        // If user is owner, use their ID. If not (participant), we don't change user_id (it stays as owner's)
        const ownerId = event.userId || user.id;

        const { error, status } = await this.client.from('events').upsert({
            id: event.id,
            user_id: ownerId,
            name: event.name,
            description: event.description,
            start_date: event.startDate,
            end_date: event.endDate,
            person_ids: event.personIds,
            shared_emails: event.sharedEmails,
            icon: event.icon,
            color: event.color,
            image_url: event.imageUrl,
            status: event.status
        });

        if (error) throw toSyncError(error, status);
    }

    async deleteEvent(id: string) {
        const { error, status } = await this.client.from('events').delete().eq('id', id);
        if (error) throw toSyncError(error, status);
    }

    async uploadEventPhoto(file: File, eventId: string, oldImageUrl?: string): Promise<string> {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        // Delete old image if it exists
        if (oldImageUrl) {
            try {
                await this.deleteEventPhoto(oldImageUrl);
            } catch {
                // Continue with upload even if old photo deletion fails
            }
        }

        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        // Use user.id as folder
        const folder = user.id;
        const filePath = `${folder}/${eventId}_${timestamp}.${fileExt}`;

        const { error: uploadError } = await this.client.storage
            .from('event-photos')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = this.client.storage
            .from('event-photos')
            .getPublicUrl(filePath);

        return publicUrl;
    }

    async deleteEventPhoto(imageUrl: string): Promise<void> {
        try {
            const url = new URL(imageUrl);
            const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/event-photos\/(.+)/);
            if (pathMatch && pathMatch[1]) {
                const filePath = decodeURIComponent(pathMatch[1]);
                const { error } = await this.client.storage
                    .from('event-photos')
                    .remove([filePath]);
                // Silently ignore deletion errors
            }
        } catch {
            // Silently ignore URL parsing errors
        }
    }

    // Shared Expenses
    async syncSharedExpense(expense: SharedExpense) {
        const { error, status } = await this.client.from('shared_expenses').upsert({
            id: expense.id,
            event_id: expense.eventId,
            name: expense.name,
            amount: expense.amount,
            currency: expense.currency,
            paid_by: expense.paidBy,
            shared_with: expense.sharedWith,
            date: expense.date,
            split_type: expense.splitType,
            split_details: expense.splitDetails,
            category: expense.category
        });

        if (error) throw toSyncError(error, status);
    }

    async deleteSharedExpense(id: string) {
        const { error, status } = await this.client.from('shared_expenses').delete().eq('id', id);
        if (error) throw toSyncError(error, status);
    }

    async syncRecurring(recurring: RecurringTransaction) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error, status } = await this.client.from('recurring_transactions').upsert({
            id: recurring.id,
            user_id: user.id,
            name: recurring.name,
            amount: recurring.amount,
            currency: recurring.currency,
            category_id: recurring.categoryId,
            account_id: recurring.accountId,
            type: recurring.type,
            note: recurring.note,
            subcategory: recurring.subcategory,
            frequency: recurring.frequency,
            start_date: recurring.startDate,
            end_date: recurring.endDate,
            last_generated: recurring.lastGenerated,
            next_due: recurring.nextDue,
            is_active: recurring.isActive
        });

        if (error) throw toSyncError(error, status);
    }

    async deleteRecurring(id: string) {
        const { error, status } = await this.client.from('recurring_transactions').delete().eq('id', id);
        if (error) throw toSyncError(error, status);
    }

    // Share Event
    async shareEventByEmail(eventId: string, email: string): Promise<void> {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        // Check if user is the event owner
        const { data: event, error: fetchError } = await this.client
            .from('events')
            .select('user_id, shared_emails')
            .eq('id', eventId)
            .single();

        if (fetchError) throw fetchError;
        if (event.user_id !== user.id) {
            throw new Error('Only the event owner can share this event');
        }

        // Check if email is already shared
        const sharedEmails = event.shared_emails || [];
        if (sharedEmails.includes(email)) {
            throw new Error('This event is already shared with this email');
        }

        // Prevent sharing with owner's own email
        if (user.email === email) {
            throw new Error('You cannot share an event with yourself');
        }

        // Add email to shared_emails array
        const { error: updateError } = await this.client
            .from('events')
            .update({
                shared_emails: [...sharedEmails, email]
            })
            .eq('id', eventId);

        if (updateError) throw updateError;
    }

    // Check if user is participant of an event
    async isEventParticipant(eventId: string): Promise<boolean> {
        const user = await this.getUser();
        if (!user || !user.email) return false;

        const { data: event } = await this.client
            .from('events')
            .select('user_id, shared_emails')
            .eq('id', eventId)
            .single();

        if (!event) return false;

        // User is participant if their email is in shared_emails (but not the owner)
        return event.user_id !== user.id &&
            (event.shared_emails || []).includes(user.email);
    }
}

export const supabaseService = new SupabaseService();
