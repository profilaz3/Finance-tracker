// zod/mini keeps the same validation semantics with a tree-shakable functional API.
// It cuts roughly 70 KB from the startup chunk compared with the classic `zod` import.
import * as z from 'zod/mini';

// Base types
/** Team link on shareable items; null means "take it out of its team" until synced. */
export const TeamIdSchema = z.optional(z.nullable(z.string().check(z.minLength(1))));

export const CurrencySchema = z.enum(['EUR', 'USD', 'RSD']);
export const TransactionTypeSchema = z.enum(['income', 'expense']);

// Category
export const CategorySchema = z.object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1)),
    type: TransactionTypeSchema,
    subcategories: z._default(z.array(z.string()), []),
    color: z.string(),
    icon: z.optional(z.string()),
    teamId: TeamIdSchema
});

// Account
export const AccountSchema = z.object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1)),
    type: z.enum(['cash', 'bank', 'digital', 'other']),
    currency: CurrencySchema,
    color: z.string(),
    initialBalance: z._default(z.optional(z.number()), 0),
    icon: z.optional(z.string()),
    order: z.optional(z.number()),
    teamId: TeamIdSchema
});

// Person
export const PersonSchema = z.object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1)),
    avatar: z.optional(z.string()),
    color: z.string(),
    defaultCurrency: CurrencySchema,
    balances: z._default(z.record(CurrencySchema, z.number()), { EUR: 0, USD: 0, RSD: 0 }),
    teamId: TeamIdSchema
});

// Receipt Data
export const ReceiptItemSchema = z.object({
    name: z.string(),
    price: z.number(),
    quantity: z._default(z.number(), 1)
});

export const ReceiptDataSchema = z.object({
    items: z.array(ReceiptItemSchema),
    total: z.number(),
    merchant: z.string()
});

// Split Details
export const SplitShareSchema = z.object({
    personId: z.string(),
    amount: z.number(),
    percentage: z.optional(z.number()),
    isPaid: z.optional(z.boolean())
});

export const SplitDetailsSchema = z.object({
    totalAmount: z.number(),
    myPortion: z.number(),
    shares: z.array(SplitShareSchema),
    splitMethod: z.enum(['equal', 'exact', 'percentage'])
});

// Transaction
export const TransactionSchema = z.object({
    id: z.string().check(z.minLength(1)),
    date: z.string(), // ISO string
    amount: z.number().check(z.minimum(0)),
    currency: CurrencySchema,
    categoryId: z.string(),
    accountId: z.string(),
    personId: z.optional(z.string()),
    subcategory: z.optional(z.string()),
    note: z.optional(z.string()),
    type: TransactionTypeSchema,
    receiptData: z.optional(ReceiptDataSchema),
    fees: z.optional(z.number()),
    eventId: z.optional(z.string()),
    transferId: z.optional(z.string()),
    splitDetails: z.optional(SplitDetailsSchema),
    teamId: TeamIdSchema
});

// Transaction template
export const TransactionTemplateSchema = z.object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1)),
    amount: z.optional(z.number()),
    currency: CurrencySchema,
    categoryId: z.string(),
    accountId: z.string(),
    type: TransactionTypeSchema,
    note: z.optional(z.string()),
    subcategory: z.optional(z.string()),
    usageCount: z._default(z.number(), 0),
    lastUsed: z.optional(z.string())
});

// Recurring transaction
export const RecurrenceFrequencySchema = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']);

export const RecurringTransactionSchema = z.object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1)),
    amount: z.number().check(z.minimum(0)),
    currency: CurrencySchema,
    categoryId: z.string(),
    accountId: z.string(),
    type: TransactionTypeSchema,
    note: z.optional(z.string()),
    subcategory: z.optional(z.string()),
    frequency: RecurrenceFrequencySchema,
    startDate: z.string(),
    endDate: z.optional(z.string()),
    lastGenerated: z.optional(z.string()),
    nextDue: z.string(),
    isActive: z.boolean(),
    userId: z.optional(z.string()),
    teamId: TeamIdSchema
});

// Exchange Rates
export const ExchangeRatesSchema = z.object({
    base: CurrencySchema,
    date: z.string(),
    rates: z.record(CurrencySchema, z.number()),
    provider: z.optional(z.enum(['nbs', 'api'])),
    listDate: z.optional(z.string().check(z.maxLength(10)))
});

// Event
export const EventSchema = z.object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1)),
    description: z.optional(z.string()),
    startDate: z.optional(z.string()),
    endDate: z.optional(z.string()),
    personIds: z._default(z.array(z.string()), []),
    sharedEmails: z.optional(z.array(z.email())),
    icon: z.optional(z.string()),
    color: z.optional(z.string()),
    imageUrl: z.optional(z.string()),
    status: z.enum(['active', 'completed', 'archived']),
    userId: z.optional(z.string()),
    teamId: TeamIdSchema
});

// Teams
export const TeamRoleSchema = z.enum(['owner', 'admin', 'member']);

export const TeamMemberSchema = z.object({
    email: z.string().check(z.minLength(3), z.maxLength(254)),
    userId: z.optional(z.string()),
    role: TeamRoleSchema
});

export const TeamSchema = z.object({
    id: z.string().check(z.minLength(1)),
    name: z.string().check(z.minLength(1), z.maxLength(80)),
    ownerId: z.string(),
    color: z.optional(z.string()),
    createdAt: z.optional(z.string()),
    members: z._default(z.array(TeamMemberSchema), [])
});

