/**
 * Sync Manager
 *
 * Debounces entity writes and hands them to the offline queue, which is the
 * single ordered writer for Supabase (online or offline). Use this instead of
 * calling supabaseService directly for all sync operations.
 *
 * - Deleting an entity cancels its pending debounced upsert, so a delete can
 *   never be followed by a stale upsert that resurrects the row.
 * - Pending debounced writes are flushed into the (persisted) queue when the
 *   page is hidden or closed, and when the native app goes to the background.
 * - Writes scheduled before a sign-out / queue clear are discarded instead of
 *   being enqueued under the next session.
 */

import { offlineQueue, QueuedEntityType } from './offlineQueue';
import { Transaction, Category, Account, Person, Event, SharedExpense, RecurringTransaction } from '../types';
import { CONFIG } from '../config';
import { SettingsSyncPayload } from '../utils/settingsSync';

type Resolver = { resolve: () => void; reject: (error: Error) => void };

interface PendingWrite {
    timer: ReturnType<typeof setTimeout>;
    epoch: number;
    type: QueuedEntityType;
    payload: unknown;
    resolvers: Resolver[];
}

type CapacitorAppPlugin = {
    addListener?: (event: 'appStateChange', handler: (state: { isActive: boolean }) => void) => unknown;
};

class SyncManager {
    private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
    private readonly DEBOUNCE_MS = CONFIG.SYNC_DEBOUNCE_MS;
    private pending = new Map<string, PendingWrite>();

    constructor() {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('online', () => {
                this.isOnline = true;
            });
            window.addEventListener('offline', () => {
                this.isOnline = false;
            });
            window.addEventListener('pagehide', () => {
                void this.flushPending();
            });
        }

        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    void this.flushPending();
                }
            });
        }

        this.listenToNativeAppState();
    }

    /**
     * @capacitor/app is optional. When its native plugin is registered, flush as
     * soon as the app is backgrounded (Android may kill it without a pagehide).
     */
    private listenToNativeAppState(): void {
        try {
            const capacitor = (globalThis as { Capacitor?: { Plugins?: { App?: CapacitorAppPlugin } } }).Capacitor;
            const appPlugin = capacitor?.Plugins?.App;
            if (typeof appPlugin?.addListener === 'function') {
                const subscription = appPlugin.addListener('appStateChange', ({ isActive }) => {
                    if (!isActive) void this.flushPending();
                });
                if (subscription && typeof (subscription as Promise<unknown>).catch === 'function') {
                    (subscription as Promise<unknown>).catch(() => undefined);
                }
            }
        } catch {
            // Plugin not available on this platform
        }
    }

    private key(type: QueuedEntityType, id?: string): string {
        return id ? `${type}:${id}` : type;
    }

    private schedule(type: QueuedEntityType, id: string | undefined, payload: unknown): Promise<void> {
        const key = this.key(type, id);
        const existing = this.pending.get(key);
        if (existing) clearTimeout(existing.timer);

        return new Promise<void>((resolve, reject) => {
            const resolvers = existing && existing.epoch === offlineQueue.epoch ? existing.resolvers : [];
            if (existing && existing.epoch !== offlineQueue.epoch) {
                existing.resolvers.forEach(r => r.resolve());
            }
            resolvers.push({ resolve, reject });

            this.pending.set(key, {
                timer: setTimeout(() => {
                    void this.fire(key);
                }, this.DEBOUNCE_MS),
                epoch: offlineQueue.epoch,
                type,
                payload,
                resolvers,
            });
        });
    }

    private async fire(key: string): Promise<void> {
        const entry = this.pending.get(key);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(key);

        // Signed out or queue cleared since this write was scheduled: drop it.
        if (entry.epoch !== offlineQueue.epoch) {
            entry.resolvers.forEach(r => r.resolve());
            return;
        }

        try {
            await offlineQueue.submit({ type: entry.type, action: 'sync', payload: entry.payload });
            entry.resolvers.forEach(r => r.resolve());
        } catch (error) {
            console.warn('Sync failed, queued for retry:', error);
            entry.resolvers.forEach(r => r.reject(error as Error));
        }
    }

    private cancel(key: string): void {
        const entry = this.pending.get(key);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(key);
        entry.resolvers.forEach(r => r.resolve());
    }

    private remove(type: QueuedEntityType, id: string): Promise<void> {
        // Never let a pending debounced upsert land after the delete.
        this.cancel(this.key(type, id));
        return offlineQueue.submit({ type, action: 'delete', payload: { id } });
    }

    /**
     * Push every pending debounced write into the queue now. The queue persists
     * synchronously, so this is safe to call from pagehide/visibilitychange.
     */
    flushPending(): Promise<void> {
        const keys = Array.from(this.pending.keys());
        return Promise.allSettled(keys.map(key => this.fire(key))).then(() => undefined);
    }

    /** Sign-out: discard pending debounced writes without sending them. */
    reset(): void {
        Array.from(this.pending.keys()).forEach(key => this.cancel(key));
    }

    get pendingWriteCount(): number {
        return this.pending.size;
    }

    /** Debounced writes not yet handed to the queue (re-applied over fetched state). */
    getPendingWrites(): Array<{ type: QueuedEntityType; action: 'sync'; payload: unknown }> {
        return Array.from(this.pending.values())
            .filter(entry => entry.epoch === offlineQueue.epoch)
            .map(entry => ({ type: entry.type, action: 'sync' as const, payload: entry.payload }));
    }

    syncTransaction(transaction: Transaction): Promise<void> {
        return this.schedule('transaction', transaction.id, transaction);
    }

    deleteTransaction(id: string): Promise<void> {
        return this.remove('transaction', id);
    }

    syncCategory(category: Category): Promise<void> {
        return this.schedule('category', category.id, category);
    }

    deleteCategory(id: string): Promise<void> {
        return this.remove('category', id);
    }

    syncAccount(account: Account): Promise<void> {
        return this.schedule('account', account.id, account);
    }

    deleteAccount(id: string): Promise<void> {
        return this.remove('account', id);
    }

    syncPerson(person: Person): Promise<void> {
        return this.schedule('person', person.id, person);
    }

    deletePerson(id: string): Promise<void> {
        return this.remove('person', id);
    }

    syncSettings(settings: SettingsSyncPayload): Promise<void> {
        return this.schedule('settings', undefined, settings);
    }

    syncEvent(event: Event): Promise<void> {
        return this.schedule('event', event.id, event);
    }

    deleteEvent(id: string): Promise<void> {
        return this.remove('event', id);
    }

    syncSharedExpense(expense: SharedExpense): Promise<void> {
        return this.schedule('sharedExpense', expense.id, expense);
    }

    deleteSharedExpense(id: string): Promise<void> {
        return this.remove('sharedExpense', id);
    }

    syncRecurring(recurring: RecurringTransaction): Promise<void> {
        return this.schedule('recurring', recurring.id, recurring);
    }

    deleteRecurring(id: string): Promise<void> {
        return this.remove('recurring', id);
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
        return offlineQueue.length + this.pending.size;
    }
}

export const syncManager = new SyncManager();
