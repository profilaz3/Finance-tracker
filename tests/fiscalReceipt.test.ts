import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cleanItemName,
  decodeFiscalPayload,
  extractSpecificationToken,
  normalizeFiscalResponse,
  parseFiscalUrl,
  parseJournalItems,
  parseSerbianNumber,
  parseSpecifications,
  receiptFromPayload,
  suggestFiscalCategory,
  tidyName,
  validateFiscalReceipt,
} from '../utils/fiscalReceipt';

interface Fixture {
  url: string;
  api: { journal: string; invoiceResult: { totalAmount: number; invoiceNumber: string; sdcTime: string } };
  specifications: unknown;
}

// Public sample receipts from the MIT licensed turanjanin/serbian-fiscal-receipts-parser project,
// with the portal's JSON and /specifications responses captured live.
const fixture = (n: number): Fixture =>
  JSON.parse(readFileSync(`tests/fixtures/fiscal/sample${n}.json`, 'utf8')) as Fixture;
const SAMPLES = [1, 2, 3, 4, 5].map(fixture);

describe('parseFiscalUrl', () => {
  it('accepts every sample verification URL and keeps + in the payload', () => {
    for (const sample of SAMPLES) {
      const parsed = parseFiscalUrl(sample.url);
      expect(parsed, sample.url.slice(0, 60)).not.toBeNull();
      expect(parsed!.url.startsWith('https://suf.purs.gov.rs/v/?vl=')).toBe(true);
    }
    // sample4 has a raw (unencoded) + and / in its query.
    expect(parseFiscalUrl(SAMPLES[3].url)!.vl).toContain('+');
  });

  it('rejects other hosts, schemes, paths and garbage', () => {
    const vl = parseFiscalUrl(SAMPLES[0].url)!.vl;
    const q = `?vl=${encodeURIComponent(vl)}`;
    expect(parseFiscalUrl(`http://suf.purs.gov.rs/v/${q}`)).toBeNull();
    expect(parseFiscalUrl(`https://suf.purs.gov.rs.evil.com/v/${q}`)).toBeNull();
    expect(parseFiscalUrl(`https://evil.com/v/${q}`)).toBeNull();
    expect(parseFiscalUrl(`https://suf.purs.gov.rs:8443/v/${q}`)).toBeNull();
    expect(parseFiscalUrl(`https://user@suf.purs.gov.rs/v/${q}`)).toBeNull();
    expect(parseFiscalUrl(`https://suf.purs.gov.rs/specifications${q}`)).toBeNull();
    expect(parseFiscalUrl('https://suf.purs.gov.rs/v/?vl=AAAA')).toBeNull();
    expect(parseFiscalUrl('https://example.com/menu')).toBeNull();
    expect(parseFiscalUrl('WIFI:S:home;T:WPA;P:secret;;')).toBeNull();
    expect(parseFiscalUrl('')).toBeNull();
  });

  it('tolerates a scanner that turned + into spaces', () => {
    const { vl } = parseFiscalUrl(SAMPLES[3].url)!;
    const spaced = `https://suf.purs.gov.rs/v/?vl=${vl.replace(/\+/g, ' ')}`;
    expect(parseFiscalUrl(spaced)?.vl).toBe(vl);
  });
});

describe('decodeFiscalPayload', () => {
  it('reads total, time and invoice number that match the portal response', () => {
    for (const sample of SAMPLES) {
      const payload = decodeFiscalPayload(parseFiscalUrl(sample.url)!.vl)!;
      expect(payload.totalAmount).toBe(sample.api.invoiceResult.totalAmount);
      expect(payload.invoiceNumber).toBe(sample.api.invoiceResult.invoiceNumber);
      expect(Math.abs(Date.parse(payload.date) - Date.parse(sample.api.invoiceResult.sdcTime))).toBeLessThan(1000);
      expect(payload.invoiceType).toBe(0);
      expect(payload.transactionType).toBe(0);
    }
  });

  it('builds a partial receipt from the payload alone', () => {
    const payload = decodeFiscalPayload(parseFiscalUrl(SAMPLES[4].url)!.vl)!;
    const partial = receiptFromPayload(payload);
    expect(partial).toMatchObject({ partial: true, total: 1500, currency: 'RSD', items: [] });
  });
});