// Shared Expense
export const SharedExpenseSchema = z.object({
    id: z.string().check(z.minLength(1)),
    eventId: z.string(),
    name: z.string().check(z.minLength(1)),
    amount: z.number().check(z.minimum(0)),
    currency: CurrencySchema,
    paidBy: z.string(),
    sharedWith: z.array(z.string()),
    splitType: z.optional(z.enum(['equal', 'exact'])),
    splitDetails: z.optional(z.record(z.string(), z.number())),
    date: z.string(),
    category: z.optional(z.string())
});

// Theme
export const ThemeSchema = z.enum([
    'neon', 'racing-orange', 'graphite', 'coffee', 'gilded',
    'crimson-red', 'lime-dark', 'sterling', 'canyon',
    'cyberpunk-pink', 'harbor', 'galaxy', 'evergreen', 'linen', 'mist', 'light'
]);

// Language
export const LanguageSchema = z.enum(['en', 'sr']);

// Appearance, Home layout and budget (stored in settings.prefs)
export const AppearanceSchema = z.object({
    mode: z.enum(['light', 'dark', 'system']),
    accent: z.enum(['teal', 'ember', 'iris', 'ink']),
    glass: z.enum(['frosted', 'clear', 'solid'])
});

export const HomeBlockSchema = z.object({
    id: z.string().check(z.minLength(1), z.maxLength(64)),
    type: z.enum(['budget', 'networth', 'categories', 'daily', 'wallets', 'people', 'event', 'upcoming', 'recent', 'rates', 'quickadd']),
    style: z.string().check(z.maxLength(32)),
    size: z.enum(['s', 'm', 'l'])
});

export const HomeLayoutSchema = z.array(HomeBlockSchema).check(z.maxLength(40));

export const BudgetSchema = z.object({
    monthly: z.number().check(z.minimum(0), z.maximum(1e9)),
    categoryLimits: z.record(z.string(), z.number().check(z.minimum(0), z.maximum(1e9)))
});

// The user's own account for IPS QR payment requests (settings.prefs.payment)
export const PaymentDetailsSchema = z.object({
    // 18 characters only (no regex check: it would pull zod's string format code into the entry
    // chunk). The QR builder and the database CHECK both reject non-digits.
    account: z.string().check(z.minLength(18), z.maxLength(18)),
    name: z.string().check(z.minLength(1), z.maxLength(70)),
    address: z.optional(z.string().check(z.maxLength(70))),
    city: z.optional(z.string().check(z.maxLength(70)))
});

// App State
export const AppStateSchema = z.object({
    transactions: z._default(z.array(TransactionSchema), []),
    categories: z._default(z.array(CategorySchema), []),
    accounts: z._default(z.array(AccountSchema), []),
    people: z._default(z.array(PersonSchema), []),
    userProfile: z.optional(PersonSchema),
    baseCurrency: z._default(CurrencySchema, 'USD'),
    rates: z.optional(ExchangeRatesSchema),
    templates: z._default(z.array(TransactionTemplateSchema), []),
    recurringTransactions: z._default(z.array(RecurringTransactionSchema), []),
    theme: z._default(ThemeSchema, 'neon'),
    language: z._default(LanguageSchema, 'en'),
    events: z._default(z.array(EventSchema), []),
    sharedExpenses: z._default(z.array(SharedExpenseSchema), []),
    isGuest: z.optional(z.boolean()),
    appearance: z.optional(z.catch(z.optional(AppearanceSchema), undefined)),
    homeLayout: z.optional(z.catch(z.optional(HomeLayoutSchema), undefined)),
    budget: z.optional(z.catch(z.optional(z.nullable(BudgetSchema)), undefined)),
    paymentDetails: z.optional(z.catch(z.optional(z.nullable(PaymentDetailsSchema)), undefined)),
    teams: z.optional(z.catch(z.optional(z.array(TeamSchema)), undefined))
});

// Validation helper functions
export function validateTransaction(data: unknown): z.infer<typeof TransactionSchema> {
    return TransactionSchema.parse(data);
}

export function validateCategory(data: unknown): z.infer<typeof CategorySchema> {
    return CategorySchema.parse(data);
}

export function validateAccount(data: unknown): z.infer<typeof AccountSchema> {
    return AccountSchema.parse(data);
}

export function validatePerson(data: unknown): z.infer<typeof PersonSchema> {
    return PersonSchema.parse(data);
}

export function validateEvent(data: unknown): z.infer<typeof EventSchema> {
    return EventSchema.parse(data);
}

export function validateSharedExpense(data: unknown): z.infer<typeof SharedExpenseSchema> {
    return SharedExpenseSchema.parse(data);
}

export function validateAppState(data: unknown): z.infer<typeof AppStateSchema> {
    return AppStateSchema.parse(data);
}

// Safe validation (returns result instead of throwing)
export function safeValidateAppState(data: unknown) {
    return AppStateSchema.safeParse(data);
}

export function safeValidateTransaction(data: unknown) {
    return TransactionSchema.safeParse(data);
}

// Type exports
export type ValidatedTransaction = z.infer<typeof TransactionSchema>;
export type ValidatedTransactionTemplate = z.infer<typeof TransactionTemplateSchema>;
export type ValidatedRecurringTransaction = z.infer<typeof RecurringTransactionSchema>;
export type ValidatedCategory = z.infer<typeof CategorySchema>;
export type ValidatedAccount = z.infer<typeof AccountSchema>;
export type ValidatedPerson = z.infer<typeof PersonSchema>;
export type ValidatedEvent = z.infer<typeof EventSchema>;
export type ValidatedSharedExpense = z.infer<typeof SharedExpenseSchema>;
export type ValidatedTeam = z.infer<typeof TeamSchema>;
export type ValidatedAppState = z.infer<typeof AppStateSchema>;
