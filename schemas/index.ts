import { z } from 'zod';

// Base types
export const CurrencySchema = z.enum(['EUR', 'USD', 'RSD']);
export const TransactionTypeSchema = z.enum(['income', 'expense']);

// Category
export const CategorySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: TransactionTypeSchema,
    subcategories: z.array(z.string()).default([]),
    color: z.string(),
    icon: z.string().optional()
});

// Account
export const AccountSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['cash', 'bank', 'digital', 'other']),
    currency: CurrencySchema,
    color: z.string(),
    initialBalance: z.number().optional().default(0),
    icon: z.string().optional(),
    order: z.number().optional()
});

// Person
export const PersonSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    avatar: z.string().optional(),
    color: z.string(),
    defaultCurrency: CurrencySchema,
    balances: z.record(CurrencySchema, z.number()).default({ EUR: 0, USD: 0, RSD: 0 })
});

// Receipt Data
export const ReceiptItemSchema = z.object({
    name: z.string(),
    price: z.number(),
    quantity: z.number().default(1)
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
    percentage: z.number().optional(),
    isPaid: z.boolean().optional()
});

export const SplitDetailsSchema = z.object({
    totalAmount: z.number(),
    myPortion: z.number(),
    shares: z.array(SplitShareSchema),
    splitMethod: z.enum(['equal', 'exact', 'percentage'])
});

// Transaction
export const TransactionSchema = z.object({
    id: z.string().min(1),
    date: z.string(), // ISO string
    amount: z.number().min(0),
    currency: CurrencySchema,
    categoryId: z.string(),
    accountId: z.string(),
    personId: z.string().optional(),
    subcategory: z.string().optional(),
    note: z.string().optional(),
    type: TransactionTypeSchema,
    receiptData: ReceiptDataSchema.optional(),
    fees: z.number().optional(),
    eventId: z.string().optional(),
    splitDetails: SplitDetailsSchema.optional()
});

// Transaction template
export const TransactionTemplateSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    amount: z.number().optional(),
    currency: CurrencySchema,
    categoryId: z.string(),
    accountId: z.string(),
    type: TransactionTypeSchema,
    note: z.string().optional(),
    subcategory: z.string().optional(),
    usageCount: z.number().default(0),
    lastUsed: z.string().optional()
});

// Recurring transaction
export const RecurrenceFrequencySchema = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']);

export const RecurringTransactionSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    amount: z.number().min(0),
    currency: CurrencySchema,
    categoryId: z.string(),
    accountId: z.string(),
    type: TransactionTypeSchema,
    note: z.string().optional(),
    subcategory: z.string().optional(),
    frequency: RecurrenceFrequencySchema,
    startDate: z.string(),
    endDate: z.string().optional(),
    lastGenerated: z.string().optional(),
    nextDue: z.string(),
    isActive: z.boolean()
});

// Exchange Rates
export const ExchangeRatesSchema = z.object({
    base: CurrencySchema,
    date: z.string(),
    rates: z.record(CurrencySchema, z.number())
});

// Event
export const EventSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    personIds: z.array(z.string()).default([]),
    sharedEmails: z.array(z.string().email()).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    imageUrl: z.string().url().optional().or(z.string().optional()),
    status: z.enum(['active', 'completed', 'archived']),
    userId: z.string().optional()
});

// Shared Expense
export const SharedExpenseSchema = z.object({
    id: z.string().min(1),
    eventId: z.string(),
    name: z.string().min(1),
    amount: z.number().min(0),
    currency: CurrencySchema,
    paidBy: z.string(),
    sharedWith: z.array(z.string()),
    splitType: z.enum(['equal', 'exact']).optional(),
    splitDetails: z.record(z.string(), z.number()).optional(),
    date: z.string(),
    category: z.string().optional()
});

// Theme
export const ThemeSchema = z.enum([
    'neon', 'racing-orange', 'graphite', 'coffee', 'gilded',
    'crimson-red', 'lime-dark', 'sterling', 'canyon',
    'cyberpunk-pink', 'harbor', 'galaxy', 'evergreen', 'linen', 'mist', 'light'
]);

// Language
export const LanguageSchema = z.enum(['en', 'sr']);

// App State
export const AppStateSchema = z.object({
    transactions: z.array(TransactionSchema).default([]),
    categories: z.array(CategorySchema).default([]),
    accounts: z.array(AccountSchema).default([]),
    people: z.array(PersonSchema).default([]),
    userProfile: PersonSchema.optional(),
    baseCurrency: CurrencySchema.default('USD'),
    rates: ExchangeRatesSchema.optional(),
    templates: z.array(TransactionTemplateSchema).default([]),
    recurringTransactions: z.array(RecurringTransactionSchema).default([]),
    theme: ThemeSchema.default('neon'),
    language: LanguageSchema.default('en'),
    events: z.array(EventSchema).default([]),
    sharedExpenses: z.array(SharedExpenseSchema).default([]),
    isGuest: z.boolean().optional()
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
export type ValidatedAppState = z.infer<typeof AppStateSchema>;
