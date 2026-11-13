import { cyrillicToLatin } from './aiShared';

/**
 * NBS IPS QR: the Serbian instant payment QR code every Serbian bank app scans.
 *
 * Rules from the NBS decision on instant credit transfers, Annex 1, and the NBS validation
 * recommendations (ips.nbs.rs/PDF/pdfPreporukeValidacijaEng.pdf):
 * - fields are `TAG:value` pairs joined by `|`, no leading or trailing `|`, optional tags are
 *   left out entirely when empty (never `|S:|`), UTF-8 (C:1);
 * - K identifies the content: PR (payee, also printed bills), PT/PK (point of sale), EK (e-commerce);
 * - R is the payee account as exactly 18 digits (bank 3 + account 13 zero padded + control 2),
 *   valid under ISO 7064 MOD 97-10 (the whole number mod 97 is 1);
 * - N is the payee name, up to 3 lines and 70 characters including spaces and line breaks;
 * - I is `RSD` + amount with a decimal comma, 5 to 18 characters, RSD0,01 to RSD999999999999,99;
 * - SF is a 3 digit payment code (289: cashless payment ordered by a household);
 * - S is the payment purpose, one line, up to 35 characters;
 * - RO is the model (2 digits, 00 when none) plus the reference, up to 25 characters;
 * - text uses Latin letters of Serbian and English, digits, spaces and a fixed list of specials.
 */

export const IPS_LIMITS = { name: 70, nameLines: 3, payer: 70, purpose: 35, reference: 25 } as const;
/** Cashless payment ordered by a household: what one person paying another uses. */
export const IPS_DEFAULT_PAYMENT_CODE = '289';
export const IPS_MAX_AMOUNT = 999_999_999_999.99;

export type IpsKind = 'PR' | 'PT' | 'PK' | 'EK';
const KINDS: readonly IpsKind[] = ['PR', 'PT', 'PK', 'EK'];

// ---------------------------------------------------------------------------
// Account numbers
// ---------------------------------------------------------------------------

/** Remainder of a decimal string divided by 97, digit by digit (no BigInt needed). */
const mod97 = (digits: string): number => {
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder;
};

/** The two control digits for a 16 digit bank + account prefix. */
export const accountControlDigits = (first16: string): string =>
  String(98 - mod97(`${first16}00`)).padStart(2, '0');

/** True for an 18 digit account whose control digits check out. */
export const isValidAccountNumber = (digits: string): boolean => /^\d{18}$/.test(digits) && mod97(digits) === 1;

export type AccountParseResult =
  | { ok: true; digits: string }
  | { ok: false; reason: 'empty' | 'format' | 'checksum' };

/**
 * Reads an account number as people write it: `160-0000001234567-29`, `160-1234567-29`,
 * `160 0000001234567 29` or the 18 digits. The middle part is zero padded to 13 digits.
 */
export const parseAccountNumber = (input: string | null | undefined): AccountParseResult => {
  const raw = (input ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const compact = raw.replace(/\s+/g, '');
  let digits: string | null = null;
  const parts = raw.split(/[-\s]+/).filter(Boolean);
  if (/^\d{18}$/.test(compact)) {
    digits = compact;
  } else if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    const [bank, account, control] = parts;
    if (bank.length === 3 && control.length === 2 && account.length >= 1 && account.length <= 13) {
      digits = `${bank}${account.padStart(13, '0')}${control}`;
    }
  }
  if (!digits) return { ok: false, reason: 'format' };
  return isValidAccountNumber(digits) ? { ok: true, digits } : { ok: false, reason: 'checksum' };
};

/** `160000000123456729` -> `160-0000001234567-29`. */
export const formatAccountNumber = (digits: string): string =>
  /^\d{18}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3, 16)}-${digits.slice(16)}` : digits;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const SPECIALS = new Set(Array.from('!"#$%&\'()*+,-./:;<=>?@[]^_`{}~“”„‘’'));
const SERBIAN_LETTERS = new Set(Array.from('ČĆŽŠĐčćžšđ'));

const isAllowedChar = (ch: string): boolean =>
  /[A-Za-z0-9 ]/.test(ch) || SERBIAN_LETTERS.has(ch) || SPECIALS.has(ch);

/** One character as the IPS character set allows it, or '' when it has no safe form. */
const toAllowedChar = (ch: string): string => {
  if (isAllowedChar(ch)) return ch;
  if (/[‐-―−]/.test(ch)) return '-';
  if (/\s/.test(ch)) return ' ';
  // é -> e, ü -> u; anything else (emoji, other scripts, `|` which is the delimiter) is dropped.
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base.length === 1 && /[A-Za-z]/.test(base) ? base : '';
};

