import type { ReceiptData, Transaction } from '../types';

/**
 * Receipt photos live in the private `receipts` Storage bucket at `<uploader id>/<uuid>.webp|jpg`;
 * an entry points at its photo with `receiptData.photo`. The database accepts nothing else there
 * (`transactions_receipt_photo_check`), and team entries come from other people, so every read
 * goes through `receiptPhotoOf`.
 */
export const RECEIPT_PHOTO_BUCKET = 'receipts';
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/;

export const isReceiptPhotoPath = (value: unknown): value is string => typeof value === 'string' && PHOTO_PATH.test(value);

export const receiptPhotoPath = (userId: string, id: string, mime: string): string =>
  `${userId.toLowerCase()}/${id.toLowerCase()}.${mime === 'image/jpeg' ? 'jpg' : 'webp'}`;

export const receiptPhotoOf = (transaction: Pick<Transaction, 'receiptData'> | undefined): string | null => {
  const photo = transaction?.receiptData?.photo;
  return isReceiptPhotoPath(photo) ? photo : null;
};

/** Whose folder a photo is in: only they can delete it. */
export const receiptPhotoOwner = (path: string): string => path.split('/')[0] ?? '';

const hasOtherReceiptContent = (receipt: ReceiptData): boolean =>
  receipt.items.length > 0 || !!receipt.merchant.trim() || !!receipt.url || !!receipt.invoiceNumber || !!receipt.pib;

/**
 * The entry with `photo` attached, or with its photo removed (`null`). An entry without receipt
 * data gets a bare one (no lines, its own amount as the total); removing the photo from such a
 * bare receipt removes the receipt data again.
 */
export const withReceiptPhoto = (transaction: Transaction, photo: string | null): Transaction => {
  const receipt = transaction.receiptData;
  if (photo) {
    return {
      ...transaction,
      receiptData: receipt ? { ...receipt, photo } : { items: [], total: transaction.amount, merchant: '', photo },
    };
  }
  if (!receipt) return transaction;
  const { photo: _removed, ...rest } = receipt;
  return { ...transaction, receiptData: hasOtherReceiptContent(rest) ? rest : undefined };
};

export const referencedReceiptPhotos = (transactions: Transaction[]): Set<string> => {
  const paths = new Set<string>();
  for (const transaction of transactions) {
    const photo = receiptPhotoOf(transaction);
    if (photo) paths.add(photo);
  }
  return paths;
};

export interface PhotoCleanupItem {
  path: string;
  queuedAt: number;
}

/** Longer than the undo toast, so undoing a delete brings its photo back. */
export const PHOTO_CLEANUP_DELAY_MS = 3 * 60 * 1000;

/**
 * Which queued photos to delete now: old enough and no longer on any entry. A photo back on an
 * entry (undo, or another entry using it) leaves the queue without being deleted.
 */
export const photosDueForCleanup = (
  queue: PhotoCleanupItem[],
  referenced: Set<string>,
  now: number,
): { due: string[]; keep: PhotoCleanupItem[] } => {
  const due: string[] = [];
  const keep: PhotoCleanupItem[] = [];
  const seen = new Set<string>();
  for (const item of queue) {
    if (!isReceiptPhotoPath(item.path) || seen.has(item.path)) continue;
    seen.add(item.path);
    if (referenced.has(item.path)) continue;
    if (now - item.queuedAt >= PHOTO_CLEANUP_DELAY_MS) due.push(item.path);
    else keep.push(item);
  }
  return { due, keep };
};
