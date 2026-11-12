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