/** Cleans one line of text for the IPS QR: Latin script, allowed characters, single spaces. */
export const sanitizeIpsLine = (value: string | null | undefined, max: number): string => {
  const latin = cyrillicToLatin(value ?? '').normalize('NFC');
  const chars = Array.from(Array.from(latin, toAllowedChar).join('').replace(/ {2,}/g, ' ').trim());
  if (chars.length <= max) return chars.join('');
  // Too long: cut at the last word break when one is close, so "taksi" never becomes "ta".
  const cut = chars.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace >= max - 12 && lastSpace > 0 ? cut.slice(0, lastSpace) : cut).join('').replace(/[\s,;:-]+$/, '');
};

/**
 * Payee or payer block: up to three lines (name, street, place) within the 70 character limit,
 * counting the line breaks. The name always comes first and is shortened when needed; a later
 * line (street, place) is kept only when it fits whole, so no half addresses.
 */
export const buildNameBlock = (lines: readonly (string | null | undefined)[], max: number = IPS_LIMITS.name): string => {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (out.length >= IPS_LIMITS.nameLines) break;
    const separator = out.length > 0 ? 1 : 0;
    const room = max - used - separator;
    if (room < 2) break;
    const clean = sanitizeIpsLine(line, out.length === 0 ? room : Number.MAX_SAFE_INTEGER);
    if (!clean) continue;
    if (Array.from(clean).length > room) continue;
    out.push(clean);
    used += separator + Array.from(clean).length;
  }
  return out.join('\n');
};

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** `1500` -> `RSD1500,00`. Null when the amount is out of range. */
export const formatIpsAmount = (amount: number): string | null => {
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (cents < 1 || cents > Math.round(IPS_MAX_AMOUNT * 100)) return null;
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `RSD${whole},${fraction}`;
};

