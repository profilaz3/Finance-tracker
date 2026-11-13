/**
 * Storage health
 *
 * localStorage writes can fail (quota exceeded, private mode, disabled storage).
 * Those failures used to be swallowed silently. Writers report them here and the
 * UI subscribes to show a warning.
 */

export type StorageErrorScope = 'state' | 'queue' | 'dead-letter';

export interface StorageErrorInfo {
    scope: StorageErrorScope;
    key: string;
    quotaExceeded: boolean;
    error: unknown;
}

type StorageErrorListener = (info: StorageErrorInfo) => void;

const listeners = new Set<StorageErrorListener>();

export const isQuotaExceededError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const { name, code } = error as { name?: string; code?: number };
    return (
        name === 'QuotaExceededError' ||
        name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        code === 22 ||
        code === 1014
    );
};

export const reportStorageError = (scope: StorageErrorScope, key: string, error: unknown): void => {
    const info: StorageErrorInfo = { scope, key, quotaExceeded: isQuotaExceededError(error), error };
    console.error(`Local storage write failed (${scope}, ${key})`, error);
    listeners.forEach(listener => {
        try {
            listener(info);
        } catch {
            // A broken listener must not break persistence
        }
    });
};

export const subscribeStorageErrors = (listener: StorageErrorListener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/**
 * Write a value, reporting failures. Returns false when the write failed.
 */
export const writeStorage = (scope: StorageErrorScope, key: string, serialized: string): boolean => {
    try {
        localStorage.setItem(key, serialized);
        return true;
    } catch (error) {
        reportStorageError(scope, key, error);
        return false;
    }
};
