/**
 * Remote-state hydration
 *
 * Pure helpers that merge a server snapshot into local state without losing
 * local work:
 * - a slice whose fetch failed keeps its local value (never replaced by []);
 * - writes that are still pending (queued or debounced) are re-applied on top
 *   of the fetched snapshot, so offline edits survive a startup fetch;
 * - a brand-new account keeps its locally generated default categories and
 *   accounts, which are then seeded to the server.
 */

import type { Account, AppState, Category } from '../types';
import type { QueuedEntityType, QueuedOperation } from './offlineQueue';
import type { SettingsPrefs, SettingsSyncPayload } from '../utils/settingsSync';
import { normalizeTheme } from './storageService';

const applyPrefs = (acc: AppState, prefs: SettingsPrefs): Partial<AppState> => ({
    appearance: prefs.appearance ?? acc.appearance,
    homeLayout: prefs.homeLayout ?? acc.homeLayout,
    budget: prefs.budget !== undefined ? prefs.budget : acc.budget,
    paymentDetails: prefs.payment !== undefined ? prefs.payment : acc.paymentDetails,
});

export type RemoteSlice =
    | 'transactions'
    | 'categories'
    | 'accounts'
    | 'people'
    | 'settings'
    | 'events'
    | 'sharedExpenses'
    | 'recurringTransactions'
    | 'teams';

export interface RemoteStateResult {
    /** Only slices that were fetched successfully are present. A failed slice is absent, never an empty list. */
    state: Partial<AppState>;
    failedSlices: RemoteSlice[];
    /** False when the user has no settings row yet (new account). */
    hasSettingsRow: boolean;
}

export type PendingWrite = Pick<QueuedOperation, 'type' | 'action' | 'payload'>;

type ListSlice = 'transactions' | 'categories' | 'accounts' | 'people' | 'events' | 'sharedExpenses' | 'recurringTransactions';

const SLICE_BY_TYPE: Record<Exclude<QueuedEntityType, 'settings'>, ListSlice> = {
    transaction: 'transactions',
    category: 'categories',
    account: 'accounts',
    person: 'people',
    event: 'events',
    sharedExpense: 'sharedExpenses',
    recurring: 'recurringTransactions',
};

const LIST_SLICES: ListSlice[] = ['transactions', 'categories', 'accounts', 'people', 'events', 'sharedExpenses', 'recurringTransactions'];

/** Ids that are shared by every user (legacy defaults and app-internal categories); never seeded to the server. */
export const SHARED_DEFAULT_IDS = new Set([
    'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
    'acc1', 'acc2', 'acc3',
    'internal-transfer', 'debt-repayment', 'loan-repayment',
]);

type Identified = { id: string };

const upsertById = <T extends Identified>(list: T[], item: T): T[] => {
    const index = list.findIndex(entry => entry.id === item.id);
    if (index === -1) return [...list, item];
    const next = list.slice();
    next[index] = item;
    return next;
};

/**
 * Replay pending writes over a state snapshot, in queue order.
 */
export function applyPendingOperations(state: AppState, operations: PendingWrite[]): AppState {
    return operations.reduce<AppState>((acc, op) => {
        if (op.type === 'settings') {
            if (op.action !== 'sync' || !op.payload) return acc;
            const settings = op.payload as SettingsSyncPayload;
            return {
                ...acc,
                baseCurrency: settings.baseCurrency ?? acc.baseCurrency,
                theme: normalizeTheme(settings.theme ?? acc.theme),
                language: settings.language ?? acc.language,
                userProfile: settings.userProfile ?? acc.userProfile,
                ...(settings.prefs ? applyPrefs(acc, settings.prefs) : {}),
            };
        }

        const slice = SLICE_BY_TYPE[op.type];
        const id = op.payload?.id;
        if (!slice || !id) return acc;

        const list = acc[slice] as unknown as Identified[];
        const nextList = op.action === 'delete'
            ? list.filter(entry => entry.id !== id)
            : upsertById(list, op.payload as Identified);

        return { ...acc, [slice]: nextList };
    }, state);
}

/**
 * Merge a server snapshot into the current local state.
 */
export function mergeRemoteState(prev: AppState, remote: RemoteStateResult, pending: PendingWrite[]): AppState {
    const next: AppState = { ...prev };
    const remoteState = remote.state;

    LIST_SLICES.forEach(slice => {
        const remoteList = remoteState[slice];
        if (remoteList === undefined) return; // fetch failed: keep local

        // New account: keep the local defaults instead of wiping them (they get seeded).
        if ((slice === 'categories' || slice === 'accounts') && remoteList.length === 0 && prev[slice].length > 0) {
            return;
        }

        (next as unknown as Record<ListSlice, unknown>)[slice] = remoteList;
    });

    if (remote.hasSettingsRow) {
        next.baseCurrency = remoteState.baseCurrency ?? prev.baseCurrency;
        next.theme = normalizeTheme(remoteState.theme ?? prev.theme);
        next.language = remoteState.language ?? prev.language;
        next.userProfile = remoteState.userProfile ?? prev.userProfile;
        next.appearance = remoteState.appearance ?? prev.appearance;
        next.homeLayout = remoteState.homeLayout ?? prev.homeLayout;
        next.budget = remoteState.budget !== undefined ? remoteState.budget : prev.budget;
        next.paymentDetails = remoteState.paymentDetails !== undefined ? remoteState.paymentDetails : prev.paymentDetails;
    }

    // Teams are managed online only (never queued), so the server list wins when it was fetched.
    if (remoteState.teams !== undefined) {
        next.teams = remoteState.teams;
    }

    return applyPendingOperations(next, pending);
}

/**
 * Local defaults to push for a brand-new account (server returned no rows).
 */
export function collectSeedRecords(local: AppState, remote: RemoteStateResult): { categories: Category[]; accounts: Account[] } {
    const remoteCategories = remote.state.categories;
    const remoteAccounts = remote.state.accounts;

    return {
        categories: remoteCategories && remoteCategories.length === 0
            ? local.categories.filter(category => !SHARED_DEFAULT_IDS.has(category.id))
            : [],
        accounts: remoteAccounts && remoteAccounts.length === 0
            ? local.accounts.filter(account => !SHARED_DEFAULT_IDS.has(account.id))
            : [],
    };
}
