import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  fiscalDetails,
  hasReceiptContent,
  officialReceiptUrl,
  receiptAddress,
  receiptLines,
  recurringRuleIdOf,
} from '../domain/receiptDetails';
import { decodeFiscalPayload, normalizeFiscalResponse, parseFiscalUrl } from '../utils/fiscalReceipt';
import { ReceiptDataSchema } from '../schemas';
import type { ReceiptData } from '../types';

interface Fixture {
  url: string;
  api: unknown;
  specifications: unknown;
}

const fixture = (n: number): Fixture =>
  JSON.parse(readFileSync(`tests/fixtures/fiscal/sample${n}.json`, 'utf8')) as Fixture;

const scanned = (n: number) => {
  const sample = fixture(n);
  const parsed = parseFiscalUrl(sample.url)!;
  const receipt = normalizeFiscalResponse(sample.api, sample.specifications, decodeFiscalPayload(parsed.vl))!;
  return { sample, receipt };
};

describe('fiscalDetails', () => {
  it('keeps the shop details and a normalized link to the official receipt', () => {
    const { sample, receipt } = scanned(1);
    const details = fiscalDetails(receipt, sample.url);
    expect(details.url).toBe(parseFiscalUrl(sample.url)!.url);
    expect(details.invoiceNumber).toBe(receipt.invoiceNumber);
    expect(details.pib).toBe(receipt.pib);
    if (receipt.address) expect(details.address).toBe(receipt.address.replace(/\s+/g, ' ').trim());
  });

  it('drops the company name when it only repeats the shop name, and empty fields', () => {
    const { sample, receipt } = scanned(2);
    const details = fiscalDetails({ ...receipt, companyName: `  ${receipt.merchant.toUpperCase()}. `, city: '  ' }, sample.url);
    expect(details).not.toHaveProperty('companyName');
    expect(details).not.toHaveProperty('city');
  });

  it('stores no link for a URL that is not a tax portal receipt', () => {
    const { receipt } = scanned(3);
    expect(fiscalDetails(receipt, 'https://example.com/v/?vl=abc')).not.toHaveProperty('url');
  });

  it('survives the stored-state schema with every field', () => {
    const { sample, receipt } = scanned(4);
    const data: ReceiptData = {
      items: [{ name: 'Hleb', price: 89, quantity: 1 }],
      total: receipt.total,
      merchant: receipt.merchant,
      ...fiscalDetails(receipt, sample.url),
    };
    expect(ReceiptDataSchema.parse(data)).toEqual(data);
  });
});

describe('officialReceiptUrl', () => {
  const base: ReceiptData = { items: [], total: 0, merchant: 'Shop' };

  it('links only real tax portal receipts', () => {
    const { sample } = scanned(5);
    expect(officialReceiptUrl({ ...base, url: sample.url })).toBe(parseFiscalUrl(sample.url)!.url);
    // Team entries come from other people: anything else is never rendered as a link.
    expect(officialReceiptUrl({ ...base, url: 'javascript:alert(1)' })).toBeNull();
    expect(officialReceiptUrl({ ...base, url: 'https://suf.purs.gov.rs.evil.com/v/?vl=AAAA' })).toBeNull();
    expect(officialReceiptUrl(base)).toBeNull();
    expect(officialReceiptUrl(undefined)).toBeNull();
  });
});

describe('receiptLines', () => {
  it('turns unit prices into line totals and reads a missing quantity as 1', () => {
    const lines = receiptLines({
      merchant: 'Maxi',
      total: 0,
      items: [
        { name: ' Mleko ', price: 129.99, quantity: 3 },
        { name: 'Banane', price: 199, quantity: 0.452 },
        { name: 'Hleb', price: 89, quantity: Number.NaN },
        { name: '  ', price: 0, quantity: 1 },
      ],
    });
    expect(lines).toEqual([
      { name: 'Mleko', quantity: 3, unitPrice: 129.99, total: 389.97 },
      { name: 'Banane', quantity: 0.452, unitPrice: 199, total: 89.95 },
      { name: 'Hleb', quantity: 1, unitPrice: 89, total: 89 },
    ]);
  });
});

describe('receipt helpers', () => {
  it('shows a receipt card only when there is more than a merchant name', () => {
    expect(hasReceiptContent(undefined)).toBe(false);
    expect(hasReceiptContent({ items: [], total: 500, merchant: 'Kiosk' })).toBe(false);
    expect(hasReceiptContent({ items: [{ name: 'Kafa', price: 250, quantity: 1 }], total: 250, merchant: '' })).toBe(true);
    expect(hasReceiptContent({ items: [], total: 500, merchant: 'Kiosk', invoiceNumber: 'AB-CD-1' })).toBe(true);
  });

  it('writes the address on one line', () => {
    expect(receiptAddress({ items: [], total: 0, merchant: '', address: 'Bulevar  12', city: 'Beograd' })).toBe('Bulevar 12, Beograd');
    expect(receiptAddress({ items: [], total: 0, merchant: '' })).toBe('');
  });

  it('finds the recurring rule behind a generated occurrence', () => {
    expect(recurringRuleIdOf('rec:5f1c-rule:2026-11-01')).toBe('5f1c-rule');
    expect(recurringRuleIdOf('rec:2026-11-01')).toBeNull();
    expect(recurringRuleIdOf('plain-id')).toBeNull();
  });
});
