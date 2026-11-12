/**
 * Offline Operation Queue
 *
 * Handles queueing operations when offline and syncing when back online.
 * Persists queue to localStorage for durability across page reloads.
 */

export interface QueuedOperation {
    id: string;
    type: 'transaction' | 'category' | 'account' | 'person' | 'settings' | 'event' | 'sharedExpense' | 'recurring';
    action: 'sync' | 'delete';
    // Using `any` here since the queue stores payloads of various entity types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
    timestamp: number;
    retries: number;
    lastError?: string;
}

import { CONFIG } from '../config';
import { safeGet, safeSet } from '../utils/safeStorage';
import { getSupabaseService } from './runtimeServices';

const QUEUE_KEY = CONFIG.OFFLINE_QUEUE_KEY;
const MAX_RETRIES = CONFIG.MAX_RETRIES;
const RETRY_DELAYS = CONFIG.RETRY_DELAYS;

class OfflineQueue {
    private queue: QueuedOperation[] = [];
    private isOnline: boolean = navigator.onLine;
    private isProcessing: boolean = false;
    private listeners: Set<(queue: QueuedOperation[]) => void> = new Set();

    constructor() {
        this.loadQueue();
        this.setupEventListeners();
    }

    private loadQueue() {
        this.queue = safeGet<QueuedOperation[]>(QUEUE_KEY, []);
    }

    private saveQueue() {
        safeSet(QUEUE_KEY, this.queue);
    }

    private setupEventListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('📶 Back online - processing queue...');
            this.processQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Went offline - operations will be queued');
        });
    }

    /**
     * Add an operation to the queue
     */
    enqueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): void {
        const queuedOp: QueuedOperation = {
            ...operation,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            retries: 0
        };

        // Check for duplicate/conflicting operations and merge
        this.queue = this.queue.filter(op => {
            // Remove previous operations on the same entity
            if (op.type === queuedOp.type && op.payload?.id === queuedOp.payload?.id) {
                // If new operation is delete, remove all previous ops for this entity
                if (queuedOp.action === 'delete') {
                    return false;
                }
                // If both are sync, keep only the latest
                if (op.action === 'sync' && queuedOp.action === 'sync') {
                    return false;
                }
            }
            return true;
        });

        this.queue.push(queuedOp);
        this.saveQueue();
        this.notifyListeners();

        // Try to process immediately if online
        if (this.isOnline) {
            this.processQueue();
        }
    }

    /**
     * Process all queued operations
     */
    async processQueue(): Promise<{ success: number; failed: number }> {
        if (this.isProcessing || !this.isOnline || this.queue.length === 0) {
            return { success: 0, failed: 0 };
        }

        this.isProcessing = true;
        let success = 0;
        let failed = 0;

        // Process operations in order (FIFO)
        const operations = [...this.queue];

        for (const operation of operations) {
            try {
                await this.executeOperation(operation);
                this.removeFromQueue(operation.id);
                success++;
            } catch (error: unknown) {
                operation.retries++;
                operation.lastError = error instanceof Error ? error.message : 'Unknown error';

                if (operation.retries >= MAX_RETRIES) {
                    // Move to dead letter queue or just remove
                    console.error(`❌ Operation failed after ${MAX_RETRIES} retries:`, operation);
                    this.removeFromQueue(operation.id);
                    failed++;
                } else {
                    // Schedule retry with exponential backoff
                    const delay = RETRY_DELAYS[operation.retries - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
                    console.log(`⏳ Retrying operation in ${delay}ms (attempt ${operation.retries}/${MAX_RETRIES})`);
                    this.saveQueue();
                    setTimeout(() => this.processQueue(), delay);
                }
            }
        }

        this.isProcessing = false;
        this.notifyListeners();

        return { success, failed };
    }

    /**
     * Execute a single operation
     */
    private async executeOperation(operation: QueuedOperation): Promise<void> {
        const supabaseService = await getSupabaseService();

        switch (operation.type) {
            case 'transaction':
                if (operation.action === 'sync') {
                    await supabaseService.syncTransaction(operation.payload);
                } else {
                    await supabaseService.deleteTransaction(operation.payload.id);
                }
                break;

            case 'category':
                if (operation.action === 'sync') {
                    await supabaseService.syncCategory(operation.payload);
                } else {
                    await supabaseService.deleteCategory(operation.payload.id);
                }
                break;

            case 'account':
                if (operation.action === 'sync') {
                    await supabaseService.syncAccount(operation.payload);
                } else {
                    await supabaseService.deleteAccount(operation.payload.id);
                }
                break;

            case 'person':
                if (operation.action === 'sync') {
                    await supabaseService.syncPerson(operation.payload);
                } else {
                    await supabaseService.deletePerson(operation.payload.id);
                }
                break;

            case 'settings':
                await supabaseService.syncSettings(operation.payload);
                break;

            case 'event':
                if (operation.action === 'sync') {
                    await supabaseService.syncEvent(operation.payload);
                } else {
                    await supabaseService.deleteEvent(operation.payload.id);
                }
                break;

            case 'sharedExpense':
                if (operation.action === 'sync') {
                    await supabaseService.syncSharedExpense(operation.payload);
                } else {
                    await supabaseService.deleteSharedExpense(operation.payload.id);
                }
                break;

            case 'recurring':
                if (operation.action === 'sync') {
                    await supabaseService.syncRecurring(operation.payload);
                } else {
                    await supabaseService.deleteRecurring(operation.payload.id);
                }
                break;

            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }

    private removeFromQueue(id: string): void {
        this.queue = this.queue.filter(op => op.id !== id);
        this.saveQueue();
    }

    /**
     * Get current queue state
     */
    getQueue(): QueuedOperation[] {
        return [...this.queue];
    }

    /**
     * Get queue length
     */
    get length(): number {
        return this.queue.length;
    }

    /**
     * Check if currently online
     */
    get online(): boolean {
        return this.isOnline;
    }

    /**
     * Check if queue is being processed
     */
    get processing(): boolean {
        return this.isProcessing;
    }

    /**
     * Subscribe to queue changes
     */
    subscribe(listener: (queue: QueuedOperation[]) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const queue = this.getQueue();
        this.listeners.forEach(listener => listener(queue));
    }

    /**
     * Clear all queued operations (use with caution)
     */
    clear(): void {
        this.queue = [];
        this.saveQueue();
        this.notifyListeners();
    }

    /**
     * Force retry all failed operations
     */
    retryAll(): Promise<{ success: number; failed: number }> {
        // Reset retry counts
        this.queue.forEach(op => {
            op.retries = 0;
            op.lastError = undefined;
        });
        this.saveQueue();
        return this.processQueue();
    }
}

// Export singleton instance
export const offlineQueue = new OfflineQueue();
