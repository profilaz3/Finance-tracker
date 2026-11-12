import { describe, expect, it } from 'vitest';
import { isSupportedReceiptImageType, RECEIPT_IMAGE_ACCEPT } from '../utils/receiptImage';

describe('isSupportedReceiptImageType', () => {
  it('accepts common receipt photo formats', () => {
    expect(isSupportedReceiptImageType('image/jpeg')).toBe(true);
    expect(isSupportedReceiptImageType('image/png')).toBe(true);
    expect(isSupportedReceiptImageType('image/webp')).toBe(true);
  });

  it('rejects unsupported image formats like svg', () => {
    expect(isSupportedReceiptImageType('image/svg+xml')).toBe(false);
    expect(isSupportedReceiptImageType('image/gif')).toBe(false);
    expect(isSupportedReceiptImageType('')).toBe(false);
  });

  it('exposes a narrow accept list for receipt uploads', () => {
    expect(RECEIPT_IMAGE_ACCEPT).toBe('image/png,image/jpeg,image/webp,image/heic,image/heif');
  });
});
