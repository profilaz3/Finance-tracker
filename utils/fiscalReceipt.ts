/**
 * Serbian fiscal receipts (e-fiskalizacija, SUF / Poreska uprava).
 *
 * Every fiscal receipt carries a QR code with a verification URL:
 *   https://suf.purs.gov.rs/v/?vl=<base64 payload>
 *
 * - The `vl` payload is binary (TaxCore "Create Verification URL"): version, requestedBy,
 *   signedBy, counters, total amount, PFR time, invoice/transaction type, buyer id, then
 *   encrypted internal data, signature and an MD5 hash. We decode the public header offline.
 * - GET on the URL with `Accept: application/json` returns { invoiceRequest, invoiceResult, journal }.
 * - The HTML page embeds a per-view token; POST /specifications { invoiceNumber, token }
 *   returns the clean item list (name, quantity, unitPrice, total, tax label).
 *
 * Pure and runtime agnostic: imported by the `fiscal-receipt` edge function (Deno) and the app.
 */

export const FISCAL_HOST = 'suf.purs.gov.rs';
/** Payload bounds from TaxCore: 572 to 848 bytes, i.e. at most 1132 base64 characters. */
const MIN_PAYLOAD_BYTES = 572;
const MAX_PAYLOAD_BYTES = 848;
const MAX_VL_CHARS = 1200;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export interface FiscalUrl {
  /** Canonical verification URL rebuilt from the validated payload (safe to fetch). */
  url: string;
  vl: string;
}

export interface FiscalPayload {
  version: number;
  requestedBy: string;
  signedBy: string;
  totalCounter: number;
  transactionTypeCounter: number;
  /** RSD. */
  totalAmount: number;
  /** ISO timestamp (PFR time). */
  date: string;
  /** 0 normal, 1 proforma, 2 copy, 3 training, 4 advance. */
  invoiceType: number;
  /** 0 sale, 1 refund. */
  transactionType: number;
  buyerId: string | null;
  /** requestedBy-signedBy-totalCounter */
  invoiceNumber: string;
}

export interface FiscalItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxLabel?: string;
}

export interface FiscalReceipt {
  merchant: string;
  /** Registered company name (may differ from the shop name). */
  companyName: string;
  pib: string;
  shopName: string;
  address: string;
  city: string;
  /** ISO timestamp. */
  date: string;
  total: number;
  currency: 'RSD';
  items: FiscalItem[];
  invoiceNumber: string;
  invoiceType: number;
  transactionType: number;
  /** Raw receipt text as printed. */
  journal: string;
  /** True when only the QR payload could be read (the tax portal did not answer). */
  partial: boolean;
  /** Best matching category name from the caller's list, when one was given. */
  categoryName?: string;
}

// ---------------------------------------------------------------------------
// URL and payload
// ---------------------------------------------------------------------------

/**
 * Validates a scanned string as a fiscal verification URL and extracts `vl`.
 * `+` in the query is part of the base64 alphabet, so it must not become a space.
 */
export function parseFiscalUrl(raw: string): FiscalUrl | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > 4096) return null;

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== FISCAL_HOST) return null;
  if (parsed.port !== '' || parsed.username !== '' || parsed.password !== '') return null;
  if (parsed.pathname !== '/v/' && parsed.pathname !== '/v') return null;

  const query = parsed.search.replace(/^\?/, '');
  let vl = '';
  for (const part of query.split('&')) {
    if (part.startsWith('vl=')) {
      try {
        vl = decodeURIComponent(part.slice(3));
      } catch {
        return null;
      }
      break;
    }
  }
  // Some scanners hand back the payload with spaces where `+` was.
  vl = vl.replace(/ /g, '+');
  if (!vl || vl.length > MAX_VL_CHARS || !BASE64.test(vl)) return null;
  if (!decodeFiscalPayload(vl)) return null;
  return { url: `https://${FISCAL_HOST}/v/?vl=${encodeURIComponent(vl)}`, vl };
}

const base64ToBytes = (value: string): Uint8Array | null => {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
};

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const ALNUM8 = /^[A-Z0-9]{8}$/;

