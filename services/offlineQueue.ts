/**
 * Offline Operation Queue
 *
 * The single ordered writer for every Supabase mutation. `syncManager` hands
 * operations to this queue (online or offline); operations run strictly FIFO,
 * one at a time, so an older write can never land after a newer one.
 *
 * - Transient failures (network, 5xx, expired auth) are retried forever with
 *   capped exponential backoff. Nothing is dropped.
 * - Permanent failures (4xx / validation / RLS) are moved to a persisted
 *   dead-letter list the UI can show, retry or discard.
 * - Storage is keyed by user id, so one account's pending writes can never be
 *   replayed under another account's session.
 */

import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import { isPermanentSyncError, PermanentSyncError } from './syncErrors';
import { writeStorage } from './storageHealth';

export type QueuedEntityType = 'transaction' | 'category' | 'account' | 'person' | 'settings' | 'event' | 'sharedExpense' | 'recurring';

export interface QueuedOperation {
    id: string;
    type: QueuedEntityType;
    action: 'sync' | 'delete';
    // Using `any` here since the queue stores payloads of various entity types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
    timestamp: number;
    retries: number;
    lastError?: string;
    /** Epoch ms of the next automatic retry while backing off. */
    nextAttemptAt?: number;
}

export interface DeadLetterOperation extends QueuedOperation {
    failedAt: number;
    reason: string;
}

export interface ProcessResult {
    success: number;
    failed: number;
}

type NewOperation = Omit<QueuedOperation, 'id' | 'timestamp' | 'retries' | 'lastError' | 'nextAttemptAt'>;

/**
 * Told when the server permanently refuses an operation. `awaited` is true when a caller was
 * waiting on that attempt (it gets the rejection itself and should report it); false for writes
 * replayed later (queued offline, or behind a retry), which nobody would hear about otherwise.
 */
export type RejectionListener = (operation: DeadLetterOperation, awaited: boolean) => void;
type Waiter = { resolve: () => void; reject: (error: Error) => void };

const QUEUE_KEY = CONFIG.OFFLINE_QUEUE_KEY;
const DEAD_LETTER_KEY = CONFIG.OFFLINE_DEAD_LETTER_KEY;

export const getRetryDelay = (retries: number): number =>
    Math.min(CONFIG.QUEUE_RETRY_BASE_MS * 2 ** Math.max(0, retries - 1), CONFIG.QUEUE_RETRY_MAX_MS);

const createOperationId = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const readList = <T>(key: string): T[] => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
        return [];
    }
};

const removeKey = (key: string): void => {
    try {
        localStorage.removeItem(key);
    } catch {
        // Storage unavailable
    }
};

const toError = (error: unknown): Error =>
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');

const describeError = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return 'Unknown error';
};

const sameEntity = (a: Pick<QueuedOperation, 'type' | 'payload'>, b: Pick<QueuedOperation, 'type' | 'payload'>): boolean =>
    a.type === b.type && a.payload?.id === b.payload?.id;

class OfflineQueue {
    private queue: QueuedOperation[] = [];
    private deadLetters: DeadLetterOperation[] = [];
    private userId: string | null = null;
    private epochValue = 0;
    private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
    private processingPromise: Promise<ProcessResult> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private waiters = new Map<string, Waiter[]>();
    private listeners: Set<(queue: QueuedOperation[]) => void> = new Set();
    private deadLetterListeners: Set<(deadLetters: DeadLetterOperation[]) => void> = new Set();
    private rejectionListeners: Set<RejectionListener> = new Set();

    constructor() {
        this.setupEventListeners();
    }

    // ---------------------------------------------------------------- storage

    private get queueKey(): string | null {
        return this.userId ? `${QUEUE_KEY}:${this.userId}` : null;
    }

    private get deadLetterKey(): string | null {
        return this.userId ? `${DEAD_LETTER_KEY}:${this.userId}` : null;
    }

    private persist(scope: 'queue' | 'dead-letter', key: string | null, value: unknown[]): void {
        // Without a user the queue lives in memory only and is adopted on sign-in.
        if (!key) return;
        const serialized = JSON.stringify(value);
        if (writeStorage(scope, key, serialized)) return;
        // Out of quota: drop a disposable cache and try once more. The in-memory
        // queue stays authoritative either way, so nothing is lost this session.
        removeKey(CONFIG.EXCHANGE_RATE_CACHE_KEY);
        try {
            localStorage.setItem(key, serialized);
        } catch {
            // Already reported by writeStorage
        }
    }

