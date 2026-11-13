
export type Currency = 'EUR' | 'USD' | 'RSD';

export type TransactionType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  subcategories: string[];
  color: string;
  icon?: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'digital' | 'other';
  currency: Currency;
  color: string;
  initialBalance?: number;
  icon?: string;
  order?: number;
}

export interface Person {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  defaultCurrency: Currency;
  balances: Record<Currency, number>; // positive = they owe you, negative = you owe them
}

export interface Transaction {
  id: string;
  date: string; // ISO string
  amount: number;
  currency: Currency;
  categoryId: string;
  accountId: string;
  personId?: string; // Linked to a person profile
  subcategory?: string;
  note?: string;
  type: TransactionType;
  receiptData?: {
    items: { name: string; price: number; quantity: number }[];
    total: number;
    merchant: string;
  };
  fees?: number;
  eventId?: string;
  /** Shared by both legs of an account-to-account transfer. */
  transferId?: string;
  splitDetails?: {
    totalAmount: number;
    myPortion: number;
    shares: { personId: string; amount: number; percentage?: number; isPaid?: boolean }[];
    splitMethod: 'equal' | 'exact' | 'percentage';
  };
}

export interface ExchangeRates {
  base: Currency;
  date: string;
  rates: Record<Currency, number>;
}



export interface Event {
  id: string;
  name: string;
  description?: string;
  startDate?: string; // ISO string
  endDate?: string; // ISO string
  personIds: string[];
  sharedEmails?: string[]; // Emails of shared users
  icon?: string;
  color?: string;
  imageUrl?: string;
  status: 'active' | 'completed' | 'archived';
  userId?: string; // Owner ID
}

export interface SharedExpense {
  id: string;
  eventId: string;
  name: string;
  amount: number;
  currency: Currency;
  paidBy: string;
  sharedWith: string[];
  splitType?: 'equal' | 'exact';
  splitDetails?: Record<string, number>;
  date: string;
  category?: string;
}


export interface EventDebt {
  from: string;
  to: string;
  amount: number;
  currency: Currency;
}

// Split Expense Types
export type SplitMode = 'i_paid' | 'they_paid';
export type SplitMethod = 'equal' | 'exact' | 'percentage';

export interface SplitShare {
  personId: string;
  amount: number;
  percentage?: number;
  isIncluded: boolean;
}

// Split details stored on a transaction
export interface TransactionSplitShare {
  personId: string;
  amount: number;
  percentage?: number;
  isPaid?: boolean;
}

export interface TransactionSplitDetails {
  totalAmount: number;
  myPortion: number;
  shares: TransactionSplitShare[];
  splitMethod: SplitMethod;
}

export interface SplitResult {
  transactions: Transaction[];
  balanceUpdates: {
    personId: string;
    currency: Currency;
    delta: number;
  }[];
}

// Transaction template for quick re-entry
export interface TransactionTemplate {
  id: string;
  name: string;
  amount?: number;
  currency: Currency;
  categoryId: string;
  accountId: string;
  type: TransactionType;
  note?: string;
  subcategory?: string;
  usageCount: number;
  lastUsed?: string;
}

// Recurring transaction
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  categoryId: string;
  accountId: string;
  type: TransactionType;
  note?: string;
  subcategory?: string;
  frequency: RecurrenceFrequency;
  startDate: string; // ISO date
  endDate?: string; // Optional end date
  lastGenerated?: string; // Last time a transaction was auto-generated
  nextDue: string; // Next due date
  isActive: boolean;
}

export interface AppState {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  people: Person[];
  userProfile?: Person;  // User's own profile (separate from people list)
  baseCurrency: Currency;
  rates: ExchangeRates;
  templates: TransactionTemplate[];
  recurringTransactions: RecurringTransaction[];

  theme: 'neon' | 'racing-orange' | 'graphite' | 'coffee' | 'gilded' | 'crimson-red' | 'lime-dark' | 'sterling' | 'canyon' | 'cyberpunk-pink' | 'harbor' | 'galaxy' | 'evergreen' | 'linen' | 'mist' | 'light';
  language: 'en' | 'sr';

  events: Event[];
  sharedExpenses: SharedExpense[];
  isGuest?: boolean;
}

export type View = 'dashboard' | 'transactions' | 'analytics' | 'settings' | 'insights' | 'people' | 'calendar' | 'events';