/** Reads `RSD3702,65`, `RSD1025,`, `RSD1025,1` (and a decimal point, leniently). */
export const parseIpsAmount = (value: string): { currency: string; amount: number } | null => {
  const match = /^([A-Z]{3})\s?(\d{1,12})(?:[,.](\d{0,2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, currency, whole, fraction = ''] = match;
  const amount = Number(whole) + Number(fraction.padEnd(2, '0')) / 100;
  return Number.isFinite(amount) ? { currency, amount } : null;
};

// ---------------------------------------------------------------------------
// Building a payment request
// ---------------------------------------------------------------------------

export interface IpsPaymentRequest {
  /** Payee account in any common spelling. */
  account: string;
  /** Payee name as it should appear in the payer's bank app. */
  name: string;
  address?: string;
  city?: string;
  /** Amount in dinars. IPS carries RSD only. */
  amount: number;
  purpose?: string;
  paymentCode?: string;
  /** Model and reference, e.g. `97...` or `00...`. */
  reference?: string;
}

export type IpsBuildResult =
  | { ok: true; payload: string }
  | { ok: false; reason: 'account' | 'name' | 'amount' | 'paymentCode' | 'reference' };

export const buildIpsPayload = (request: IpsPaymentRequest): IpsBuildResult => {
  const account = parseAccountNumber(request.account);
  if (!account.ok) return { ok: false, reason: 'account' };
  const name = buildNameBlock([request.name, request.address, request.city]);
  if (!name || !sanitizeIpsLine(request.name, IPS_LIMITS.name)) return { ok: false, reason: 'name' };
  const amount = formatIpsAmount(request.amount);
  if (!amount) return { ok: false, reason: 'amount' };
  const paymentCode = request.paymentCode ?? IPS_DEFAULT_PAYMENT_CODE;
  if (!/^[12]\d{2}$/.test(paymentCode)) return { ok: false, reason: 'paymentCode' };
  const reference = request.reference?.replace(/\s+/g, '');
  if (reference && !/^\d{2}[0-9A-Za-z-]{1,23}$/.test(reference)) return { ok: false, reason: 'reference' };
  const purpose = sanitizeIpsLine(request.purpose, IPS_LIMITS.purpose);

  const fields: [string, string][] = [
    ['K', 'PR'],
    ['V', '01'],
    ['C', '1'],
    ['R', account.digits],
    ['N', name],
    ['I', amount],
    ['SF', paymentCode],
  ];
  if (purpose) fields.push(['S', purpose]);
  if (reference) fields.push(['RO', reference]);
  return { ok: true, payload: fields.map(([tag, value]) => `${tag}:${value}`).join('|') };
};

// ---------------------------------------------------------------------------
// Reading a scanned code (bills)
// ---------------------------------------------------------------------------

export interface IpsBill {
  kind: IpsKind;
  account?: string;
  /** Account with valid control digits. */
  accountValid: boolean;
  /** First line of N: who gets the money. */
  payee: string;
  /** All lines of N (name, street, place). */
  payeeLines: string[];
  /** 0 when the bill leaves the amount to the payer. */
  amount: number;
  currency: string;
  paymentCode?: string;
  purpose?: string;
  reference?: string;
  payer?: string;
}

const KNOWN_TAGS = new Set(['K', 'V', 'C', 'R', 'N', 'I', 'O', 'P', 'SF', 'S', 'M', 'JS', 'RK', 'RO', 'RL', 'RP']);

/** Quick test used by the scanner before full parsing. */
export const looksLikeIps = (text: string): boolean => /^\s*K:(PR|PT|PK|EK)\|/.test(text);

/**
 * Parses an IPS QR payload. Lenient where real bills are sloppy (trailing spaces or line
 * breaks, a decimal point, CRLF line breaks), strict on structure: K, V, N and I must be present.
 */
export const parseIpsPayload = (text: string | null | undefined): IpsBill | null => {
  if (!text || text.length > 2000 || !looksLikeIps(text)) return null;
  const fields = new Map<string, string>();
  for (const part of text.trim().split('|')) {
    const colon = part.indexOf(':');
    if (colon <= 0) return null;
    const tag = part.slice(0, colon).trim().toUpperCase();
    if (!KNOWN_TAGS.has(tag) || fields.has(tag)) return null;
    fields.set(tag, part.slice(colon + 1));
  }
  const kind = fields.get('K')?.trim() as IpsKind | undefined;
  if (!kind || !KINDS.includes(kind) || fields.get('V')?.trim() !== '01') return null;

  const payeeLines = (fields.get('N') ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const amount = parseIpsAmount(fields.get('I') ?? '');
  if (payeeLines.length === 0 || !amount) return null;

  const accountRaw = fields.get('R')?.trim();
  const account = accountRaw && /^\d{18}$/.test(accountRaw) ? accountRaw : undefined;
  const optional = (tag: string) => {
    const value = fields.get(tag)?.trim();
    return value ? value : undefined;
  };

  return {
    kind,
    account,
    accountValid: account ? isValidAccountNumber(account) : false,
    payee: payeeLines[0],
    payeeLines,
    amount: amount.amount,
    currency: amount.currency,
    paymentCode: optional('SF'),
    purpose: optional('S'),
    reference: optional('RO'),
    payer: optional('P')?.split(/\r\n|\r|\n/)[0]?.trim(),
  };
};

// ---------------------------------------------------------------------------
// Category for a scanned bill
// ---------------------------------------------------------------------------

interface BillCategoryLike {
  name: string;
  type?: string;
  subcategories?: string[];
}

/** Common Serbian payees and purposes; `category` and `subcategory` match the user's own names. */
const BILL_RULES: { text: RegExp; category: RegExp; subcategory?: RegExp }[] = [
  {
    // Phone, internet and TV.
    text: /\b(telekom|mts|sbb|yettel|telenor|a1 srbija|vip mobile|orion telekom|supernova|internet|kablovsk|mobiln)/i,
    category: /internet|phone|telefon|telecom|utilit|komunal|režij|rezij|housing|stanovanj|bills|račun/i,
    subcategory: /internet|phone|telefon/i,
  },
  {
    // Electricity, heating, water, gas, waste, joint utility bills.
    text: /\b(eps|elektroprivred|elektrodistribuc|el\.? ?energ|struj|infostan|toplan|toplifikac|vodovod|kanalizac|srbijagas|gas\b|gradska čistoća|gradska cistoca|čistoća|cistoca|jkp|jp |komunal|stambena zajednic|upravnik)/i,
    category: /utilit|komunal|režij|rezij|housing|stanovanj|bills|račun|home|dom/i,
    subcategory: /utilit|komunal|režij|rezij|struj|bills/i,
  },
  {
    // Rent.
    text: /\b(zakup|kirij|stanarin|rent)\b/i,
    category: /housing|stanovanj|rent|kirij|home|dom/i,
    subcategory: /rent|kirij|zakup|stanarin/i,
  },
];

/**
 * Picks an expense category (and subcategory when the user has a fitting one) for a bill from
 * its payee and purpose. Returns undefined when nothing matches.
 */
export const suggestIpsCategory = (
  bill: Pick<IpsBill, 'payeeLines' | 'purpose'>,
  categories: readonly BillCategoryLike[],
): { categoryName: string; subcategory?: string } | undefined => {
  const expense = categories.filter((c) => !c.type || c.type === 'expense');
  const text = `${bill.payeeLines.join(' ')} ${bill.purpose ?? ''}`;
  for (const rule of BILL_RULES) {
    if (!rule.text.test(text)) continue;
    const match = expense.find((c) => rule.category.test(c.name));
    if (!match) continue;
    const subcategory = rule.subcategory ? match.subcategories?.find((s) => rule.subcategory!.test(s)) : undefined;
    return { categoryName: match.name, subcategory };
  }
  return undefined;
};