    private saveQueue(): void {
        this.persist('queue', this.queueKey, this.queue);
    }

    private saveDeadLetters(): void {
        this.persist('dead-letter', this.deadLetterKey, this.deadLetters);
    }

    private setupEventListeners(): void {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

        window.addEventListener('online', () => {
            this.isOnline = true;
            void this.processQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            // Anyone waiting on a first attempt gets "queued" instead of hanging.
            this.waiters.forEach(list => list.forEach(waiter => waiter.resolve()));
            this.waiters.clear();
        });

        // Another tab changed this user's queue: adopt its view (M6).
        window.addEventListener('storage', (event: StorageEvent) => {
            if (!event.key) return;
            if (event.key === this.queueKey) {
                this.queue = readList<QueuedOperation>(event.key);
                this.notifyListeners();
            } else if (event.key === this.deadLetterKey) {
                this.deadLetters = readList<DeadLetterOperation>(event.key);
                this.notifyDeadLetterListeners();
            }
        });
    }

    // ------------------------------------------------------------------ users

    /**
     * Bind the queue to the signed-in user. Loads that user's persisted queue and
     * dead letters, adopts operations queued before the user was known, and
     * migrates the legacy un-keyed queue. Passing `null` detaches without
     * touching any persisted data.
     */
    setUser(userId: string | null): void {
        if (userId === this.userId) return;

        const anonymousOps = this.userId === null ? this.queue : [];
        this.resetRuntime();
        this.userId = userId;

        if (!userId) {
            this.queue = [];
            this.deadLetters = [];
            this.notifyListeners();
            this.notifyDeadLetterListeners();
            return;
        }

        this.queue = readList<QueuedOperation>(this.queueKey!);
        this.deadLetters = readList<DeadLetterOperation>(this.deadLetterKey!);

        // Pre-v6 queues were not keyed by user. Sign-out always cleared them, so a
        // surviving legacy queue belongs to the session that is being restored.
        const legacyOps = readList<QueuedOperation>(QUEUE_KEY);
        [...legacyOps, ...anonymousOps].forEach(op => this.insert(op));
        if (legacyOps.length > 0) removeKey(QUEUE_KEY);

        this.saveQueue();
        this.notifyListeners();
        this.notifyDeadLetterListeners();

        if (this.isOnline) void this.processQueue();
    }

    get currentUserId(): string | null {
        return this.userId;
    }

    /**
     * Incremented whenever the queue is cleared or the user changes. Writers that
     * captured an older epoch must drop their payload instead of enqueueing it.
     */
    get epoch(): number {
        return this.epochValue;
    }

    /** Sign-out: forget everything belonging to the current user, in memory and on disk. */
    clearForSignOut(): void {
        const queueKey = this.queueKey;
        const deadLetterKey = this.deadLetterKey;
        this.resetRuntime();
        this.queue = [];
        this.deadLetters = [];
        if (queueKey) removeKey(queueKey);
        if (deadLetterKey) removeKey(deadLetterKey);
        removeKey(QUEUE_KEY);
        this.userId = null;
        this.notifyListeners();
        this.notifyDeadLetterListeners();
    }

    private resetRuntime(): void {
        this.epochValue++;
        this.cancelRetryTimer();
        this.waiters.forEach(list => list.forEach(waiter => waiter.resolve()));
        this.waiters.clear();
    }

    // ---------------------------------------------------------------- enqueue

    /** Insert keeping only the operations that still matter for that entity. */
    private insert(op: QueuedOperation): void {
        const superseded: string[] = [];
        this.queue = this.queue.filter(existing => {
            if (!sameEntity(existing, op)) return true;
            // A delete supersedes everything queued for the entity; a sync supersedes an older sync.
            if (op.action === 'delete' || (existing.action === 'sync' && op.action === 'sync')) {
                superseded.push(existing.id);
                return false;
            }
            return true;
        });

        // Callers waiting on a superseded op now wait on its replacement.
        const inherited = superseded.flatMap(id => {
            const list = this.waiters.get(id) || [];
            this.waiters.delete(id);
            return list;
        });
        if (inherited.length > 0) {
            this.waiters.set(op.id, [...(this.waiters.get(op.id) || []), ...inherited]);
        }

        this.queue.push(op);
    }

