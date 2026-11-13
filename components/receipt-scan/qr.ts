// QR decoding helpers. jsQR (~130 kB) is loaded on first use so it stays out of the main bundle.

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

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });

/**
 * Finds a QR code in a photo (data URL). Tries the whole picture, then the lower half
 * enlarged, since the fiscal QR sits at the bottom of a long receipt.
 */
export async function decodeQrFromImage(src: string): Promise<string | null> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const attempt = async (sx: number, sy: number, sw: number, sh: number, maxSide: number): Promise<string | null> => {
    const scale = Math.min(1.6, maxSide / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decodeQrPixels(data, canvas.width, canvas.height, true);
  };

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  return (
    (await attempt(0, 0, w, h, 1400)) ??
    (await attempt(0, h * 0.45, w, h * 0.55, 1400)) ??
    (await attempt(w * 0.1, h * 0.6, w * 0.8, h * 0.4, 1200))
  );
}
