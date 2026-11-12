import { AppState } from '../types';

const normalizeOptionalValue = <T>(value: T | null | undefined): T | undefined =>
  value == null ? undefined : value;

const normalizeBalances = (balances: Partial<Record<'EUR' | 'USD' | 'RSD', number>> | undefined) => ({
  EUR: balances?.EUR ?? 0,
  USD: balances?.USD ?? 0,
  RSD: balances?.RSD ?? 0,
});

export const sanitizeLoadedState = (state: AppState): AppState => ({
  ...state,
  people: state.people.map(person => ({
    ...person,
    avatar: normalizeOptionalValue(person.avatar),
    balances: normalizeBalances(person.balances),
  })),
  userProfile: state.userProfile
    ? {
        ...state.userProfile,
        avatar: normalizeOptionalValue(state.userProfile.avatar),
        balances: normalizeBalances(state.userProfile.balances),
      }
    : undefined,
  categories: state.categories.map(category => ({
    ...category,
    icon: normalizeOptionalValue(category.icon),
  })),
  accounts: state.accounts.map(account => ({
    ...account,
    icon: normalizeOptionalValue(account.icon),
    initialBalance: normalizeOptionalValue(account.initialBalance),
    order: normalizeOptionalValue(account.order),
  })),
  templates: state.templates.map(template => ({
    ...template,
    amount: normalizeOptionalValue(template.amount),
    note: normalizeOptionalValue(template.note),
    subcategory: normalizeOptionalValue(template.subcategory),
    lastUsed: normalizeOptionalValue(template.lastUsed),
  })),
  recurringTransactions: state.recurringTransactions.map(recurring => ({
    ...recurring,
    note: normalizeOptionalValue(recurring.note),
    subcategory: normalizeOptionalValue(recurring.subcategory),
    endDate: normalizeOptionalValue(recurring.endDate),
    lastGenerated: normalizeOptionalValue(recurring.lastGenerated),
  })),
  events: state.events.map(event => ({
    ...event,
    description: normalizeOptionalValue(event.description),
    startDate: normalizeOptionalValue(event.startDate),
    endDate: normalizeOptionalValue(event.endDate),
    sharedEmails: normalizeOptionalValue(event.sharedEmails),
    icon: normalizeOptionalValue(event.icon),
    color: normalizeOptionalValue(event.color),
    imageUrl: normalizeOptionalValue(event.imageUrl),
    userId: normalizeOptionalValue(event.userId),
  })),
  sharedExpenses: state.sharedExpenses.map(expense => ({
    ...expense,
    splitType: normalizeOptionalValue(expense.splitType),
    splitDetails: normalizeOptionalValue(expense.splitDetails),
    category: normalizeOptionalValue(expense.category),
  })),
  transactions: state.transactions.map(transaction => ({
    ...transaction,
    personId: normalizeOptionalValue(transaction.personId),
    subcategory: normalizeOptionalValue(transaction.subcategory),
    note: normalizeOptionalValue(transaction.note),
    receiptData: transaction.receiptData
      ? {
          ...transaction.receiptData,
          merchant: normalizeOptionalValue(transaction.receiptData.merchant) ?? '',
        }
      : undefined,
    fees: normalizeOptionalValue(transaction.fees),
    eventId: normalizeOptionalValue(transaction.eventId),
    splitDetails: transaction.splitDetails
      ? {
          ...transaction.splitDetails,
          shares: transaction.splitDetails.shares.map(share => ({
            ...share,
            percentage: normalizeOptionalValue(share.percentage),
            isPaid: normalizeOptionalValue(share.isPaid),
          })),
        }
      : undefined,
  })),
});
