
import { Transaction, Category, AppState, ExchangeRates, Account, Person, Event } from '../types';
import { INITIAL_CATEGORIES, INITIAL_ACCOUNTS, DEFAULT_RATES } from '../constants';
import { safeValidateAppState } from '../schemas';
import { CONFIG } from '../config';
import { sanitizeLoadedState } from '../utils/loadedStateSanitizer';
import { safeGet, safeRemove } from '../utils/safeStorage';
import { writeStorage } from './storageHealth';
import {
  buildStateSegments,
  mergeStateSegments,
  PersistedStateSegmentName,
  PersistedStateSegments,
  STATE_SEGMENT_NAMES,
} from '../utils/statePersistence';

const STORAGE_KEY = CONFIG.STORAGE_KEY;
const SAVE_DEBOUNCE_MS = CONFIG.SAVE_DEBOUNCE_MS;
const STATE_SEGMENT_META_KEY = `${STORAGE_KEY}:meta`;
const STATE_SEGMENT_KEYS = STATE_SEGMENT_NAMES.reduce((acc, segmentName) => {
  acc[segmentName] = `${STORAGE_KEY}:${segmentName}`;
  return acc;
}, {} as Record<PersistedStateSegmentName, string>);
const STATE_SEGMENT_VERSION = 1;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let latestState: AppState | null = null;
let latestSerializedSegments: Partial<Record<PersistedStateSegmentName, string>> | null = null;

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
  'ocean': 'harbor',
  'rose-gold': 'gilded',
  'electric-blue': 'sterling',
  'sunset-orange': 'canyon'
};

export const normalizeTheme = (theme?: string): AppState['theme'] => {
  if (!theme) return 'neon';
  const mappedTheme = LEGACY_THEME_MAP[theme] ?? theme;
  return VALID_THEMES.includes(mappedTheme as AppState['theme']) ? (mappedTheme as AppState['theme']) : 'neon';
};

const performSave = () => {
    if (latestState) {
        const segments = buildStateSegments(latestState);
        const nextSerializedSegments = {} as Record<PersistedStateSegmentName, string>;

        STATE_SEGMENT_NAMES.forEach(segmentName => {
          const serializedValue = JSON.stringify(segments[segmentName]) ?? 'null';

          if (latestSerializedSegments?.[segmentName] !== serializedValue) {
            // Failures (quota) are reported to the UI; the segment is retried on the next save.
            if (!writeStorage('state', STATE_SEGMENT_KEYS[segmentName], serializedValue)) {
              const previous = latestSerializedSegments?.[segmentName];
              if (previous !== undefined) nextSerializedSegments[segmentName] = previous;
              return;
            }
          }
          nextSerializedSegments[segmentName] = serializedValue;
        });

        writeStorage('state', STATE_SEGMENT_META_KEY, JSON.stringify({
          version: STATE_SEGMENT_VERSION,
          updatedAt: new Date().toISOString(),
        }));
        safeRemove(STORAGE_KEY);
        latestSerializedSegments = nextSerializedSegments;
    }
};

const hasSegmentedState = (): boolean => {
  const meta = safeGet<{ version?: number } | null>(STATE_SEGMENT_META_KEY, null);
  if (meta?.version === STATE_SEGMENT_VERSION) {
    return true;
  }

  try {
    return STATE_SEGMENT_NAMES.some(segmentName => localStorage.getItem(STATE_SEGMENT_KEYS[segmentName]) !== null);
  } catch {
    return false;
  }
};

const readSegmentedState = (baseState: AppState): AppState => {
  const segments: Partial<PersistedStateSegments> = {};

  STATE_SEGMENT_NAMES.forEach(segmentName => {
    try {
      const storedValue = localStorage.getItem(STATE_SEGMENT_KEYS[segmentName]);
      if (storedValue !== null) {
        (segments as Record<PersistedStateSegmentName, unknown>)[segmentName] = JSON.parse(storedValue);
      }
    } catch {
      // Ignore malformed segment data and fall back to base state for that slice
    }
  });

  return mergeStateSegments(baseState, segments);
};

/** Legacy fixed ids (c1-c8, acc1-acc3) were global primary keys shared by every user. */
const LEGACY_DEFAULT_ID = /^(c[1-8]|acc[1-3])$/;

