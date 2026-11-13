import { Currency } from '../types.ts';

const VALID_CURRENCIES: Currency[] = ['EUR', 'USD', 'RSD'];
const VALID_TRANSACTION_TYPES = ['income', 'expense'] as const;

export interface ParsedTransaction {
  amount: number;
  currency: Currency;
  categoryName: string;
  subcategory?: string;
  type: 'income' | 'expense';
  note: string;
  date: string;
  accountName?: string;
  debtName?: string;
  loanName?: string;
  fees?: number;
  /** Shop, venue or payee name only, when the text names one. */
  merchant?: string;
}

export interface MerchantHint {
  merchant: string;
  category: string;
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l',
  љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

/** Serbian Cyrillic to Latin (latinica), keeping case. Other characters pass through. */
export function cyrillicToLatin(text: string): string {
  return text.replace(/[\u0400-\u04ff]/g, (ch) => {
    const lower = ch.toLowerCase();
    const latin = CYRILLIC_TO_LATIN[lower];
    if (latin === undefined) return ch;
    if (ch === lower) return latin;
    return latin.charAt(0).toUpperCase() + latin.slice(1);
  });
}

export const MAX_MERCHANT_HINTS = 60;
const MAX_HINT_CHARS = 60;

/** Keeps only well-formed, bounded merchant -> category hints; anything else is dropped. */
export function sanitizeMerchantHints(value: unknown): MerchantHint[] {
  if (!Array.isArray(value)) return [];
  const hints: MerchantHint[] = [];
  for (const item of value.slice(0, MAX_MERCHANT_HINTS)) {
    if (!isRecord(item)) continue;
    const merchant = typeof item.merchant === 'string' ? item.merchant.trim().slice(0, MAX_HINT_CHARS) : '';
    const category = typeof item.category === 'string' ? item.category.trim().slice(0, MAX_HINT_CHARS) : '';
    if (merchant && category) hints.push({ merchant, category });
  }
  return hints;
}

export interface ParsedReceipt {
  amount: number;
  currency: Currency;
  categoryName: string;
  subcategory?: string;
  type: 'expense';
  note: string;
  date: string;
  accountName?: string;
  receiptData: {
    items: { name: string; price: number; quantity: number }[];
    total: number;
    merchant: string;
  };
  fees?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && VALID_CURRENCIES.includes(value as Currency);
}

function isValidTransactionType(value: unknown): value is 'income' | 'expense' {
  return typeof value === 'string' && VALID_TRANSACTION_TYPES.includes(value as 'income' | 'expense');
}

export function extractJsonObject(input: string): Record<string, unknown> | null {
  const jsonMatch = input.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function validateParsedTransaction(data: unknown): ParsedTransaction | null {
  if (!isRecord(data)) return null;

  if (typeof data.amount !== 'number' || Number.isNaN(data.amount)) return null;
  if (!isValidCurrency(data.currency)) return null;
  if (typeof data.categoryName !== 'string') return null;
  if (!isValidTransactionType(data.type)) return null;
  if (typeof data.note !== 'string') return null;
  if (typeof data.date !== 'string') return null;

  return {
    amount: data.amount,
    currency: data.currency,
    categoryName: data.categoryName,
    subcategory: typeof data.subcategory === 'string' ? data.subcategory : undefined,
    type: data.type,
    note: data.note,
    date: data.date,
    accountName: typeof data.accountName === 'string' ? data.accountName : undefined,
    debtName: typeof data.debtName === 'string' ? data.debtName : undefined,
    loanName: typeof data.loanName === 'string' ? data.loanName : undefined,
    fees: typeof data.fees === 'number' ? data.fees : undefined,
    merchant: typeof data.merchant === 'string' && data.merchant.trim() ? data.merchant.trim().slice(0, 80) : undefined,
  };
}

export function validateParsedReceipt(data: unknown): ParsedReceipt | null {
  if (!isRecord(data)) return null;

  if (typeof data.amount !== 'number' || Number.isNaN(data.amount)) return null;
  if (!isValidCurrency(data.currency)) return null;
  if (typeof data.categoryName !== 'string') return null;
  if (typeof data.note !== 'string') return null;
  if (typeof data.date !== 'string') return null;

  const receiptData = isRecord(data.receiptData) ? data.receiptData : null;
  if (!receiptData) return null;
  if (typeof receiptData.total !== 'number') return null;
  if (typeof receiptData.merchant !== 'string') return null;
  if (!Array.isArray(receiptData.items)) return null;

  const items = receiptData.items
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        name: typeof item.name === 'string' ? item.name : 'Unknown',
        price: typeof item.price === 'number' ? item.price : 0,
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      };
    })
    .filter((item): item is { name: string; price: number; quantity: number } => item !== null);

  return {
    amount: data.amount,
    currency: data.currency,
    categoryName: data.categoryName,
    subcategory: typeof data.subcategory === 'string' ? data.subcategory : undefined,
    type: 'expense',
    note: data.note,
    date: data.date,
    accountName: typeof data.accountName === 'string' ? data.accountName : undefined,
    receiptData: {
      items,
      total: receiptData.total,
      merchant: receiptData.merchant,
    },
    fees: typeof data.fees === 'number' ? data.fees : undefined,
  };
}
