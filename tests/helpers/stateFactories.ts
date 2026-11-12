import { DEFAULT_RATES, INITIAL_ACCOUNTS, INITIAL_CATEGORIES } from '../../constants';
import { AppState } from '../../types';

export const createBaseState = (): AppState => ({
  transactions: [],
  categories: INITIAL_CATEGORIES.map(category => ({
    ...category,
    subcategories: [...category.subcategories],
  })),
  accounts: INITIAL_ACCOUNTS.map(account => ({ ...account })),
  people: [],
  userProfile: undefined,
  baseCurrency: 'RSD',
  rates: {
    ...DEFAULT_RATES,
    rates: { ...DEFAULT_RATES.rates },
  },
  templates: [],
  recurringTransactions: [],
  theme: 'lime-dark',
  language: 'en',
  events: [],
  sharedExpenses: [],
  isGuest: false,
});
