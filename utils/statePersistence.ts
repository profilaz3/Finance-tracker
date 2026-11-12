import { AppState } from '../types';

export interface PersistedStatePreferences {
  baseCurrency: AppState['baseCurrency'];
  theme: AppState['theme'];
  language: AppState['language'];
  isGuest?: boolean;
}

export interface PersistedStateSegments {
  preferences: PersistedStatePreferences;
  transactions: AppState['transactions'];
  categories: AppState['categories'];
  accounts: AppState['accounts'];
  people: AppState['people'];
  userProfile?: AppState['userProfile'];
  rates: AppState['rates'];
  templates: AppState['templates'];
  recurringTransactions: AppState['recurringTransactions'];
  events: AppState['events'];
  sharedExpenses: AppState['sharedExpenses'];
}

export type PersistedStateSegmentName = keyof PersistedStateSegments;

export const STATE_SEGMENT_NAMES: PersistedStateSegmentName[] = [
  'preferences',
  'transactions',
  'categories',
  'accounts',
  'people',
  'userProfile',
  'rates',
  'templates',
  'recurringTransactions',
  'events',
  'sharedExpenses',
];

const stripInlineAvatar = <T extends { avatar?: string }>(profile: T): T => ({
  ...profile,
  avatar: profile.avatar?.startsWith('data:') ? undefined : profile.avatar,
});

export const buildStateSegments = (state: AppState): PersistedStateSegments => ({
  preferences: {
    baseCurrency: state.baseCurrency,
    theme: state.theme,
    language: state.language,
    isGuest: state.isGuest,
  },
  transactions: state.transactions,
  categories: state.categories,
  accounts: state.accounts,
  people: state.people.map(person => stripInlineAvatar(person)),
  userProfile: state.userProfile ? stripInlineAvatar(state.userProfile) : undefined,
  rates: state.rates,
  templates: state.templates,
  recurringTransactions: state.recurringTransactions,
  events: state.events,
  sharedExpenses: state.sharedExpenses,
});

export const mergeStateSegments = (
  baseState: AppState,
  segments: Partial<PersistedStateSegments>
): AppState => ({
  ...baseState,
  baseCurrency: segments.preferences?.baseCurrency ?? baseState.baseCurrency,
  theme: segments.preferences?.theme ?? baseState.theme,
  language: segments.preferences?.language ?? baseState.language,
  isGuest: segments.preferences?.isGuest ?? baseState.isGuest,
  transactions: segments.transactions ?? baseState.transactions,
  categories: segments.categories ?? baseState.categories,
  accounts: segments.accounts ?? baseState.accounts,
  people: segments.people ?? baseState.people,
  userProfile: segments.userProfile ?? baseState.userProfile,
  rates: segments.rates ?? baseState.rates,
  templates: segments.templates ?? baseState.templates,
  recurringTransactions: segments.recurringTransactions ?? baseState.recurringTransactions,
  events: segments.events ?? baseState.events,
  sharedExpenses: segments.sharedExpenses ?? baseState.sharedExpenses,
});
