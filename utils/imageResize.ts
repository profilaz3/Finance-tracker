/**
 * Client-side image downscaling. Photos (receipts, event covers) are capped at
 * PHOTO_MAX_DIMENSION and avatars at AVATAR_MAX_DIMENSION on the long edge, then
 * re-encoded as WebP so uploads and AI requests stay small.
 */

export const PHOTO_MAX_DIMENSION = 1600;
export const AVATAR_MAX_DIMENSION = 256;
export const WEBP_QUALITY = 0.8;

export interface DownscaleOptions {
  /** Longest edge in pixels. */
  maxDimension?: number;
  /** Encoder quality, 0-1. */
  quality?: number;
}

export interface ProcessedImage {
  blob: Blob;
  /** Raw base64 without the data URL prefix. */
  base64: string;
  dataUrl: string;
  file: File;
  width: number;
  height: number;
}

/** Scale (width, height) so the longest edge is at most maxDimension. Never upscales. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function extensionForMime(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // EXIF orientation is applied so phone photos are not sideways.
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to <img> decoding (older WebViews reject the options bag).
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscale an image and re-encode it as WebP (JPEG when the browser cannot encode
 * WebP). Returns the original blob when it cannot be decoded, so callers can still
 * upload something rather than failing.
 */
export async function downscaleImage(
  input: Blob,
  { maxDimension = PHOTO_MAX_DIMENSION, quality = WEBP_QUALITY }: DownscaleOptions = {}
): Promise<{ blob: Blob; width: number; height: number }> {
  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(input);
  } catch (error) {
    console.warn('Image decode failed; using the original file', error);
    return { blob: input, width: 0, height: 0 };
  }

  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return { blob: input, width: decoded.width, height: decoded.height };
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    // Browsers without a WebP encoder silently return PNG; JPEG is far smaller then.
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }
    if (!blob) {
      return { blob: input, width: decoded.width, height: decoded.height };
    }
    return { blob, width, height };
  } finally {
    decoded.close();
  }
}

/** Downscale and package the result in the shapes the pickers and uploaders need. */
export async function processImage(
  input: Blob,
  options: DownscaleOptions & { fileName?: string } = {}
): Promise<ProcessedImage> {
  const { blob, width, height } = await downscaleImage(input, options);
  const dataUrl = await blobToDataUrl(blob);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const type = blob.type || 'image/jpeg';
  const baseName = (options.fileName ?? `image_${Date.now()}`).replace(/\.[a-z0-9]+$/i, '');
  const file = new File([blob], `${baseName}.${extensionForMime(type)}`, { type });
  return { blob, base64, dataUrl, file, width, height };
}

/** Fetch a Capacitor webPath (or any same-origin URL) as a Blob. */
export async function fetchAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read the selected image (${response.status})`);
  }
  return response.blob();
}