/** Decodes the public header of a `vl` payload; null when it is not a TaxCore payload. */
export function decodeFiscalPayload(vl: string): FiscalPayload | null {
  const bytes = base64ToBytes(vl);
  if (!bytes || bytes.length < MIN_PAYLOAD_BYTES || bytes.length > MAX_PAYLOAD_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const version = bytes[0];
  const requestedBy = ascii(bytes, 1, 8);
  const signedBy = ascii(bytes, 9, 8);
  if (!ALNUM8.test(requestedBy) || !ALNUM8.test(signedBy)) return null;

  const totalCounter = view.getUint32(17, true);
  const transactionTypeCounter = view.getUint32(21, true);
  const totalAmount = Number(view.getBigUint64(25, true)) / 10_000;
  const millis = Number(view.getBigUint64(33, false));
  const invoiceType = bytes[41];
  const transactionType = bytes[42];
  const buyerIdLength = bytes[43];

  if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 1e12) return null;
  if (invoiceType > 4 || transactionType > 1) return null;
  // Fiscalization started in 2022; reject obviously broken timestamps.
  if (millis < Date.UTC(2020, 0, 1) || millis > Date.UTC(2100, 0, 1)) return null;

  const buyerId = buyerIdLength > 0 ? ascii(bytes, 44, buyerIdLength).trim() || null : null;

  return {
    version,
    requestedBy,
    signedBy,
    totalCounter,
    transactionTypeCounter,
    totalAmount: round2(totalAmount),
    date: new Date(millis).toISOString(),
    invoiceType,
    transactionType,
    buyerId,
    invoiceNumber: `${requestedBy}-${signedBy}-${totalCounter}`,
  };
}