describe('portal parsing', () => {
  it('normalizes the restaurant sample with clean item names from /specifications', () => {
    const sample = SAMPLES[4];
    const payload = decodeFiscalPayload(parseFiscalUrl(sample.url)!.vl);
    const receipt = normalizeFiscalResponse(sample.api, sample.specifications, payload)!;
    expect(receipt).toMatchObject({
      merchant: 'Pleasure Park Čair',
      pib: '112392483',
      total: 1500,
      currency: 'RSD',
      invoiceNumber: 'VBMHX9SX-W6UBPZO0-76722',
      partial: false,
    });
    expect(receipt.items).toEqual([
      { name: 'Burito sa piletinom', quantity: 1, unitPrice: 650, total: 650, taxLabel: 'Ђ' },
      { name: 'Grcki omlet', quantity: 1, unitPrice: 490, total: 490, taxLabel: 'Ђ' },
      { name: 'Elixir mix 0.33l', quantity: 1, unitPrice: 360, total: 360, taxLabel: 'Ђ' },
    ]);
    expect(receipt.journal).toContain('ФИСКАЛНИ РАЧУН');
  });

  it('falls back to journal items that agree with the specifications', () => {
    for (const sample of SAMPLES) {
      const fromJournal = parseJournalItems(sample.api.journal);
      const fromSpecs = parseSpecifications(sample.specifications)!;
      expect(fromJournal.map((i) => i.total)).toEqual(fromSpecs.map((i) => i.total));
      expect(fromJournal.map((i) => i.quantity)).toEqual(fromSpecs.map((i) => i.quantity));
      const sum = fromJournal.reduce((s, i) => s + i.total, 0);
      expect(Math.round(sum * 100) / 100).toBe(sample.api.invoiceResult.totalAmount);
    }
    const receipt = normalizeFiscalResponse(SAMPLES[4].api, { success: false }, null)!;
    expect(receipt.items.map((i) => i.name)).toEqual(['Burito sa piletinom', 'Grcki omlet', 'Elixir mix 0.33l']);
  });

  it('parses weighed items, codes and multi-line names in a journal', () => {
    const journal = [
      '============ ФИСКАЛНИ РАЧУН ============',
      'header',
      '========================================',
      'Назив   Цена         Кол.         Укупно',
      '123456 BANANE KG (Е)',
      '       149,99      0,754          113,09',
      'JOGURT 1,5% MASNOCE 1L TETRA PAK SA',
      'POKLOPCEM/KOM (Ђ)',
      '       139,99          2          279,98',
      '----------------------------------------',
      'Укупан износ:                     393,07',
      '========================================',
    ].join('\r\n');
    expect(parseJournalItems(journal)).toEqual([
      { name: 'BANANE KG', quantity: 0.754, unitPrice: 149.99, total: 113.09, taxLabel: 'Е' },
      { name: 'JOGURT 1,5% MASNOCE 1L TETRA PAK SA POKLOPCEM/KOM', quantity: 2, unitPrice: 139.99, total: 279.98, taxLabel: 'Ђ' },
    ]);
  });

  it('reads the specifications token from the verification page', () => {
    const html = "viewModel.InvoiceNumber('A-B-1');\n viewModel.Token('2b9a7657-6dcb-4645-ac03-10fb2350e914');";
    expect(extractSpecificationToken(html)).toBe('2b9a7657-6dcb-4645-ac03-10fb2350e914');
    expect(extractSpecificationToken('<html></html>')).toBeNull();
  });

  it('formats numbers and names', () => {
    expect(parseSerbianNumber('1.500,00')).toBe(1500);
    expect(parseSerbianNumber('0,754')).toBe(0.754);
    expect(parseSerbianNumber('abc')).toBeNull();
    expect(tidyName('RESTAURANT PLEASURE PARK ČAIR')).toBe('Restaurant Pleasure Park Čair');
    expect(tidyName('ETER DOO')).toBe('Eter DOO');
    expect(tidyName('Mixed Case')).toBe('Mixed Case');
    expect(cleanItemName('Iced Coffee vel. (Ђ)')).toBe('Iced Coffee vel.');
  });
});

describe('suggestFiscalCategory', () => {
  const categories = [
    { name: 'Groceries', type: 'expense' },
    { name: 'Dining Out', type: 'expense' },
    { name: 'Fuel', type: 'expense' },
    { name: 'Salary', type: 'income' },
  ];

  it('maps cafes and restaurants to dining', () => {
    const receipt = normalizeFiscalResponse(SAMPLES[3].api, SAMPLES[3].specifications, null)!;
    // "ETER DOO - Lounge bar EPIC" reads as the shop, not the company.
    expect(receipt.merchant).toBe('Lounge bar EPIC');
    expect(suggestFiscalCategory(receipt, categories)).toBe('Dining Out');
  });

  it('maps supermarkets, fuel and unknown shops', () => {
    const base = { companyName: '', shopName: '', items: [] };
    expect(suggestFiscalCategory({ ...base, merchant: 'Maxi 123' }, categories)).toBe('Groceries');
    expect(suggestFiscalCategory({ ...base, merchant: 'NIS Petrol BS Novi Sad' }, categories)).toBe('Fuel');
    expect(suggestFiscalCategory({ ...base, merchant: 'Some Shop' }, categories)).toBeUndefined();
    expect(suggestFiscalCategory({ ...base, merchant: 'Maxi' }, [{ name: 'Salary', type: 'income' }])).toBeUndefined();
  });
});

describe('validateFiscalReceipt', () => {
  it('round trips a normalized receipt and rejects junk', () => {
    const receipt = normalizeFiscalResponse(SAMPLES[0].api, SAMPLES[0].specifications, null)!;
    const viaJson = validateFiscalReceipt(JSON.parse(JSON.stringify({ ...receipt, categoryName: 'Dining Out' })));
    expect(viaJson).toEqual({ ...receipt, categoryName: 'Dining Out' });
    expect(validateFiscalReceipt({ total: 'x' })).toBeNull();
    expect(validateFiscalReceipt(null)).toBeNull();
  });
});