    private createOperation(operation: NewOperation): QueuedOperation {
        return {
            ...operation,
            id: createOperationId(),
            timestamp: Date.now(),
            retries: 0,
        };
    }

    /**
     * Add an operation to the queue and kick processing when online.
     */
    enqueue(operation: NewOperation): QueuedOperation {
        const queuedOp = this.createOperation(operation);
        this.insert(queuedOp);
        this.saveQueue();
        this.notifyListeners();

        if (this.isOnline) void this.processQueue();
        return queuedOp;
    }

    /**
     * Enqueue and wait for the first attempt. Resolves when the write reached the
     * server, or immediately when offline (it stays queued). Rejects when the
     * attempt failed; transient failures stay queued and keep retrying.
     */
    submit(operation: NewOperation): Promise<void> {
        const queuedOp = this.createOperation(operation);
        this.insert(queuedOp);
        this.saveQueue();
        this.notifyListeners();

        if (!this.isOnline || !this.userId) {
            return Promise.resolve();
        }

        const settled = new Promise<void>((resolve, reject) => {
            const list = this.waiters.get(queuedOp.id) || [];
            list.push({ resolve, reject });
            this.waiters.set(queuedOp.id, list);
        });
        void this.processQueue();
        return settled;
    }

    private settle(opId: string, error?: Error): void {
        const list = this.waiters.get(opId);
        if (!list) return;
        this.waiters.delete(opId);
        list.forEach(waiter => (error ? waiter.reject(error) : waiter.resolve()));
    }

    // ------------------------------------------------------------- processing

    /**
     * Process queued operations in order. Concurrent callers share one run, and
     * the returned promise settles when the queue is drained or a transient
     * failure put it into backoff.
     */
    processQueue(): Promise<ProcessResult> {
        if (this.processingPromise) {
            return this.processingPromise;
        }
        if (!this.isOnline || !this.userId || this.queue.length === 0) {
            return Promise.resolve({ success: 0, failed: 0 });
        }

        this.cancelRetryTimer();
        this.processingPromise = this.runQueue().finally(() => {
            this.processingPromise = null;
            this.notifyListeners();
        });
        this.notifyListeners();
        return this.processingPromise;
    }

    private async runQueue(): Promise<ProcessResult> {
        const epoch = this.epochValue;
        let success = 0;
        let failed = 0;

        while (this.isOnline && this.epochValue === epoch && this.queue.length > 0) {
            const operation = this.queue[0];

            try {
                await this.executeOperation(operation);
            } catch (error: unknown) {
                if (this.epochValue !== epoch) break;
                const message = describeError(error);

                if (isPermanentSyncError(error)) {
                    console.error('Sync operation rejected permanently, moved to dead letters:', operation, error);
                    this.removeOperation(operation.id);
                    const deadLetter: DeadLetterOperation = { ...operation, lastError: message, failedAt: Date.now(), reason: message };
                    this.deadLetters.push(deadLetter);
                    this.saveDeadLetters();
                    this.notifyDeadLetterListeners();
                    const awaited = (this.waiters.get(operation.id)?.length ?? 0) > 0;
                    this.settle(operation.id, toError(error));
                    this.notifyRejectionListeners(deadLetter, awaited);
                    failed++;
                    continue;
                }

                const current = this.queue.find(op => op.id === operation.id);
                if (!current) {
                    // Superseded while in flight; the replacement is further down the queue.
                    continue;
                }

                current.retries++;
                current.lastError = message;
                const delay = getRetryDelay(current.retries);
                current.nextAttemptAt = Date.now() + delay;
                this.saveQueue();

                // Strict FIFO: nothing behind this op runs until it succeeds.
                const failure = toError(error);
                this.queue.forEach(op => this.settle(op.id, failure));
                this.scheduleRetry(delay);
                break;
            }

            if (this.epochValue !== epoch) break;
            this.removeOperation(operation.id);
            this.settle(operation.id);
            success++;
        }

        return { success, failed };
    }

