import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
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
    mapTransactionRow
} from './supabaseMappers';

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

    async signOut() {
        this.invalidateUserCache();
        return this.client.auth.signOut();
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

    // Data Sync
    async fetchFullState(): Promise<Partial<AppState>> {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const [
            { data: transactions, error: transactionsError },
            { data: categories, error: categoriesError },
            { data: accounts, error: accountsError },
            { data: people, error: peopleError },
            { data: settings, error: settingsError },
            { data: events, error: eventsError },
            { data: sharedExpenses, error: sharedExpensesError },
            { data: recurringTransactions, error: recurringError }
        ] = await Promise.all([
            this.client.from('transactions').select('*').eq('user_id', user.id),
            this.client.from('categories').select('*').eq('user_id', user.id),
            this.client.from('accounts').select('*').eq('user_id', user.id),
            this.client.from('people').select('*'), // Rely on RLS for shared event access
            this.client.from('settings').select('*').eq('user_id', user.id).single(),
            this.client.from('events').select('*'), // Rely on RLS to fetch owned + shared events
            this.client.from('shared_expenses').select('*'),
            this.client.from('recurring_transactions').select('*').eq('user_id', user.id)
        ]);

        const fetchErrors = [
            { scope: 'transactions', error: transactionsError },
            { scope: 'categories', error: categoriesError },
            { scope: 'accounts', error: accountsError },
            { scope: 'people', error: peopleError },
            { scope: 'settings', error: settingsError },
            { scope: 'events', error: eventsError },
            { scope: 'shared_expenses', error: sharedExpensesError },
            { scope: 'recurring_transactions', error: recurringError }
        ].filter(item => item.error);

        if (fetchErrors.length > 0) {
            console.error('Supabase fetch errors:', fetchErrors);
        }

        const referencedPersonIds = collectReferencedPersonIds({
            transactions: Array.isArray(transactions) ? transactions : [],
            events: Array.isArray(events) ? events : [],
            sharedExpenses: Array.isArray(sharedExpenses) ? sharedExpenses : [],
        });

        let resolvedPeople = Array.isArray(people) ? people : [];
        if (resolvedPeople.length === 0 && referencedPersonIds.length > 0) {
            try {
                resolvedPeople = await this.fetchPeopleViaRest(referencedPersonIds) as unknown as typeof resolvedPeople;
            } catch (fallbackPeopleError) {
                console.error('Supabase fallback people fetch error:', fallbackPeopleError);
            }
        }

        const mappedSettings = mapSettingsRow(settings, user.id);

        return {
            transactions: (transactions || []).map(mapTransactionRow),
            categories: (categories || []) as Category[],
            accounts: (accounts || []).map(mapAccountRow),
            people: resolvedPeople.map(p => normalizeRemotePersonRecord(p)) as Person[],
            ...mappedSettings,
            events: Array.isArray(events) ? events.map(mapEventRow) : [],
            sharedExpenses: Array.isArray(sharedExpenses) ? sharedExpenses.map(mapSharedExpenseRow) : [],
            recurringTransactions: Array.isArray(recurringTransactions) ? recurringTransactions.map(mapRecurringTransactionRow) : []
        };
    }

    async syncTransaction(transaction: Transaction) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');



        const { error } = await this.client.from('transactions').upsert({
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

        if (error) throw error;
    }

    async deleteTransaction(id: string) {
        const { error } = await this.client.from('transactions').delete().eq('id', id);
        if (error) throw error;
    }

    async syncCategory(category: Category) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error } = await this.client.from('categories').upsert({
            id: category.id,
            user_id: user.id,
            name: category.name,
            type: category.type,
            subcategories: category.subcategories,
            color: category.color,
            icon: category.icon
        });

        if (error) throw error;
    }

    async deleteCategory(id: string) {
        const { error } = await this.client.from('categories').delete().eq('id', id);
        if (error) throw error;
    }

    async syncAccount(account: Account) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error } = await this.client.from('accounts').upsert({
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

        if (error) throw error;
    }

    async deleteAccount(id: string) {
        const { error } = await this.client.from('accounts').delete().eq('id', id);
        if (error) throw error;
    }

    async syncPerson(person: Person) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error } = await this.client.from('people').upsert({
            id: person.id,
            user_id: user.id,
            name: person.name,
            avatar: person.avatar,
            color: person.color,
            default_currency: person.defaultCurrency,
            balances: person.balances
        });

        if (error) throw error;
    }

    async deletePerson(id: string) {
        const { error } = await this.client.from('people').delete().eq('id', id);
        if (error) throw error;
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

        const { error } = await this.client.from('settings').upsert({
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
            throw error;
        }
    }

    // Storage
    async uploadAvatar(file: File, personId: string): Promise<string> {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        // Avatars are downscaled to 256px WebP before upload; the folder is the owner's id for RLS.
        const fileExt = file.name.includes('.') ? file.name.split('.').pop() : 'webp';
        const filePath = `${user.id}/${personId}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await this.client.storage
            .from('avatars')
            .upload(filePath, file, { contentType: file.type || 'image/webp', cacheControl: '31536000', upsert: false });

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

        const { error } = await this.client.from('events').upsert({
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

        if (error) throw error;
    }

    async deleteEvent(id: string) {
        const { error } = await this.client.from('events').delete().eq('id', id);
        if (error) throw error;
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
        const { error } = await this.client.from('shared_expenses').upsert({
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

        if (error) throw error;
    }

    async deleteSharedExpense(id: string) {
        const { error } = await this.client.from('shared_expenses').delete().eq('id', id);
        if (error) throw error;
    }

    async syncRecurring(recurring: RecurringTransaction) {
        const user = await this.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error } = await this.client.from('recurring_transactions').upsert({
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

        if (error) throw error;
    }

    async deleteRecurring(id: string) {
        const { error } = await this.client.from('recurring_transactions').delete().eq('id', id);
        if (error) throw error;
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