// ---------------------------------------------------------------------------
// Portal responses
// ---------------------------------------------------------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown, max = 200): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** "1.234,56" -> 1234.56 */
export const parseSerbianNumber = (value: string): number | null => {
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

/** Turns an all-caps shop name into title case; leaves mixed case alone. */
export const tidyName = (value: string): string => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s\-/(."])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
    .replace(/\b(Doo|D\.o\.o\.|Ad|A\.d\.)\b/g, (match) => match.toUpperCase());
};

/** Strips the tax label and any leading/trailing article code from a journal item name. */
export const cleanItemName = (value: string): string =>
  value
    .replace(/\s*\((?:[A-ZА-ЯЂЈЉЊЋЏ]{1,2})\)\s*$/u, '')
    .replace(/^\[?\d{3,}\]?[\s,-]+/, '')
    .replace(/[\s,#/-]+\d{5,}$/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Item lines from the specifications endpoint: { success, items: [...] }. */
export function parseSpecifications(data: unknown): FiscalItem[] | null {
  if (!isRecord(data) || data.success !== true || !Array.isArray(data.items)) return null;
  const items: FiscalItem[] = [];
  for (const raw of data.items.slice(0, 300)) {
    if (!isRecord(raw)) continue;
    const name = str(raw.name, 120);
    const quantity = num(raw.quantity);
    const unitPrice = num(raw.unitPrice);
    const total = num(raw.total);
    if (!name || quantity === null || unitPrice === null || total === null) continue;
    items.push({
      name,
      quantity: round3(quantity),
      unitPrice: round2(unitPrice),
      total: round2(total),
      taxLabel: str(raw.label ?? raw.taxLabel, 4) || undefined,
    });
  }
  return items;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const SECTION = '========================================';
const SUB = '----------------------------------------';
const AMOUNT_LINE = /^\s*(-?[\d.]+,\d{2})\s+(-?[\d.,]+)\s+(-?[\d.]+,\d{2})\s*$/;

/** Item lines from the printed journal (fallback when /specifications is unavailable). */
export function parseJournalItems(journal: string): FiscalItem[] {
  const text = journal.replace(/\r\n/g, '\n');
  const sections = text.split(SECTION);
  if (sections.length < 3) return [];
  const body = sections[1].split(SUB)[0] ?? '';
  const lines = body.split('\n').map((line) => line.replace(/\s+$/, ''));

  const items: FiscalItem[] = [];
  let pending = '';
  // The first non-empty line is the column header ("Назив   Цена   Кол.   Укупно").
  let headerSkipped = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const amounts = line.match(AMOUNT_LINE);
    if (!amounts) {
      pending = pending ? `${pending} ${line.trim()}` : line.trim();
      continue;
    }
    const unitPrice = parseSerbianNumber(amounts[1]);
    const quantity = parseSerbianNumber(amounts[2]);
    const total = parseSerbianNumber(amounts[3]);
    const label = pending.match(/\(([A-ZА-ЯЂЈЉЊЋЏ]{1,2})\)\s*$/u)?.[1];
    const name = cleanItemName(pending);
    pending = '';
    if (!name || unitPrice === null || quantity === null || total === null) continue;
    items.push({ name: name.slice(0, 120), quantity: round3(quantity), unitPrice, total, taxLabel: label });
  }
  return items;
}

/** "Укупан износ:  1.500,00" style key/value pairs anywhere in the journal. */
const journalValue = (journal: string, key: string): string | null => {
  const line = journal.split(/\r?\n/).find((row) => row.trim().startsWith(`${key}:`));
  return line ? line.slice(line.indexOf(':') + 1).trim() : null;
};

/** Builds the normalized receipt from the JSON verification response (+ optional item specs). */
export function normalizeFiscalResponse(
  api: unknown,
  specifications: unknown,
  payload: FiscalPayload | null,
): FiscalReceipt | null {
  if (!isRecord(api) || !isRecord(api.invoiceRequest) || !isRecord(api.invoiceResult)) return null;
  const request = api.invoiceRequest;
  const result = api.invoiceResult;
  const journal = typeof api.journal === 'string' ? api.journal.replace(/\r\n/g, '\n').slice(0, 20_000) : '';

  const locationName = str(request.locationName);
  const shopName = locationName.includes('-') ? locationName.slice(locationName.indexOf('-') + 1).trim() : locationName;
  const companyName = str(request.businessName);

  const items = parseSpecifications(specifications) ?? parseJournalItems(journal);
  const journalTotal = parseSerbianNumber(journalValue(journal, 'Укупан износ') ?? '');
  const total = num(result.totalAmount) ?? journalTotal ?? payload?.totalAmount ?? null;
  if (total === null) return null;

  const sdcTime = str(result.sdcTime, 40);
  const date = sdcTime && !Number.isNaN(Date.parse(sdcTime)) ? new Date(sdcTime).toISOString() : payload?.date;
  if (!date) return null;

  // "ETER DOO - Lounge bar EPIC": the part after the company name is what people call the shop.
  const squash = (value: string) => value.toLowerCase().replace(/\s+/g, '');
  const dash = shopName.indexOf(' - ');
  const merchantName =
    dash > 0 && squash(shopName.slice(0, dash)) === squash(companyName) ? shopName.slice(dash + 3).trim() : shopName;

  return {
    merchant: tidyName(merchantName || companyName).slice(0, 80),
    companyName: tidyName(companyName).slice(0, 120),
    pib: str(request.taxId, 20),
    shopName: tidyName(shopName).slice(0, 120),
    address: tidyName(str(request.address)),
    city: str(request.administrativeUnit) || tidyName(str(request.city)),
    date,
    total: round2(total),
    currency: 'RSD',
    items,
    invoiceNumber: str(result.invoiceNumber, 60) || payload?.invoiceNumber || '',
    invoiceType: num(request.invoiceType) ?? payload?.invoiceType ?? 0,
    transactionType: num(request.transactionType) ?? payload?.transactionType ?? 0,
    journal,
    partial: false,
  };
}

/** What we can show when the tax portal does not answer: total and time from the QR alone. */
export function receiptFromPayload(payload: FiscalPayload): FiscalReceipt {
  return {
    merchant: '',
    companyName: '',
    pib: '',
    shopName: '',
    address: '',
    city: '',
    date: payload.date,
    total: payload.totalAmount,
    currency: 'RSD',
    items: [],
    invoiceNumber: payload.invoiceNumber,
    invoiceType: payload.invoiceType,
    transactionType: payload.transactionType,
    journal: '',
    partial: true,
  };
}

/** Extracts the per-view token the specifications endpoint needs from the verification page. */
export const extractSpecificationToken = (html: string): string | null =>
  html.match(/viewModel\.Token\('([0-9a-fA-F-]{36})'\)/)?.[1] ?? null;

// ---------------------------------------------------------------------------
// Category suggestion
// ---------------------------------------------------------------------------

interface CategoryLike {
  name: string;
  type?: string;
}

const KIND_RULES: { merchant: RegExp; items?: RegExp; category: RegExp }[] = [
  {
    // Fuel stations.
    merchant: /\b(nis petrol|nis a\.?d|gazprom|omv|mol\b|lukoil|eko serbia|petrol|benzinsk|pumpa)/i,
    items: /\b(eurodizel|euro ?diesel|bmb|benzin|dizel|tng|lpg|gorivo)\b/i,
    category: /fuel|gorivo|gas|transport|auto|car|prevoz/i,
  },
  {
    merchant: /(apotek|pharm|benu|galen|zegin)/i,
    category: /health|zdrav|pharm|apotek|medic|lek/i,
  },
  {
    // Restaurants, cafes, bars, bakeries with seating.
    merchant: /(restoran|restaurant|kafan|kafe|caffe|cafe|coffee|bar\b|lounge|pub|pizz|burger|grill|bistro|kafeterij|mcdonald|kfc|ресторан|кафе|кафана)/i,
    items: /\b(espresso|kafa|coffee|cappuccino|latte|pivo|beer|vino|wine|pizza|burger|omlet|sendvi|koktel)/i,
    category: /dining|restaur|eating|caf|kafi|food|hrana|jelo|ishran/i,
  },
  {
    // Supermarkets and markets.
    merchant: /(maxi|idea|lidl|aman|univerexport|roda|tempo|mercator|gomex|dis\b|shop ?& ?go|market|samoposlug|pekar|mlekar|pijac|marketi|супермаркет|маркет)/i,
    items: /\b(hleb|mleko|jaja|kore|sir|jogurt|banane|jabuke|meso|piletin|voda|sok)\b/i,
    category: /grocer|namirnic|market|food|hrana|ishran|supermark/i,
  },
  {
    merchant: /(dm drogerie|lilly|drogerij|kozmetik|douglas)/i,
    category: /personal|care|beauty|kozmet|higijen|shopping|kupovin/i,
  },
  {
    merchant: /(gigatron|tehnomanija|win win|emmezeta|ikea|jysk|zara|h&m|sport vision|deichmann|c&a|lc waikiki|bershka|pull&bear)/i,
    category: /shopping|kupovin|cloth|odec|odeć|home|dom|electron/i,
  },
];

/**
 * Picks the user's category for a fiscal receipt using shop name and item keywords.
 * Returns undefined when nothing matches confidently.
 */
export function suggestFiscalCategory(
  receipt: Pick<FiscalReceipt, 'merchant' | 'companyName' | 'shopName' | 'items'>,
  categories: CategoryLike[],
): string | undefined {
  const expense = categories.filter((c) => !c.type || c.type === 'expense');
  if (expense.length === 0) return undefined;
  const shop = `${receipt.merchant} ${receipt.shopName} ${receipt.companyName}`;
  const itemText = receipt.items.map((item) => item.name).join(' ');

  for (const rule of KIND_RULES) {
    if (!rule.merchant.test(shop) && !(rule.items && rule.items.test(itemText))) continue;
    const match = expense.find((c) => rule.category.test(c.name));
    if (match) return match.name;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Client side validation of the edge function result
// ---------------------------------------------------------------------------

export function validateFiscalReceipt(data: unknown): FiscalReceipt | null {
  if (!isRecord(data)) return null;
  const total = num(data.total);
  const date = typeof data.date === 'string' && !Number.isNaN(Date.parse(data.date)) ? data.date : null;
  if (total === null || !date || !Array.isArray(data.items)) return null;
  const items = parseSpecifications({ success: true, items: data.items }) ?? [];
  return {
    merchant: str(data.merchant, 80),
    companyName: str(data.companyName, 120),
    pib: str(data.pib, 20),
    shopName: str(data.shopName, 120),
    address: str(data.address),
    city: str(data.city),
    date,
    total: round2(total),
    currency: 'RSD',
    items,
    invoiceNumber: str(data.invoiceNumber, 60),
    invoiceType: num(data.invoiceType) ?? 0,
    transactionType: num(data.transactionType) ?? 0,
    journal: typeof data.journal === 'string' ? data.journal.slice(0, 20_000) : '',
    partial: data.partial === true,
    categoryName: str(data.categoryName, 80) || undefined,
  };
}
