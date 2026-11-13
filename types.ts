
export type Currency = 'EUR' | 'USD' | 'RSD';

export type TransactionType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  subcategories: string[];
  color: string;
  icon?: string;
  /** Team this item is shared with; null asks the server to take it out of its team. */
  teamId?: string | null;
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
  /** Team this item is shared with; null asks the server to take it out of its team. */
  teamId?: string | null;
}

export interface Person {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  defaultCurrency: Currency;
  balances: Record<Currency, number>; // positive = they owe you, negative = you owe them
  /** Team this item is shared with; null asks the server to take it out of its team. */
  teamId?: string | null;
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
  /** Team this item is shared with; null asks the server to take it out of its team. */
  teamId?: string | null;
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
  /** Team this item is shared with; null asks the server to take it out of its team. */
  teamId?: string | null;
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
  /** Creator's user id; on a team item only the creator's device generates occurrences. */
  userId?: string;
  /** Team this item is shared with; null asks the server to take it out of its team. */
  teamId?: string | null;
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

  /** Paper look: light/dark/system, accent and glass level. */
  appearance?: Appearance;
  /** Ordered Home blocks; undefined means the default layout. */
  homeLayout?: HomeBlock[];
  /** Monthly budget in the base currency; null or undefined means none set. */
  budget?: Budget | null;
  /** Teams the signed-in user belongs to; undefined until fetched. */
  teams?: Team[];
}

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamMember {
  /** Lower-cased invite email; membership is matched on the signed-in email. */
  email: string;
  /** Set once the member is linked to an account (always for the owner). */
  userId?: string;
  role: TeamRole;
}

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  color?: string;
  createdAt?: string;
  members: TeamMember[];
}

export type AppearanceMode = 'light' | 'dark' | 'system';
export type AccentName = 'teal' | 'ember' | 'iris' | 'ink';
export type GlassLevel = 'frosted' | 'clear' | 'solid';

export interface Appearance {
  mode: AppearanceMode;
  accent: AccentName;
  glass: GlassLevel;
}

export type HomeBlockType =
  | 'budget'
  | 'networth'
  | 'categories'
  | 'daily'
  | 'wallets'
  | 'people'
  | 'event'
  | 'upcoming'
  | 'recent'
  | 'rates'
  | 'quickadd';

export type HomeBlockSize = 's' | 'm' | 'l';

export interface HomeBlock {
  id: string;
  type: HomeBlockType;
  /** Style key; valid values depend on the block type (see components/home/blockRegistry). */
  style: string;
  size: HomeBlockSize;
}

export interface Budget {
  /** Monthly total in the base currency. */
  monthly: number;
  /** Optional per-category monthly limits, keyed by category id, in the base currency. */
  categoryLimits: Record<string, number>;
}

export type View = 'dashboard' | 'transactions' | 'analytics' | 'settings' | 'insights' | 'people' | 'calendar' | 'events' | 'budgets';
