import { convertAmount } from '../services/currencyService';
import type { Category, Currency, ExchangeRates, RecurringTransaction, Transaction } from '../types';
import { INITIAL_CATEGORIES } from '../constants';

/**
 * Shared money classification rules. Every income/expense total, chart and
 * forecast should go through these helpers so that transfers, debt
 * repayments and fees are treated the same way everywhere.
 */

export const TRANSFER_CATEGORY_ID = 'internal-transfer';
/** Money coming back to me: someone repays what they owed me (income side). */
export const DEBT_REPAYMENT_CATEGORY_ID = 'debt-repayment';
/** Money going out: I repay what I owed someone (expense side). */
export const LOAN_REPAYMENT_CATEGORY_ID = 'loan-repayment';

export const REPAYMENT_CATEGORY_IDS: ReadonlySet<string> = new Set([
  DEBT_REPAYMENT_CATEGORY_ID,
  LOAN_REPAYMENT_CATEGORY_ID,
]);

/** Income categories that are not earnings (money returned to me). */
export const NON_EARNING_INCOME_CATEGORY_IDS: ReadonlySet<string> = new Set(['c8', 'reimbursement']);

const TRANSFER_NOTE_PREFIX = 'Transfer:';

/** Fees are always entered in USD. */
export const FEE_CURRENCY: Currency = 'USD';

/** Stored fees keep 1/100 of a cent, so a fee typed in RSD or EUR reads back as typed. */
const FEE_PRECISION = 10_000;

/**
 * A fee read in another currency (a scanned receipt, a typed or spoken entry) as it is stored:
 * in FEE_CURRENCY. Empty, invalid or non-positive fees become undefined.
 */
export const toStoredFee = (fee: number | undefined, currency: Currency, rates: ExchangeRates): number | undefined => {
  if (typeof fee !== 'number' || !Number.isFinite(fee) || fee <= 0) return undefined;
  // convertAmount rounds to cents; a fee needs more so it survives the trip back to its currency.
  const fromRate = rates.rates[currency];
  const toRate = rates.rates[FEE_CURRENCY];
  const converted = currency === FEE_CURRENCY || !fromRate || !toRate ? fee : (fee / fromRate) * toRate;
  const stored = Math.round(converted * FEE_PRECISION) / FEE_PRECISION;
  return stored > 0 ? stored : undefined;
};

type Classifiable = Pick<Transaction, 'categoryId' | 'note'> & { transferId?: string };

export const isTransferTransaction = (item: Classifiable | Pick<RecurringTransaction, 'categoryId' | 'note'>): boolean =>
  item.categoryId === TRANSFER_CATEGORY_ID
  || item.note?.startsWith(TRANSFER_NOTE_PREFIX) === true
  || Boolean((item as Classifiable).transferId);

export const isRepaymentTransaction = (item: Pick<Transaction, 'categoryId'>): boolean =>
  REPAYMENT_CATEGORY_IDS.has(item.categoryId);

/** Transactions that never count as income or expense (they only move money). */
export const isExcludedFromAnalytics = (item: Classifiable): boolean =>
  isTransferTransaction(item) || isRepaymentTransaction(item);

export const isCountedIncome = (transaction: Transaction): boolean =>
  transaction.type === 'income'
  && !isExcludedFromAnalytics(transaction)
  && !NON_EARNING_INCOME_CATEGORY_IDS.has(transaction.categoryId);

export const isCountedExpense = (transaction: Transaction): boolean =>
  transaction.type === 'expense' && !isExcludedFromAnalytics(transaction);

/**
 * The part of the fee (in `currency`) that is my own cost.
 * - Split transactions: the fee is already part of `splitDetails.totalAmount`
 *   and therefore shared; only my proportional share counts.
 * - Transfers: the fee counts once, on the outgoing (expense) leg.
 */
export const getCountedFee = (transaction: Transaction, currency: Currency, rates: ExchangeRates): number => {
  if (!transaction.fees || transaction.fees <= 0) return 0;
  if (isTransferTransaction(transaction) && transaction.type !== 'expense') return 0;

  if (transaction.splitDetails) {
    const { myPortion, totalAmount } = transaction.splitDetails;
    if (totalAmount > 0) {
      const ratio = Math.min(1, Math.max(0, myPortion / totalAmount));
      return convertAmount(transaction.fees * ratio, FEE_CURRENCY, currency, rates);
    }
  }

  return convertAmount(transaction.fees, FEE_CURRENCY, currency, rates);
};

/** My expense amount without fees, in `currency`. */
export const getExpensePrincipal = (transaction: Transaction, currency: Currency, rates: ExchangeRates): number => {
  if (!transaction.splitDetails) {
    return convertAmount(transaction.amount, transaction.currency, currency, rates);
  }

  // myPortion already contains my share of the fee (fees are added to totalAmount before splitting).
  const myPortion = convertAmount(transaction.splitDetails.myPortion, transaction.currency, currency, rates);
  const principal = myPortion - getCountedFee(transaction, currency, rates);
  return Math.max(0, Math.round(principal * 100) / 100);
};

/** Expense contribution of a transaction (principal + fee, each counted once). */
export const getCountedExpenseAmount = (transaction: Transaction, currency: Currency, rates: ExchangeRates): number => {
  const fee = getCountedFee(transaction, currency, rates);
  if (!isCountedExpense(transaction)) return fee;
  return getExpensePrincipal(transaction, currency, rates) + fee;
};

export const getCountedIncomeAmount = (transaction: Transaction, currency: Currency, rates: ExchangeRates): number =>
  isCountedIncome(transaction) ? convertAmount(transaction.amount, transaction.currency, currency, rates) : 0;

/**
 * Finds the repayment category for a settlement direction, creating it from
 * the defaults when the user's category list does not have it.
 */
export const resolveRepaymentCategory = (
  categories: Category[],
  type: Transaction['type'],
): { category: Category; created: boolean } => {
  const id = type === 'income' ? DEBT_REPAYMENT_CATEGORY_ID : LOAN_REPAYMENT_CATEGORY_ID;
  const existing = categories.find(category => category.id === id);
  if (existing) return { category: existing, created: false };

  const fallback = INITIAL_CATEGORIES.find(category => category.id === id);
  return {
    created: true,
    category: fallback
      ? { ...fallback, subcategories: [...fallback.subcategories] }
      : { id, name: type === 'income' ? 'Incoming' : 'Outgoing', type, subcategories: [], color: '#808080' },
  };
};
