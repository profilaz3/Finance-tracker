const SUPPORTED_RECEIPT_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const RECEIPT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif';

export function isSupportedReceiptImageType(type: string | undefined | null): boolean {
  return typeof type === 'string' && SUPPORTED_RECEIPT_IMAGE_TYPES.has(type.toLowerCase());
}
