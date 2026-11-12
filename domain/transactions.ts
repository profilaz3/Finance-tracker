import { Category, Currency, Transaction, TransactionType } from '../types';

interface CreateTransactionDraftInput {
  createId: () => string;
  nowIso?: string;
  baseCurrency: Currency;
  accountId: string;
  type?: TransactionType;
  personId?: string;
}

interface CreateLinkedExpenseDraftInput {
  createId: () => string;
  nowIso?: string;
  baseCurrency: Currency;
  accountId: string;
  categories: Category[];
  eventId?: string;
}

interface DuplicateTransactionDraftOptions {
  createId: () => string;
  nowIso?: string;
}

interface RepeatTransactionDraftOptions {
  createId: () => string;
  nowIso?: string;
}

const getNowIso = (nowIso?: string) => nowIso ?? new Date().toISOString();

export const createTransactionDraft = ({
  createId,
  nowIso,
  baseCurrency,
  accountId,
  type = 'expense',
  personId,
}: CreateTransactionDraftInput): Transaction => ({
  id: createId(),
  date: getNowIso(nowIso),
  amount: 0,
  currency: baseCurrency,
  categoryId: type === 'income' ? 'debt-repayment' : 'loan-repayment',
  accountId,
  type,
  personId,
  note: '',
});

export const createLinkedExpenseDraft = ({
  createId,
  nowIso,
  baseCurrency,
  accountId,
  categories,
  eventId,
}: CreateLinkedExpenseDraftInput): Transaction => ({
  id: createId(),
  date: getNowIso(nowIso),
  amount: 0,
  currency: baseCurrency,
  categoryId: categories.find(category => category.type === 'expense')?.id || categories[0]?.id || '',
  accountId,
  type: 'expense',
  note: '',
  eventId,
});

export const duplicateTransactionDraft = (
  transaction: Transaction,
  { createId, nowIso }: DuplicateTransactionDraftOptions
): Transaction => ({
  ...transaction,
  id: createId(),
  date: getNowIso(nowIso),
  splitDetails: undefined,
});

export const createRepeatTransactionDraft = (
  transaction: Transaction,
  { createId, nowIso }: RepeatTransactionDraftOptions
): Transaction => ({
  id: createId(),
  date: getNowIso(nowIso),
  amount: transaction.amount,
  currency: transaction.currency,
  categoryId: transaction.categoryId,
  accountId: transaction.accountId,
  type: transaction.type,
  note: transaction.note,
  subcategory: transaction.subcategory,
});
