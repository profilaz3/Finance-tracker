/**
 * Sync error classification
 *
 * The offline queue retries transient failures (network, timeouts, 5xx, expired
 * auth) forever with backoff. Only errors the server will keep rejecting no
 * matter how often we retry (validation, constraint, RLS, unknown column) are
 * treated as permanent and moved to the dead-letter list.
 */

export class SyncRequestError extends Error {
    readonly status?: number;
    readonly code?: string;
    readonly details?: string;
    readonly hint?: string;

    constructor(source: { message?: string; code?: string; details?: string; hint?: string }, status?: number) {
        super(source.message || `Sync request failed${status ? ` with status ${status}` : ''}`);
        this.name = 'SyncRequestError';
        this.status = status;
        this.code = source.code;
        this.details = source.details;
        this.hint = source.hint;
    }
}

/** Explicitly permanent error, e.g. a malformed queued payload. */
export class PermanentSyncError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PermanentSyncError';
    }
}

/** Wrap a Supabase/PostgREST `{ error, status }` result so the HTTP status survives the throw. */
export const toSyncError = (
    error: { message?: string; code?: string; details?: string; hint?: string },
    status?: number
): SyncRequestError => new SyncRequestError(error, status);

const TRANSIENT_HTTP_STATUSES = new Set([401, 408, 425, 429]);
// SQLSTATE classes that will fail again on retry: cardinality, data exception,
// integrity constraint, syntax/access rule (incl. RLS 42501), WITH CHECK, raised exception.
const PERMANENT_SQLSTATE_CLASSES = new Set(['21', '22', '23', '42', '44', 'P0']);
// PostgREST JWT errors clear up after a token refresh.
const TRANSIENT_POSTGREST_CODES = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', 'PGRST301', 'PGRST302', 'PGRST303']);

const readStatus = (error: Record<string, unknown>): number | undefined => {
    const raw = error.status ?? error.statusCode;
    const status = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(status) && status > 0 ? status : undefined;
};

export const isPermanentSyncError = (error: unknown): boolean => {
    if (error instanceof PermanentSyncError) return true;
    if (!error || typeof error !== 'object') return false;

    const record = error as Record<string, unknown>;
    const status = readStatus(record);
    if (status !== undefined) {
        if (status >= 500 || TRANSIENT_HTTP_STATUSES.has(status)) return false;
        if (status >= 400) return true;
    }

    const code = typeof record.code === 'string' ? record.code : '';
    if (code.startsWith('PGRST')) {
        return !TRANSIENT_POSTGREST_CODES.has(code);
    }
    if (/^[0-9A-Z]{5}$/.test(code)) {
        return PERMANENT_SQLSTATE_CLASSES.has(code.slice(0, 2));
    }

    // Network failures, timeouts, "User not authenticated", unknown errors: retry.
    return false;
};
