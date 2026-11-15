/**
 * What a stored receipt shows on the entry details sheet, and what a fiscal receipt keeps.
 * Receipt data on team entries comes from other people, so links are re-validated before use.
 */
import type { ReceiptData } from '../types';
import { parseFiscalUrl, type FiscalReceipt } from '../utils/fiscalReceipt';
import { isReceiptPhotoPath } from './receiptPhoto';

const clip = (value: string | undefined, max: number): string | undefined => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text ? text.slice(0, max) : undefined;
};

const squash = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Shop details and the verification link worth keeping from a fiscal receipt. */
export const fiscalDetails = (receipt: FiscalReceipt, url: string): Partial<ReceiptData> => {
  const details: Partial<ReceiptData> = {};
  const link = parseFiscalUrl(url)?.url;
  if (link) details.url = link;
  const company = clip(receipt.companyName, 120);
  // The company is worth showing only when it is not just the shop name again.
  if (company && squash(company) !== squash(receipt.merchant)) details.companyName = company;
  const address = clip(receipt.address, 120);
  if (address) details.address = address;
  const city = clip(receipt.city, 60);
  if (city) details.city = city;
  const pib = clip(receipt.pib, 20);
  if (pib) details.pib = pib;
  const invoiceNumber = clip(receipt.invoiceNumber, 64);
  if (invoiceNumber) details.invoiceNumber = invoiceNumber;
  return details;
};

/** The official receipt page on the tax portal, only when the stored link really is one. */
export const officialReceiptUrl = (receipt: ReceiptData | undefined): string | null => {
  if (!receipt?.url) return null;
  return parseFiscalUrl(receipt.url)?.url ?? null;
};

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/** Printable receipt lines: blank rows dropped, a missing quantity read as 1. */
export const receiptLines = (receipt: ReceiptData): ReceiptLine[] =>
  (Array.isArray(receipt.items) ? receipt.items : [])
    .filter(item => item && (String(item.name ?? '').trim() || Number(item.price)))
    .map(item => {
      const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      const unitPrice = Number.isFinite(item.price) ? item.price : 0;
      return { name: String(item.name ?? '').trim(), quantity, unitPrice, total: cents(unitPrice * quantity) };
    });

/** Shop address on one line ("Bulevar 12, Beograd"). */
export const receiptAddress = (receipt: ReceiptData): string =>
  [clip(receipt.address, 120), clip(receipt.city, 60)].filter(Boolean).join(', ');

/** Whether the receipt has anything beyond the merchant name worth a receipt card. */
export const hasReceiptContent = (receipt: ReceiptData | undefined): receipt is ReceiptData =>
  !!receipt && (receiptLines(receipt).length > 0 || !!officialReceiptUrl(receipt) || !!receipt.invoiceNumber || isReceiptPhotoPath(receipt.photo));

/** Recurring rule behind a generated occurrence (`rec:<ruleId>:<yyyy-mm-dd>`), if any. */
export const recurringRuleIdOf = (transactionId: string): string | null => {
  if (!transactionId.startsWith('rec:')) return null;
  const end = transactionId.lastIndexOf(':');
  return end > 4 ? transactionId.slice(4, end) : null;
};