const createDefaultId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Default categories for a new user. User-editable defaults get fresh UUIDs so
 * they never collide with another user's rows; app-internal categories
 * (internal-transfer, debt/loan repayment) keep their fixed ids.
 */
export const createDefaultCategories = (): Category[] =>
  INITIAL_CATEGORIES.map(category => ({
    ...category,
    subcategories: [...category.subcategories],
    id: LEGACY_DEFAULT_ID.test(category.id) ? createDefaultId() : category.id,
  }));

export const createDefaultAccounts = (): Account[] =>
  INITIAL_ACCOUNTS.map((account, index) => ({
    ...account,
    id: createDefaultId(),
    order: index,
  }));

export const createInitialState = (): AppState => ({
  transactions: [],
  categories: createDefaultCategories(),
  accounts: createDefaultAccounts(),
  people: [],
  userProfile: undefined,
  baseCurrency: 'RSD',
  rates: DEFAULT_RATES,
  templates: [],
  recurringTransactions: [],

  theme: 'lime-dark',
  language: 'en',
  events: [],
  sharedExpenses: [],
  isGuest: false
});

export const loadState = (): AppState => {
  try {
    const baseState = createInitialState();
    const mergedState = hasSegmentedState()
      ? readSegmentedState(baseState)
      : (() => {
          const serialized = localStorage.getItem(STORAGE_KEY);
          if (!serialized) return baseState;
          const parsed = JSON.parse(serialized);
          return { ...baseState, ...parsed };
        })();

    // Ensure arrays exist
    if (!mergedState.accounts || mergedState.accounts.length === 0) mergedState.accounts = baseState.accounts;
    if (!mergedState.people) mergedState.people = [];
    if (!mergedState.events) mergedState.events = [];
    if (!mergedState.sharedExpenses) mergedState.sharedExpenses = [];
    if (!mergedState.templates) mergedState.templates = [];
    if (!mergedState.recurringTransactions) mergedState.recurringTransactions = [];
    mergedState.theme = normalizeTheme(mergedState.theme);
    if (!mergedState.language) mergedState.language = 'en';

    // Ensure Special Categories exist
    if (!mergedState.categories.find((c: Category) => c.id === 'debt-repayment')) {
      mergedState.categories.push(INITIAL_CATEGORIES.find(c => c.id === 'debt-repayment')!);
    }
    if (!mergedState.categories.find((c: Category) => c.id === 'loan-repayment')) {
      mergedState.categories.push(INITIAL_CATEGORIES.find(c => c.id === 'loan-repayment')!);
    }

    // Force update colors for default accounts
    const defaultColors: Record<string, string> = {
      'acc1': '#10b981',
      'acc2': '#3b82f6',
      'acc3': '#a855f7'
    };
    mergedState.accounts = mergedState.accounts.map((acc: Account) => {
      if (defaultColors[acc.id]) {
        return { ...acc, color: defaultColors[acc.id] };
      }
      return acc;
    });

    const sanitizedState = sanitizeLoadedState(mergedState);

    // Validate the merged state
    const validationResult = safeValidateAppState(sanitizedState);
    if (!validationResult.success) {
      const sampleIssues = validationResult.error.issues
        .slice(0, 5)
        .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
      console.warn(`State validation warnings (${validationResult.error.issues.length} issues)`, sampleIssues);
      // Continue with merged state even if validation has issues
      // This ensures backwards compatibility
      return sanitizedState;
    }

    return {
      ...sanitizedState,
      ...validationResult.data,
      rates: validationResult.data.rates ?? sanitizedState.rates,
    };
  } catch (e) {
    console.error("Failed to load state", e);
    return createInitialState();
  }
};

export const saveState = (state: AppState) => {
  latestState = state;

  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(performSave, SAVE_DEBOUNCE_MS);
};

export const flushSaveState = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  performSave();
};

const SEGMENT_NAME_BY_KEY = new Map<string, PersistedStateSegmentName>(
  STATE_SEGMENT_NAMES.map(segmentName => [STATE_SEGMENT_KEYS[segmentName], segmentName])
);

/**
 * Apply a segment written by another tab (`storage` event) to this tab's state.
 * Returns null when the key is not a state segment or the value is unreadable.
 * The incoming value is recorded as already persisted so it is not echoed back.
 */
