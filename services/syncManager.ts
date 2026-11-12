/**
 * Sync Manager
 *
 * Wraps supabaseService to provide automatic offline queueing and retry logic.
 * Use this instead of calling supabaseService directly for all sync operations.
 */

import { offlineQueue } from './offlineQueue';
import { getSupabaseService } from './runtimeServices';
import { Transaction, Category, Account, Person, Event, SharedExpense, RecurringTransaction } from '../types';
import { CONFIG } from '../config';
import { SettingsSyncPayload } from '../utils/settingsSync';

class SyncManager {
    private isOnline: boolean = navigator.onLine;
    private readonly DEBOUNCE_MS = CONFIG.SYNC_DEBOUNCE_MS;
    private syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private pendingResolvers = new Map<string, Array<{ resolve: () => void; reject: (e: Error) => void }>>();
    private latestPayload = new Map<string, unknown>();

    constructor() {
        window.addEventListener('online', () => {
            this.isOnline = true;
        });
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    private debounceKey(type: string, action: string, id?: string): string {
        const parts = [type, action];
        if (id) parts.push(id);
        return parts.join(':');
    }

    private getSupabaseService = () => getSupabaseService();

    private async runWithSupabase(run: (supabaseService: Awaited<ReturnType<typeof getSupabaseService>>) => Promise<void>): Promise<void> {
        await run(await this.getSupabaseService());
    }

    private scheduleDebounced(
        key: string,
        runner: () => Promise<void>,
        shouldEnqueue: (payload: unknown) => void
    ): Promise<void> {
        const timerId = this.syncTimers.get(key);
        if (timerId) {
            clearTimeout(timerId);
        }

        return new Promise((resolve, reject) => {
            const resolvers = this.pendingResolvers.get(key) || [];
            resolvers.push({ resolve, reject });
            this.pendingResolvers.set(key, resolvers);

            const newTimer = setTimeout(async () => {
                this.syncTimers.delete(key);
                const pending = this.pendingResolvers.get(key) || [];
                this.pendingResolvers.delete(key);

                const payload = this.latestPayload.get(key);

                if (this.isOnline) {
                    try {
                        await runner();
                        pending.forEach(({ resolve: pendingResolve }) => pendingResolve());
                    } catch (error) {
                        shouldEnqueue(payload);
                        pending.forEach(({ reject: pendingReject }) => pendingReject(error as Error));
                    }
                } else {
                    shouldEnqueue(payload);
                    pending.forEach(({ resolve: pendingResolve }) => pendingResolve());
                }
            }, this.DEBOUNCE_MS);

            this.syncTimers.set(key, newTimer);
        });
    }

    /**
     * Sync a transaction - queues if offline, syncs immediately if online
     */
    async syncTransaction(transaction: Transaction): Promise<void> {
        const key = this.debounceKey('transaction', 'sync', transaction.id);
        this.latestPayload.set(key, transaction);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncTransaction(transaction)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'transaction', action: 'sync', payload: transaction });
            }
        );
    }

    async deleteTransaction(id: string): Promise<void> {
        if (this.isOnline) {
            try {
                const supabaseService = await this.getSupabaseService();
                await supabaseService.deleteTransaction(id);
            } catch (error) {
                console.warn('Delete failed, queueing for retry:', error);
                offlineQueue.enqueue({ type: 'transaction', action: 'delete', payload: { id } });
                throw error;
            }
        } else {
            offlineQueue.enqueue({ type: 'transaction', action: 'delete', payload: { id } });
        }
    }

    async syncCategory(category: Category): Promise<void> {
        const key = this.debounceKey('category', 'sync', category.id);
        this.latestPayload.set(key, category);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncCategory(category)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'category', action: 'sync', payload: category });
            }
        );
    }

    async deleteCategory(id: string): Promise<void> {
        if (this.isOnline) {
            try {
                const supabaseService = await this.getSupabaseService();
                await supabaseService.deleteCategory(id);
            } catch (error) {
                console.warn('Delete failed, queueing for retry:', error);
                offlineQueue.enqueue({ type: 'category', action: 'delete', payload: { id } });
                throw error;
            }
        } else {
            offlineQueue.enqueue({ type: 'category', action: 'delete', payload: { id } });
        }
    }

    async syncAccount(account: Account): Promise<void> {
        const key = this.debounceKey('account', 'sync', account.id);
        this.latestPayload.set(key, account);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncAccount(account)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'account', action: 'sync', payload: account });
            }
        );
    }

    async deleteAccount(id: string): Promise<void> {
        if (this.isOnline) {
            try {
                const supabaseService = await this.getSupabaseService();
                await supabaseService.deleteAccount(id);
            } catch (error) {
                console.warn('Delete failed, queueing for retry:', error);
                offlineQueue.enqueue({ type: 'account', action: 'delete', payload: { id } });
                throw error;
            }
        } else {
            offlineQueue.enqueue({ type: 'account', action: 'delete', payload: { id } });
        }
    }

    async syncPerson(person: Person): Promise<void> {
        const key = this.debounceKey('person', 'sync', person.id);
        this.latestPayload.set(key, person);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncPerson(person)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'person', action: 'sync', payload: person });
            }
        );
    }

    async deletePerson(id: string): Promise<void> {
        if (this.isOnline) {
            try {
                const supabaseService = await this.getSupabaseService();
                await supabaseService.deletePerson(id);
            } catch (error) {
                console.warn('Delete failed, queueing for retry:', error);
                offlineQueue.enqueue({ type: 'person', action: 'delete', payload: { id } });
                throw error;
            }
        } else {
            offlineQueue.enqueue({ type: 'person', action: 'delete', payload: { id } });
        }
    }

    async syncSettings(settings: SettingsSyncPayload): Promise<void> {
        const key = this.debounceKey('settings', 'sync');
        this.latestPayload.set(key, settings);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncSettings(settings)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'settings', action: 'sync', payload: settings });
            }
        );
    }

    async syncEvent(event: Event): Promise<void> {
        const key = this.debounceKey('event', 'sync', event.id);
        this.latestPayload.set(key, event);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncEvent(event)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'event', action: 'sync', payload: event });
            }
        );
    }

    async deleteEvent(id: string): Promise<void> {
        if (this.isOnline) {
            try {
                const supabaseService = await this.getSupabaseService();
                await supabaseService.deleteEvent(id);
            } catch (error) {
                console.warn('Delete failed, queueing for retry:', error);
                offlineQueue.enqueue({ type: 'event', action: 'delete', payload: { id } });
                throw error;
            }
        } else {
            offlineQueue.enqueue({ type: 'event', action: 'delete', payload: { id } });
        }
    }

    async syncSharedExpense(expense: SharedExpense): Promise<void> {
        const key = this.debounceKey('sharedExpense', 'sync', expense.id);
        this.latestPayload.set(key, expense);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncSharedExpense(expense)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'sharedExpense', action: 'sync', payload: expense });
            }
        );
    }

    async deleteSharedExpense(id: string): Promise<void> {
        if (this.isOnline) {
            try {
                const supabaseService = await this.getSupabaseService();
                await supabaseService.deleteSharedExpense(id);
            } catch (error) {
                console.warn('Delete failed, queueing for retry:', error);
                offlineQueue.enqueue({ type: 'sharedExpense', action: 'delete', payload: { id } });
                throw error;
            }
        } else {
            offlineQueue.enqueue({ type: 'sharedExpense', action: 'delete', payload: { id } });
        }
    }

    async syncRecurring(recurring: RecurringTransaction): Promise<void> {
        const key = this.debounceKey('recurring', 'sync', recurring.id);
        this.latestPayload.set(key, recurring);

        return this.scheduleDebounced(
            key,
            () => this.runWithSupabase(supabaseService => supabaseService.syncRecurring(recurring)),
            (payload) => {
                console.warn('Sync failed or offline, queueing for retry');
                offlineQueue.enqueue({ type: 'recurring', action: 'sync', payload: recurring });
            }
        );
    }

    async deleteRecurring(id: string): Promise<void> {
        if (this.isOnline) {
            try {
                const supabaseService = await this.getSupabaseService();
                await supabaseService.deleteRecurring(id);
            } catch (error) {
                console.warn('Delete failed, queueing for retry:', error);
                offlineQueue.enqueue({ type: 'recurring', action: 'delete', payload: { id } });
                throw error;
            }
        } else {
            offlineQueue.enqueue({ type: 'recurring', action: 'delete', payload: { id } });
        }
    }

    /**
     * Get current online status
     */
    get online(): boolean {
        return this.isOnline;
    }

    /**
     * Get pending operation count
     */
    get pendingCount(): number {
        return offlineQueue.length;
    }
}

export const syncManager = new SyncManager();
