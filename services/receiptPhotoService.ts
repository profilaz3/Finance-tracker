import { getSupabaseService } from './runtimeServices';
import { downscaleImage, PHOTO_MAX_DIMENSION } from '../utils/imageResize';
import { photosDueForCleanup, receiptPhotoOwner } from '../domain/receiptPhoto';
import { readPhotoCleanupQueue, writePhotoCleanupQueue } from './receiptPhotoCleanup';

/** Signed links last an hour and are reused for 50 minutes. */
const LINK_SECONDS = 60 * 60;
const LINK_REUSE_MS = 50 * 60 * 1000;
/** The bucket's own limit (2 MB); a 1600px WebP is usually 150-400 KB. */
const MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_QUALITY = 0.8;

const links = new Map<string, { url: string; at: number }>();

export class ReceiptPhotoError extends Error {
  constructor(public readonly reason: 'offline' | 'too-large' | 'unsupported' | 'upload') {
    super(`receipt photo: ${reason}`);
  }
}

/** Downscales the photo (1600px, WebP or JPEG) and uploads it; returns its Storage path. */
export const uploadReceiptPhoto = async (input: Blob): Promise<string> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ReceiptPhotoError('offline');
  const { blob } = await downscaleImage(input, { maxDimension: PHOTO_MAX_DIMENSION, quality: PHOTO_QUALITY });
  if (blob.type !== 'image/webp' && blob.type !== 'image/jpeg') throw new ReceiptPhotoError('unsupported');
  if (blob.size > MAX_BYTES) throw new ReceiptPhotoError('too-large');
  try {
    const service = await getSupabaseService();
    return await service.uploadReceiptPhoto(blob, crypto.randomUUID());
  } catch {
    throw new ReceiptPhotoError('upload');
  }
};

/** A link to show the photo, or null when it cannot be loaded (offline, no access, deleted). */
export const receiptPhotoUrl = async (path: string): Promise<string | null> => {
  const cached = links.get(path);
  if (cached && Date.now() - cached.at < LINK_REUSE_MS) return cached.url;
  try {
    const service = await getSupabaseService();
    const url = await service.receiptPhotoUrl(path, LINK_SECONDS);
    links.set(path, { url, at: Date.now() });
    return url;
  } catch {
    return null;
  }
};

/**
 * Deletes queued photos that are past the undo window and on no entry any more. Only the
 * uploader can delete a photo, so others' photos (on team entries) leave the queue untouched.
 */
export const flushReceiptPhotoCleanup = async (referenced: Set<string>, userId: string): Promise<void> => {
  const queue = readPhotoCleanupQueue();
  if (queue.length === 0) return;
  const { due, keep } = photosDueForCleanup(queue, referenced, Date.now());
  const mine = due.filter(path => receiptPhotoOwner(path) === userId.toLowerCase());
  writePhotoCleanupQueue(keep);
  if (mine.length === 0) return;
  try {
    const service = await getSupabaseService();
    await service.deleteReceiptPhotos(mine);
    mine.forEach(path => links.delete(path));
  } catch {
    // Offline: try again next time.
    writePhotoCleanupQueue([...readPhotoCleanupQueue(), ...mine.map(path => ({ path, queuedAt: 0 }))]);
  }
};