export const applyExternalSegmentChange = (
  state: AppState,
  key: string | null,
  newValue: string | null
): AppState | null => {
  if (!key) return null;
  const segmentName = SEGMENT_NAME_BY_KEY.get(key);
  if (!segmentName || newValue === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(newValue);
  } catch {
    return null;
  }
  if (parsed === null || parsed === undefined) return null;

  latestSerializedSegments = { ...(latestSerializedSegments ?? {}), [segmentName]: newValue };
  return mergeStateSegments(state, { [segmentName]: parsed } as Partial<PersistedStateSegments>);
};

export const clearPersistedState = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  latestState = null;
  latestSerializedSegments = null;

  safeRemove(STORAGE_KEY);
  safeRemove(STATE_SEGMENT_META_KEY);
  STATE_SEGMENT_NAMES.forEach(segmentName => {
    safeRemove(STATE_SEGMENT_KEYS[segmentName]);
  });
};

// Helper to download a file
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface ExportOptions {
  format: 'csv' | 'json';
  dateFrom?: string;
  dateTo?: string;
  includeEvents?: boolean;
}

export const exportToCSV = (transactions: Transaction[], categories: Category[], accounts: Account[], people: Person[], events?: Event[]) => {
  const headers = ['ID', 'Date', 'Time', 'Type', 'Category', 'Subcategory', 'Amount', 'Currency', 'Account', 'Person', 'Event', 'Fees', 'Note'];

  const rows = transactions.map(t => {
    const catName = categories.find(c => c.id === t.categoryId)?.name || 'Unknown';
    const accName = accounts.find(a => a.id === t.accountId)?.name || 'Unknown';
    const personName = t.personId ? people.find(p => p.id === t.personId)?.name || '' : '';
    const eventName = t.eventId && events ? events.find(e => e.id === t.eventId)?.name || '' : '';
    const date = new Date(t.date);

    return [
      t.id,
      date.toISOString().split('T')[0],
      date.toLocaleTimeString(),
      t.type,
      `"${catName}"`,
      `"${t.subcategory || ''}"`,
      t.amount,
      t.currency,
      `"${accName}"`,
      `"${personName}"`,
      `"${eventName}"`,
      t.fees || 0,
      `"${(t.note || '').replace(/"/g, '""')}"`
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  downloadFile(csvContent, `finance_export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
};

export const exportToJSON = (transactions: Transaction[], categories: Category[], accounts: Account[], people: Person[], events?: Event[]) => {
  const exportData = {
    exportDate: new Date().toISOString(),
    totalTransactions: transactions.length,
    transactions: transactions.map(t => ({
      ...t,
      categoryName: categories.find(c => c.id === t.categoryId)?.name,
      accountName: accounts.find(a => a.id === t.accountId)?.name,
      personName: t.personId ? people.find(p => p.id === t.personId)?.name : undefined,
      eventName: t.eventId && events ? events.find(e => e.id === t.eventId)?.name : undefined
    })),
    summary: {
      totalIncome: transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
      totalExpense: transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      byCategory: categories.map(cat => ({
        name: cat.name,
        type: cat.type,
        total: transactions.filter(t => t.categoryId === cat.id).reduce((sum, t) => sum + t.amount, 0)
      })).filter(c => c.total > 0),
      byAccount: accounts.map(acc => ({
        name: acc.name,
        total: transactions.filter(t => t.accountId === acc.id).reduce((sum, t) => t.type === 'income' ? sum + t.amount : sum - t.amount, 0)
      }))
    }
  };

  downloadFile(JSON.stringify(exportData, null, 2), `finance_export_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
};

export const exportWithOptions = (
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  people: Person[],
  events: Event[],
  options: ExportOptions
) => {
  let filtered = [...transactions];

  // Apply date filters
  if (options.dateFrom) {
    filtered = filtered.filter(t => t.date >= options.dateFrom!);
  }
  if (options.dateTo) {
    const dateTo = new Date(options.dateTo);
    dateTo.setDate(dateTo.getDate() + 1); // Include the end date
    filtered = filtered.filter(t => t.date < dateTo.toISOString());
  }

  // Export based on format
  if (options.format === 'json') {
    exportToJSON(filtered, categories, accounts, people, options.includeEvents ? events : undefined);
  } else {
    exportToCSV(filtered, categories, accounts, people, options.includeEvents ? events : undefined);
  }

  return filtered.length;
};
