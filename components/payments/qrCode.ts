/**
 * QR drawing for payment requests. The encoder (uqr) loads on first use, so it stays out of the
 * startup bundle. Error correction M (15%) suits screens with glare; NBS allows M or L up to
 * version 13, and L is the fallback for the longest payloads.
 */

type Encode = typeof import('uqr').encode;

let encoderPromise: Promise<Encode> | null = null;

const loadEncoder = (): Promise<Encode> => {
  encoderPromise ??= import('uqr')
    .then((mod) => mod.encode)
    .catch((error) => {
      encoderPromise = null;
      throw error;
    });
  return encoderPromise;
};

export interface QrMatrix {
  size: number;
  /** `true` is a dark module. */
  modules: boolean[][];
}

/** Modules of white space around the code, as ISO 18004 asks for. */
export const QUIET_ZONE = 4;
const MAX_VERSION = 13;

export const encodeQr = async (text: string): Promise<QrMatrix> => {
  const encode = await loadEncoder();
  let result: ReturnType<Encode>;
  try {
    result = encode(text, { ecc: 'M', border: 0, maxVersion: MAX_VERSION });
  } catch {
    result = encode(text, { ecc: 'L', border: 0, maxVersion: MAX_VERSION });
  }
  return { size: result.size, modules: result.data };
};

/** SVG path of the dark modules, offset by the quiet zone (viewBox is size + 2 * QUIET_ZONE). */
export const qrPath = (matrix: QrMatrix): string => {
  const parts: string[] = [];
  matrix.modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      // One rectangle per run of dark modules keeps the path short.
      let run = 1;
      while (x + run < row.length && row[x + run]) run += 1;
      parts.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h${run}v1h-${run}z`);
      x += run;
    }
  });
  return parts.join('');
};

export interface QrImageText {
  /** Shown under the code, e.g. "NBS IPS QR". */
  label: string;
  amount: string;
  lines: string[];
}

/** A shareable PNG: white card, the code with its quiet zone, the NBS label, amount and details. */
export const renderQrPng = async (matrix: QrMatrix, text: QrImageText): Promise<Blob> => {
  const width = 900;
  const cells = matrix.size + QUIET_ZONE * 2;
  const scale = Math.floor(width / cells);
  const qrSide = scale * cells;
  const lineHeight = 46;
  const height = qrSide + 60 + 90 + text.lines.length * lineHeight + 40;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  const offsetX = Math.floor((width - qrSide) / 2);
  ctx.fillStyle = '#000000';
  matrix.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect(offsetX + (x + QUIET_ZONE) * scale, (y + QUIET_ZONE) * scale, scale, scale);
    });
  });

  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = qrSide + 30;
  ctx.fillStyle = '#334155';
  ctx.font = `600 30px ${font}`;
  ctx.fillText(text.label, width / 2, y);
  y += 84;
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 64px ${font}`;
  ctx.fillText(text.amount, width / 2, y, width - 60);
  ctx.font = `500 34px ${font}`;
  ctx.fillStyle = '#475569';
  for (const line of text.lines) {
    y += lineHeight;
    ctx.fillText(line, width / 2, y, width - 60);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png failed'))), 'image/png');
  });
};

export { sharePng, type ShareOutcome } from '../../utils/shareImage';
