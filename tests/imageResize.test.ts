import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_DIMENSION, PHOTO_MAX_DIMENSION, WEBP_QUALITY, extensionForMime, fitWithin } from '../utils/imageResize';

describe('fitWithin', () => {
  it('caps the longest edge and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(1024, 1024, 256)).toEqual({ width: 256, height: 256 });
  });

  it('never upscales small images', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('keeps extreme aspect ratios at least one pixel wide', () => {
    expect(fitWithin(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('image encoding defaults', () => {
  it('uses 1600px photos, 256px avatars and WebP at 0.8', () => {
    expect(PHOTO_MAX_DIMENSION).toBe(1600);
    expect(AVATAR_MAX_DIMENSION).toBe(256);
    expect(WEBP_QUALITY).toBe(0.8);
    expect(extensionForMime('image/webp')).toBe('webp');
    expect(extensionForMime('image/jpeg')).toBe('jpg');
  });
});

describe('image picker contracts', () => {
  const picker = readFileSync('hooks/useImagePicker.ts', 'utf8');

  it('uses the @capacitor/camera 8 API instead of the deprecated getPhoto/pickImages', () => {
    expect(picker).toContain('Camera.takePhoto(');
    expect(picker).toContain('Camera.chooseFromGallery(');
    expect(picker).not.toContain('getPhoto');
    expect(picker).not.toContain('pickImages');
  });

  it('downscales every picked image before returning it', () => {
    expect(picker).toContain('processImage(');
  });

  it('does not resolve web gallery picks twice (input onChange delivers the result)', () => {
    expect(picker).not.toContain("addEventListener('change'");
  });

  it('receipt drag and drop is downscaled too', () => {
    expect(readFileSync('components/ReceiptScanModal.tsx', 'utf8')).toContain('processImage(file');
  });
});
