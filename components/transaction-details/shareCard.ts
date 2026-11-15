/**
 * The picture an entry is shared as: a light card with the amount, what it was, the receipt lines
 * and who owes what. Always light so it reads the same in any chat app.
 */

export interface ShareCardRow {
  label: string;
  value: string;
  /** Small grey text under the label ("2 x 120,00"). */
  detail?: string;
  strong?: boolean;
}

export interface ShareCardContent {
  title: string;
  amount: string;
  positive: boolean;
  /** Category and date, under the amount. */
  subtitle: string;
  /** Initial in the coloured circle. */
  initial: string;
  color: string;
  receiptTitle?: string;
  receiptRows: ShareCardRow[];
  /** Lines left out of a long receipt ("+12 more"). */
  receiptMore?: string;
  receiptTotal?: ShareCardRow;
  splitTitle?: string;
  splitRows: ShareCardRow[];
  /** Source line at the bottom (the official receipt host). */
  footnote?: string;
  brand: string;
}

const WIDTH = 1080;
const MARGIN = 56;
const PAD = 64;
const INNER = WIDTH - MARGIN * 2 - PAD * 2;
const COLORS = {
  bg: '#F3F2EE',
  tile: '#FFFFFF',
  text: '#121212',
  muted: '#5F5E59',
  faint: '#8A8984',
  line: 'rgba(18,18,18,0.12)',
  pos: '#08784A',
};

const fontFamily = (): string => {
  if (typeof document === 'undefined') return 'system-ui, sans-serif';
  return getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
};

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number): string => {
  if (ctx.measureText(text).width <= max) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= max) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
};

/** Word-wraps to at most `maxLines`, ending the last line with … when text is left over. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i += 1) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= max || !line) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      lines.push(fit(ctx, `${line} ${words.slice(i).join(' ')}`, max));
      return lines;
    }
    lines.push(line);
    line = words[i];
  }
  if (line) lines.push(fit(ctx, line, max));
  return lines;
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const dashed = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number) => {
  ctx.save();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
};

const ROW = 52;
const ROW_DETAIL = 34;

const rowsHeight = (rows: ShareCardRow[]) => rows.reduce((sum, row) => sum + ROW + (row.detail ? ROW_DETAIL : 0), 0);

const sectionHeight = (title: string | undefined, rows: ShareCardRow[], extra = 0) =>
  rows.length === 0 ? 0 : 64 + (title ? 56 : 0) + rowsHeight(rows) + extra;

/** Draws the card and returns it as a PNG. */
export const renderShareCard = async (content: ShareCardContent): Promise<Blob> => {
  if (typeof document !== 'undefined') {
    try {
      await document.fonts?.ready;
    } catch {
      // Fallback fonts are fine.
    }
  }
  const font = fontFamily();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.font = `600 48px ${font}`;
  const titleLines = wrap(ctx, content.title, INNER, 2);
  const receiptExtra = (content.receiptMore ? 44 : 0) + (content.receiptTotal ? 32 + ROW + 8 : 0);
  const cardHeight =
    PAD +
    112 + 36 + // circle and gap
    titleLines.length * 60 + 4 + 16 + // title
    112 + // amount
    48 + // subtitle
    sectionHeight(content.receiptTitle, content.receiptRows, receiptExtra) +
    sectionHeight(content.splitTitle, content.splitRows) +
    (content.footnote ? 88 : 24) +
    PAD;
  const height = MARGIN * 2 + cardHeight + 56;

  // Setting the height resets the context, so fonts are set again below.
  canvas.height = height;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = COLORS.tile;
  roundRect(ctx, MARGIN, MARGIN, WIDTH - MARGIN * 2, cardHeight, 48);
  ctx.fill();
  ctx.restore();

  const left = MARGIN + PAD;
  const right = WIDTH - MARGIN - PAD;
  const center = WIDTH / 2;
  let y = MARGIN + PAD;

  // Category circle with the initial.
  ctx.fillStyle = content.color;
  ctx.beginPath();
  ctx.arc(center, y + 56, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 52px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(content.initial.toUpperCase(), center, y + 58);
  y += 112 + 36;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 48px ${font}`;
  titleLines.forEach((line, index) => ctx.fillText(line, center, y + 48 + index * 60));
  y += titleLines.length * 60 + 4 + 16;

  ctx.fillStyle = content.positive ? COLORS.pos : COLORS.text;
  ctx.font = `700 92px ${font}`;
  ctx.fillText(fit(ctx, content.amount, INNER), center, y + 88);
  y += 112;

  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 32px ${font}`;
  ctx.fillText(fit(ctx, content.subtitle, INNER), center, y + 32);
  y += 48;

  const drawRows = (rows: ShareCardRow[]) => {
    for (const row of rows) {
      ctx.font = `${row.strong ? 700 : 500} 34px ${font}`;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'right';
      const valueWidth = ctx.measureText(row.value).width;
      ctx.fillText(row.value, right, y + 40);
      ctx.textAlign = 'left';
      ctx.fillText(fit(ctx, row.label, INNER - valueWidth - 32), left, y + 40);
      y += ROW;
      if (row.detail) {
        ctx.font = `500 28px ${font}`;
        ctx.fillStyle = COLORS.faint;
        ctx.fillText(fit(ctx, row.detail, INNER - valueWidth - 32), left, y + 22);
        y += ROW_DETAIL;
      }
    }
  };

  const drawSection = (title: string | undefined, rows: ShareCardRow[], after?: () => void) => {
    if (rows.length === 0) return;
    y += 32;
    dashed(ctx, left, y, INNER);
    y += 32;
    if (title) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `600 30px ${font}`;
      ctx.fillText(fit(ctx, title, INNER), left, y + 32);
      y += 56;
    }
    drawRows(rows);
    after?.();
  };

  drawSection(content.receiptTitle, content.receiptRows, () => {
    if (content.receiptMore) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.faint;
      ctx.font = `500 28px ${font}`;
      ctx.fillText(content.receiptMore, left, y + 30);
      y += 44;
    }
    if (content.receiptTotal) {
      y += 16;
      dashed(ctx, left, y, INNER);
      y += 16;
      drawRows([{ ...content.receiptTotal, strong: true }]);
      y += 8;
    }
  });
  drawSection(content.splitTitle, content.splitRows);

  if (content.footnote) {
    y += 40;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.faint;
    ctx.font = `500 28px ${font}`;
    ctx.fillText(fit(ctx, content.footnote, INNER), center, y + 28);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.faint;
  ctx.font = `600 26px ${font}`;
  ctx.fillText(content.brand, center, height - MARGIN + 6);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('png failed'))), 'image/png');
  });
};
