// QR decoding helpers. The platform's own barcode reader (BarcodeDetector: Chrome and the
// WebView on Android) is used when present: it reads dense, blurry or tilted codes that jsQR
// misses. jsQR (~130 kB) is the fallback, loaded on first use so it stays out of the main bundle.

import { parseFiscalUrl } from '../../utils/fiscalReceipt';
import { parseIpsPayload, type IpsBill } from '../../utils/ipsQr';

/** What a scanned code means to the app: a fiscal receipt link or an IPS payment code (bills). */
export type ScannedQr = { kind: 'fiscal'; url: string } | { kind: 'ips'; bill: IpsBill };

export const classifyScannedQr = (text: string | null | undefined): ScannedQr | null => {
  if (!text) return null;
  const fiscal = parseFiscalUrl(text);
  if (fiscal) return { kind: 'fiscal', url: fiscal.url };
  const bill = parseIpsPayload(text);
  return bill ? { kind: 'ips', bill } : null;
};

/** Of several codes in view, the one the app can use, else the first (so it can say "not a receipt"). */
export const pickQrText = (texts: readonly string[]): string | null =>
  texts.find(text => classifyScannedQr(text) !== null) ?? texts[0] ?? null;

// --- Platform barcode reader ----------------------------------------------------------------------

/** The part of the (not yet typed) Barcode Detection API used here. */
export interface NativeQrDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): NativeQrDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

let nativeDetectorPromise: Promise<NativeQrDetector | null> | null = null;

/** The platform QR reader, or null where there is none (desktop Linux/Windows Chrome, Firefox, Safari). */
export const getNativeQrDetector = (): Promise<NativeQrDetector | null> => {
  nativeDetectorPromise ??= (async () => {
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (typeof Detector !== 'function') return null;
    try {
      const formats = (await Detector.getSupportedFormats?.()) ?? [];
      return formats.includes('qr_code') ? new Detector({ formats: ['qr_code'] }) : null;
    } catch {
      return null;
    }
  })();
  return nativeDetectorPromise;
};

/** Every QR text the platform reader finds in `source` (a video, image or bitmap); [] on failure. */
export const detectQrTexts = async (detector: NativeQrDetector, source: ImageBitmapSource): Promise<string[]> => {
  try {
    const codes = await detector.detect(source);
    return codes.map(code => code.rawValue).filter((text): text is string => typeof text === 'string' && text.length > 0);
  } catch {
    return [];
  }
};

// --- jsQR -----------------------------------------------------------------------------------------

type JsQr = typeof import('jsqr').default;

let jsQrPromise: Promise<JsQr> | null = null;

export const loadJsQr = (): Promise<JsQr> => {
  jsQrPromise ??= import('jsqr')
    .then((mod) => mod.default)
    .catch((error) => {
      jsQrPromise = null;
      throw error;
    });
  return jsQrPromise;
};

/** Decodes a QR code from RGBA pixels; null when none is found. */
export const decodeQrPixels = async (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  thorough = false,
): Promise<string | null> => {
  const jsQR = await loadJsQr();
  const code = jsQR(data, width, height, { inversionAttempts: thorough ? 'attemptBoth' : 'dontInvert' });
  return code?.data ? code.data : null;
};

/**
 * Start offsets of tiles of `tile` px every `step` px along `length` px, the last one flush with
 * the end. A code no larger than `tile - step` lies wholly inside at least one tile.
 */
export const tileStarts = (length: number, tile: number, step: number): number[] => {
  if (length <= tile) return [0];
  const starts: number[] = [];
  for (let start = 0; start < length - tile; start += step) starts.push(start);
  starts.push(length - tile);
  return starts;
};

/**
 * jsQR passes over a photo, cheapest first. jsQR needs about 4 px per module, and a fiscal QR has
 * about 105, so a code that fills 15% of a 12 MP photo is lost once the photo is shrunk to fit a
 * canvas. The tile passes read it near full resolution instead.
 */
const PHOTO_PASSES = [
  // The whole picture: a close-up of the code.
  { maxSide: 1400, tile: 0, step: 0 },
  // A whole receipt at mid resolution.
  { maxSide: 1800, tile: 1000, step: 400 },
  // A whole long receipt at near full resolution.
  { maxSide: 3200, tile: 1200, step: 400 },
] as const;

/** Stop the tile passes after this long; the photo can still be read with AI. */
const PHOTO_BUDGET_MS = 8000;

interface LoadedImage {
  source: CanvasImageSource & ImageBitmapSource;
  width: number;
  height: number;
  close: () => void;
}

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });

const loadImage = async (src: Blob | string): Promise<LoadedImage> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to an <img> (an old engine, or a format createImageBitmap rejects).
    }
  }
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await loadImageElement(url);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
};

const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Finds a QR code in a photo: the full-size original (Blob) when there is one, otherwise the
 * preview (data URL). Tries the platform reader, then jsQR on the whole picture and on tiles,
 * bottom first, since the fiscal QR sits at the end of a long receipt.
 */
export async function decodeQrFromImage(src: Blob | string): Promise<string | null> {
  const image = await loadImage(src);
  try {
    const { source, width: w, height: h } = image;
    if (!w || !h) return null;

    const native = await getNativeQrDetector();
    if (native) {
      const found = pickQrText(await detectQrTexts(native, source));
      if (found) return found;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const started = performance.now();

    for (const pass of PHOTO_PASSES) {
      const scale = Math.min(1, pass.maxSide / Math.max(w, h));
      if (pass.tile === 0) {
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const text = await decodeQrPixels(data, canvas.width, canvas.height, true);
        if (text) return text;
        continue;
      }
      const scaledW = Math.round(w * scale);
      const scaledH = Math.round(h * scale);
      // A picture that fits one tile was already read whole.
      if (scaledW <= pass.tile && scaledH <= pass.tile) continue;
      const xs = tileStarts(scaledW, pass.tile, pass.step);
      const ys = tileStarts(scaledH, pass.tile, pass.step).reverse();
      for (const y of ys) {
        for (const x of xs) {
          if (performance.now() - started > PHOTO_BUDGET_MS) return null;
          const tw = Math.min(pass.tile, scaledW - x);
          const th = Math.min(pass.tile, scaledH - y);
          canvas.width = tw;
          canvas.height = th;
          ctx.drawImage(source, x / scale, y / scale, tw / scale, th / scale, 0, 0, tw, th);
          const { data } = ctx.getImageData(0, 0, tw, th);
          const text = await decodeQrPixels(data, tw, th);
          if (text) return text;
          // Let the page paint between tiles.
          await nextTask();
        }
      }
    }
    return null;
  } finally {
    image.close();
  }
}
