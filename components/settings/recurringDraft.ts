import type { Account, Category, Currency, RecurrenceFrequency, RecurringTransaction, TransactionType } from '../../types';
import { formatAmountForInput, parseAmountInput } from '../../utils/numberInput';
import { calculateNextDueDate } from '../../utils/recurringUtils';

/** What the recurring form edits. `amountText` is what the person typed. */
export interface RecurringDraft {
  name: string;
  amountText: string;
  type: TransactionType;
  frequency: RecurrenceFrequency;
  categoryId: string;
  accountId: string;
  currency: Currency;
  /** True once the person picked a currency; until then it follows the wallet. */
  currencyChosen: boolean;
  startDate: string;
}

export type RecurringFieldError =
  | 'nameRequired'
  | 'amountRequired'
  | 'amountUnreadable'
  | 'amountNotPositive'
  | 'categoryRequired'
  | 'accountRequired';

export type RecurringErrors = Partial<Record<'name' | 'amount' | 'category' | 'account', RecurringFieldError>>;

/** Same cap the database puts on recurring amounts. */
export const RECURRING_MAX_AMOUNT = 1_000_000_000;

/** Today as YYYY-MM-DD in local time (toISOString gives yesterday after midnight in Serbia). */
export const localToday = (now: Date = new Date()): string => {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/** A blank form: the first wallet is preselected (and shown), the category must be picked. */
export const emptyRecurringDraft = (
  accounts: Pick<Account, 'id' | 'currency'>[],
  baseCurrency: Currency,
  now: Date = new Date(),
): RecurringDraft => {
  const wallet = accounts[0];
  return {
    name: '',
    amountText: '',
    type: 'expense',
    frequency: 'monthly',
    categoryId: '',
    accountId: wallet?.id ?? '',
    currency: wallet?.currency ?? baseCurrency,
    currencyChosen: false,
    startDate: localToday(now),
  };
};

/** The form prefilled from an existing rule. Missing categories or wallets are left unpicked. */
export const draftFromRecurring = (
  recurring: RecurringTransaction,
  categories: Pick<Category, 'id' | 'type'>[],
  accounts: Pick<Account, 'id'>[],
  language: 'en' | 'sr',
): RecurringDraft => ({
  name: recurring.name,
  amountText: formatAmountForInput(Math.abs(recurring.amount), language),
  type: recurring.type,
  frequency: recurring.frequency,
  categoryId: categories.some(category => category.id === recurring.categoryId && category.type === recurring.type) ? recurring.categoryId : '',
  accountId: accounts.some(account => account.id === recurring.accountId) ? recurring.accountId : '',
  currency: recurring.currency,
  currencyChosen: true,
  startDate: recurring.startDate.slice(0, 10),
});

/** The amount problem, if any, for the typed text (empty text is only an error on save). */
export const amountError = (text: string, language: 'en' | 'sr'): RecurringFieldError | undefined => {
  if (!text.trim()) return 'amountRequired';
  const amount = parseAmountInput(text, language);
  if (amount === undefined) return 'amountUnreadable';
  if (amount <= 0 || Math.round(amount * 100) < 1 || amount > RECURRING_MAX_AMOUNT) return 'amountNotPositive';
  return undefined;
};

export const validateRecurringDraft = (
  draft: RecurringDraft,
  categories: Pick<Category, 'id' | 'type'>[],
  accounts: Pick<Account, 'id'>[],
  language: 'en' | 'sr',
): RecurringErrors => {
  const errors: RecurringErrors = {};
  if (!draft.name.trim()) errors.name = 'nameRequired';
  const amount = amountError(draft.amountText, language);
  if (amount) errors.amount = amount;
  if (!categories.some(category => category.id === draft.categoryId && category.type === draft.type)) errors.category = 'categoryRequired';
  if (!accounts.some(account => account.id === draft.accountId)) errors.account = 'accountRequired';
  return errors;
};

/** Picking a wallet moves the currency along unless the person chose one. */
export const withAccount = (draft: RecurringDraft, accountId: string, accounts: Pick<Account, 'id' | 'currency'>[]): RecurringDraft => {
  const wallet = accounts.find(account => account.id === accountId);
  return {
    ...draft,
    accountId,
    currency: !draft.currencyChosen && wallet ? wallet.currency : draft.currency,
  };
};

/** Switching expense/income drops a category of the other type. */
export const withType = (draft: RecurringDraft, type: TransactionType, categories: Pick<Category, 'id' | 'type'>[]): RecurringDraft => ({
  ...draft,
  type,
  categoryId: categories.some(category => category.id === draft.categoryId && category.type === type) ? draft.categoryId : '',
});

/**
 * Next due date after the schedule of an existing rule changed. A rule that never ran starts on
 * its start date. Otherwise the new schedule continues from the earlier of the old due date and
 * today, never before the start date, so already generated occurrences are not created again
 * (an occurrence on the same day keeps its id and is skipped).
 */
export const rescheduledNextDue = (
  previous: Pick<RecurringTransaction, 'startDate' | 'frequency' | 'nextDue' | 'lastGenerated'>,
  next: Pick<RecurringTransaction, 'startDate' | 'frequency'>,
  now: Date = new Date(),
): string => {
  const startDate = next.startDate.slice(0, 10);
  if (previous.startDate.slice(0, 10) === startDate && previous.frequency === next.frequency) return previous.nextDue;
  if (!previous.lastGenerated) return startDate;

  const today = localToday(now);
  const from = previous.nextDue && previous.nextDue < today ? previous.nextDue : today;
  if (startDate >= from) return startDate;
  let due = startDate;
  for (let guard = 0; due < from && guard < 5000; guard += 1) {
    due = calculateNextDueDate(due, next.frequency, startDate);
  }
  return due;
};

const roundedAmount = (text: string, language: 'en' | 'sr') => Math.round((parseAmountInput(text, language) ?? 0) * 100) / 100;

/** A cleared date field falls back to today. */
const startDateOf = (draft: RecurringDraft, now: Date) => (/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) ? draft.startDate : localToday(now));

/** A new rule from a valid draft. */
export const buildRecurring = (draft: RecurringDraft, language: 'en' | 'sr', id: string, now: Date = new Date()): RecurringTransaction => {
  const startDate = startDateOf(draft, now);
  return {
    id,
    name: draft.name.trim(),
    amount: roundedAmount(draft.amountText, language),
    currency: draft.currency,
    categoryId: draft.categoryId,
    accountId: draft.accountId,
    type: draft.type,
    frequency: draft.frequency,
    startDate,
    nextDue: startDate,
    isActive: true,
  };
};

/** The fields that change when an existing rule is saved from a valid draft. */
export const recurringUpdates = (
  previous: RecurringTransaction,
  draft: RecurringDraft,
  language: 'en' | 'sr',
  now: Date = new Date(),
): Partial<RecurringTransaction> => {
  const startDate = startDateOf(draft, now);
  return {
    name: draft.name.trim(),
    amount: roundedAmount(draft.amountText, language),
    currency: draft.currency,
    categoryId: draft.categoryId,
    accountId: draft.accountId,
    type: draft.type,
    frequency: draft.frequency,
    startDate,
    nextDue: rescheduledNextDue(previous, { startDate, frequency: draft.frequency }, now),
  };
};
