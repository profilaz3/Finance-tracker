import { CONFIG } from '../config';
import { isReceiptPhotoPath, type PhotoCleanupItem } from '../domain/receiptPhoto';

/**
 * Receipt photos waiting to be deleted from Storage: queued when their entry is deleted or the
 * photo is removed or replaced, taken out again when an undo brings the entry back, and deleted
 * by `flushReceiptPhotoCleanup` once the undo window has passed. Kept per device; small and light
 * so the transaction handlers can import it.
 */
const QUEUE_KEY = `${CONFIG.STORAGE_KEY}:receipt-photo-cleanup`;
const MAX_ITEMS = 200;

export const readPhotoCleanupQueue = (): PhotoCleanupItem[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PhotoCleanupItem =>
        !!item && isReceiptPhotoPath((item as PhotoCleanupItem).path) && Number.isFinite((item as PhotoCleanupItem).queuedAt),
    );
  } catch {
    return [];
  }
};

export const writePhotoCleanupQueue = (queue: PhotoCleanupItem[]): void => {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_ITEMS)));
  } catch {
    // Storage full or blocked: the photo just stays in Storage.
  }
};

export const queueReceiptPhotoCleanup = (paths: Array<string | null | undefined>, now = Date.now()): void => {
  const valid = paths.filter(isReceiptPhotoPath);
  if (valid.length === 0) return;
  const queue = readPhotoCleanupQueue().filter(item => !valid.includes(item.path));
  writePhotoCleanupQueue([...queue, ...valid.map(path => ({ path, queuedAt: now }))]);
};

export const cancelReceiptPhotoCleanup = (paths: Array<string | null | undefined>): void => {
  const valid = new Set(paths.filter(isReceiptPhotoPath));
  if (valid.size === 0) return;
  const queue = readPhotoCleanupQueue();
  const kept = queue.filter(item => !valid.has(item.path));
  if (kept.length !== queue.length) writePhotoCleanupQueue(kept);
};