    private scheduleRetry(delay: number): void {
        this.cancelRetryTimer();
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.processQueue();
        }, delay);
    }

    private cancelRetryTimer(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    /**
     * Execute a single operation
     */
    private async executeOperation(operation: QueuedOperation): Promise<void> {
        if (operation.type !== 'settings' && !operation.payload?.id) {
            throw new PermanentSyncError(`Queued ${operation.type} ${operation.action} has no id`);
        }

        const supabaseService = await getSupabaseService();
        const { payload } = operation;
        const isSync = operation.action === 'sync';

        switch (operation.type) {
            case 'transaction':
                return isSync ? supabaseService.syncTransaction(payload) : supabaseService.deleteTransaction(payload.id);
            case 'category':
                return isSync ? supabaseService.syncCategory(payload) : supabaseService.deleteCategory(payload.id);
            case 'account':
                return isSync ? supabaseService.syncAccount(payload) : supabaseService.deleteAccount(payload.id);
            case 'person':
                return isSync ? supabaseService.syncPerson(payload) : supabaseService.deletePerson(payload.id);
            case 'settings':
                return supabaseService.syncSettings(payload);
            case 'event':
                return isSync ? supabaseService.syncEvent(payload) : supabaseService.deleteEvent(payload.id);
            case 'sharedExpense':
                return isSync ? supabaseService.syncSharedExpense(payload) : supabaseService.deleteSharedExpense(payload.id);
            case 'recurring':
                return isSync ? supabaseService.syncRecurring(payload) : supabaseService.deleteRecurring(payload.id);
            default:
                throw new PermanentSyncError(`Unknown operation type: ${(operation as QueuedOperation).type}`);
        }
    }

    private removeOperation(id: string): void {
        this.queue = this.queue.filter(op => op.id !== id);
        this.saveQueue();
        this.notifyListeners();
    }

    // ---------------------------------------------------------------- getters

    getQueue(): QueuedOperation[] {
        return [...this.queue];
    }

    get length(): number {
        return this.queue.length;
    }

    get online(): boolean {
        return this.isOnline;
    }

    get processing(): boolean {
        return this.processingPromise !== null;
    }

    subscribe(listener: (queue: QueuedOperation[]) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const queue = this.getQueue();
        this.listeners.forEach(listener => listener(queue));
    }

    // ----------------------------------------------------------- dead letters

    getDeadLetters(): DeadLetterOperation[] {
        return [...this.deadLetters];
    }

    subscribeDeadLetters(listener: (deadLetters: DeadLetterOperation[]) => void): () => void {
        this.deadLetterListeners.add(listener);
        return () => this.deadLetterListeners.delete(listener);
    }

    private notifyDeadLetterListeners(): void {
        const deadLetters = this.getDeadLetters();
        this.deadLetterListeners.forEach(listener => listener(deadLetters));
    }

    /** Permanent refusals as they happen (see RejectionListener). */
    subscribeRejections(listener: RejectionListener): () => void {
        this.rejectionListeners.add(listener);
        return () => this.rejectionListeners.delete(listener);
    }

    private notifyRejectionListeners(operation: DeadLetterOperation, awaited: boolean): void {
        this.rejectionListeners.forEach(listener => {
            try {
                listener(operation, awaited);
            } catch (error) {
                console.error('Rejection listener failed:', error);
            }
        });
    }

    /** Put a dead-lettered operation back on the queue (e.g. after the user fixed the data or server). */
    retryDeadLetter(id: string): void {
        const entry = this.deadLetters.find(op => op.id === id);
        if (!entry) return;
        this.deadLetters = this.deadLetters.filter(op => op.id !== id);
        this.saveDeadLetters();
        this.notifyDeadLetterListeners();
        this.enqueue({ type: entry.type, action: entry.action, payload: entry.payload });
    }

    discardDeadLetter(id: string): void {
        this.deadLetters = this.deadLetters.filter(op => op.id !== id);
        this.saveDeadLetters();
        this.notifyDeadLetterListeners();
    }

    clearDeadLetters(): void {
        this.deadLetters = [];
        this.saveDeadLetters();
        this.notifyDeadLetterListeners();
    }

    // ------------------------------------------------------------------ admin

    /**
     * Clear all queued operations (use with caution). Bumps the epoch so pending
     * debounced writes captured before the clear are discarded.
     */
    clear(): void {
        this.resetRuntime();
        this.queue = [];
        this.saveQueue();
        this.notifyListeners();
    }

    /**
     * Retry now, skipping the current backoff delay.
     */
    retryAll(): Promise<ProcessResult> {
        this.queue.forEach(op => {
            op.retries = 0;
            op.lastError = undefined;
            op.nextAttemptAt = undefined;
        });
        this.saveQueue();
        this.notifyListeners();
        return this.processQueue();
    }
}

// Export singleton instance
export const offlineQueue = new OfflineQueue();
