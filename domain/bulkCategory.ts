import type { Category, Transaction } from '../types';
import { isRepaymentTransaction, isTransferTransaction } from './money';
import { isSystemCategoryId } from './transactions';

/** What an entry's category was before a bulk change, so the change can be undone. */
export interface PreviousCategory {
  categoryId: string;
  subcategory?: string;
}

export interface Recategorized {
  /** Entries that change, with the new category (and no subcategory, which belonged to the old one). */
  rows: Transaction[];
  /** Selected entries that keep their category: transfers, repayments, or the other kind. */
  skipped: number;
  previous: Map<string, PreviousCategory>;
}

/** Whether an entry can take this category: same kind, and not a transfer or a repayment. */
export const canTakeCategory = (transaction: Transaction, category: Category): boolean =>
  !isTransferTransaction(transaction)
  && !isRepaymentTransaction(transaction)
  && !isSystemCategoryId(category.id)
  && transaction.type === category.type;

/**
 * Moves the selected entries to one category. Entries already there (with no subcategory) are left
 * out of `rows` without counting as skipped.
 */
export const recategorize = (
  transactions: readonly Transaction[],
  ids: ReadonlySet<string>,
  category: Category,
): Recategorized => {
  const rows: Transaction[] = [];
  const previous = new Map<string, PreviousCategory>();
  let skipped = 0;
  for (const transaction of transactions) {
    if (!ids.has(transaction.id)) continue;
    if (!canTakeCategory(transaction, category)) {
      skipped += 1;
      continue;
    }
    if (transaction.categoryId === category.id && !transaction.subcategory) continue;
    previous.set(transaction.id, { categoryId: transaction.categoryId, subcategory: transaction.subcategory });
    rows.push({ ...transaction, categoryId: category.id, subcategory: undefined });
  }
  return { rows, skipped, previous };
};

/** Puts the old categories back on entries still in `categoryId` (one edited since is left alone). */
export const undoRecategorize = (
  transactions: readonly Transaction[],
  previous: ReadonlyMap<string, PreviousCategory>,
  categoryId: string,
): Transaction[] =>
  transactions.flatMap(transaction => {
    const before = previous.get(transaction.id);
    if (!before || transaction.categoryId !== categoryId || transaction.subcategory) return [];
    return [{ ...transaction, categoryId: before.categoryId, subcategory: before.subcategory }];
  });

/** The kinds among the selected entries that can change category, for which categories to offer. */
export const recategorizableKinds = (
  transactions: readonly Transaction[],
  ids: ReadonlySet<string>,
): Set<Transaction['type']> => {
  const kinds = new Set<Transaction['type']>();
  for (const transaction of transactions) {
    if (ids.has(transaction.id) && !isTransferTransaction(transaction) && !isRepaymentTransaction(transaction)) kinds.add(transaction.type);
  }
  return kinds;
};
