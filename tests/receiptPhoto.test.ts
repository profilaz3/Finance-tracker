import { describe, expect, it } from 'vitest';
import {
  PHOTO_CLEANUP_DELAY_MS,
  isReceiptPhotoPath,
  photosDueForCleanup,
  receiptPhotoOf,
  receiptPhotoOwner,
  receiptPhotoPath,
  referencedReceiptPhotos,
  withReceiptPhoto,
} from '../domain/receiptPhoto';
import { duplicateTransactionDraft } from '../domain/transactions';
import { hasReceiptContent } from '../domain/receiptDetails';
import { ReceiptDataSchema } from '../schemas';
import type { Transaction } from '../types';

const USER = '0b6f2a7e-9c1d-4f5e-8a3b-2c4d6e8f0a1b';
const PHOTO = `${USER}/5d2c9e1a-7b3f-4c8d-9e0f-1a2b3c4d5e6f.webp`;
const OTHER = `${USER}/7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.jpg`;

const entry = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  amount: 1150,
  currency: 'RSD',
  type: 'expense',
  categoryId: 'food',
  accountId: 'cash',
  date: '2026-11-15T01:35:00.000Z',
  ...overrides,
});

describe('receipt photo paths', () => {
  it('builds and accepts only paths in the bucket layout', () => {
    expect(receiptPhotoPath(USER.toUpperCase(), '5D2C9E1A-7B3F-4C8D-9E0F-1A2B3C4D5E6F', 'image/webp')).toBe(PHOTO);
    expect(receiptPhotoPath(USER, '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'image/jpeg')).toBe(OTHER);
    expect(isReceiptPhotoPath(PHOTO)).toBe(true);
    for (const bad of ['', 'https://example.com/x.webp', `../${PHOTO}`, `${USER}/x/../y.webp`, `${PHOTO}.png`, `${USER}/abc.webp`, 42, null]) {
      expect(isReceiptPhotoPath(bad)).toBe(false);
    }
    expect(receiptPhotoOwner(PHOTO)).toBe(USER);
  });

  it('reads a photo off an entry only when it is a valid path', () => {
    expect(receiptPhotoOf(entry({ receiptData: { items: [], total: 1, merchant: '', photo: PHOTO } }))).toBe(PHOTO);
    // Team entries come from other people.
    expect(receiptPhotoOf(entry({ receiptData: { items: [], total: 1, merchant: '', photo: 'javascript:alert(1)' } }))).toBeNull();
    expect(receiptPhotoOf(entry())).toBeNull();
  });
});

describe('withReceiptPhoto', () => {
  it('attaches a photo to an entry without receipt data and removes it again', () => {
    const plain = entry();
    const withPhoto = withReceiptPhoto(plain, PHOTO);
    expect(withPhoto.receiptData).toEqual({ items: [], total: 1150, merchant: '', photo: PHOTO });
    expect(hasReceiptContent(withPhoto.receiptData)).toBe(true);
    expect(ReceiptDataSchema.parse(withPhoto.receiptData)).toEqual(withPhoto.receiptData);
    expect(withReceiptPhoto(withPhoto, null).receiptData).toBeUndefined();
  });

  it('keeps the scanned receipt when the photo goes', () => {
    const scanned = entry({ receiptData: { items: [{ name: 'Kore', price: 120, quantity: 1 }], total: 120, merchant: 'Mlekarica', photo: PHOTO } });
    expect(withReceiptPhoto(scanned, null).receiptData).toEqual({ items: [{ name: 'Kore', price: 120, quantity: 1 }], total: 120, merchant: 'Mlekarica' });
    expect(withReceiptPhoto(scanned, OTHER).receiptData?.photo).toBe(OTHER);
  });

  it('does not copy the photo into a duplicate', () => {
    const scanned = entry({ receiptData: { items: [], total: 1150, merchant: 'Maxi', photo: PHOTO } });
    const copy = duplicateTransactionDraft(scanned, { createId: () => 'tx-2', nowIso: '2026-11-15T10:00:00.000Z' });
    expect(copy.receiptData).toEqual({ items: [], total: 1150, merchant: 'Maxi' });
  });
});

describe('photosDueForCleanup', () => {
  const now = 1_000_000_000;
  it('deletes old unreferenced photos, keeps recent ones, and drops ones back on an entry', () => {
    const queue = [
      { path: PHOTO, queuedAt: now - PHOTO_CLEANUP_DELAY_MS - 1 },
      { path: OTHER, queuedAt: now - 1000 },
      { path: `${USER}/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.webp`, queuedAt: now - PHOTO_CLEANUP_DELAY_MS * 2 },
      { path: 'not-a-path', queuedAt: 0 },
    ];
    const referenced = referencedReceiptPhotos([entry({ receiptData: { items: [], total: 1, merchant: '', photo: queue[2].path } })]);
    expect(photosDueForCleanup(queue, referenced, now)).toEqual({ due: [PHOTO], keep: [queue[1]] });
  });
});
