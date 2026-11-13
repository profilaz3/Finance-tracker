import { describe, expect, it } from 'vitest';
import {
  accountControlDigits,
  buildIpsPayload,
  buildNameBlock,
  formatAccountNumber,
  formatIpsAmount,
  isValidAccountNumber,
  looksLikeIps,
  parseAccountNumber,
  parseIpsAmount,
  parseIpsPayload,
  sanitizeIpsLine,
  suggestIpsCategory,
} from '../utils/ipsQr';
import { INITIAL_CATEGORIES as DEFAULT_CATEGORIES } from '../constants';

// Made-up account: bank 160 with an invented account body and correct control digits.
const BODY = '1600000001234567';
const DUMMY = `${BODY}${accountControlDigits(BODY)}`;
// The public example from the NBS IPS QR annex (JP EPS Beograd).
const NBS_EXAMPLE = 'K:PR|V:01|C:1|R:845000000040484987|N:JP EPS BEOGRAD|I:RSD3702,65|SF:289|S:UPLATA PO RAČUNU ZA EL. ENERGIJU|RO:97163220000111111111000';

describe('account numbers', () => {
  it('checks control digits with mod 97', () => {
    expect(DUMMY).toBe('160000000123456729');
    expect(isValidAccountNumber(DUMMY)).toBe(true);
    expect(isValidAccountNumber('845000000040484987')).toBe(true);
    expect(isValidAccountNumber('845000000040484988')).toBe(false);
    expect(isValidAccountNumber('84500000004048498')).toBe(false);
  });

  it('reads dashed, short, spaced and plain forms', () => {
    expect(parseAccountNumber('160-0000001234567-29')).toEqual({ ok: true, digits: DUMMY });
    expect(parseAccountNumber('160-1234567-29')).toEqual({ ok: true, digits: DUMMY });
    expect(parseAccountNumber(' 160 0000001234567 29 ')).toEqual({ ok: true, digits: DUMMY });
    expect(parseAccountNumber(DUMMY)).toEqual({ ok: true, digits: DUMMY });
    // NBS examples: 840-955845-10 and 165-55-74 are zero padded in the middle.
    expect(parseAccountNumber('840-955845-10')).toEqual({ ok: true, digits: '840000000095584510' });
  });

  it('explains what is wrong', () => {
    expect(parseAccountNumber('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseAccountNumber('160-12a4567-29')).toEqual({ ok: false, reason: 'format' });
    expect(parseAccountNumber('16-1234567-29')).toEqual({ ok: false, reason: 'format' });
    expect(parseAccountNumber('160-12345678901234-29')).toEqual({ ok: false, reason: 'format' });
    expect(parseAccountNumber('160-1234567-28')).toEqual({ ok: false, reason: 'checksum' });
  });

  it('formats as bank-account-control', () => {
    expect(formatAccountNumber(DUMMY)).toBe('160-0000001234567-29');
    expect(formatAccountNumber('123')).toBe('123');
  });
});

describe('text rules', () => {
  it('turns Cyrillic into Latin and keeps Serbian letters', () => {
    expect(sanitizeIpsLine('Ђорђе Јовановић', 70)).toBe('Đorđe Jovanović');
    expect(sanitizeIpsLine('Čačak Šabac Žabalj', 70)).toBe('Čačak Šabac Žabalj');
  });

  it('drops the delimiter, emoji and foreign accents, keeps allowed specials', () => {
    expect(sanitizeIpsLine('Café | pizza 🍕 (50%)', 70)).toBe('Cafe pizza (50%)');
    expect(sanitizeIpsLine('„Nova” 5/2 \u2013 stan', 70)).toBe('„Nova” 5/2 - stan');
    expect(sanitizeIpsLine('a\nb\tc', 70)).toBe('a b c');
  });

  it('cuts long text at a word break', () => {
    const purpose = sanitizeIpsLine('Izmirenje duga sa Anom, večera i taksi u gradu', 35);
    expect(purpose).toBe('Izmirenje duga sa Anom, večera i');
    expect(Array.from(purpose).length).toBeLessThanOrEqual(35);
    expect(sanitizeIpsLine('x'.repeat(50), 35)).toHaveLength(35);
  });

  it('builds the payee block within 3 lines and 70 characters', () => {
    expect(buildNameBlock(['Petar Petrović', 'Kneza Miloša 12', 'Beograd'])).toBe('Petar Petrović\nKneza Miloša 12\nBeograd');
    expect(buildNameBlock(['Ana', '', 'Niš'])).toBe('Ana\nNiš');
    const long = buildNameBlock(['A'.repeat(60), 'Bulevar kralja Aleksandra 123', 'Niš']);
    expect(long).toBe(`${'A'.repeat(60)}\nNiš`);
    expect(Array.from(buildNameBlock(['N'.repeat(90)])).length).toBe(70);
    expect(buildNameBlock(['a', 'b', 'c', 'd']).split('\n')).toHaveLength(3);
  });
});

describe('amounts', () => {
  it('uses a decimal comma and two decimals', () => {
    expect(formatIpsAmount(1500)).toBe('RSD1500,00');
    expect(formatIpsAmount(2345.5)).toBe('RSD2345,50');
    expect(formatIpsAmount(0.01)).toBe('RSD0,01');
    expect(formatIpsAmount(0.1 + 0.2)).toBe('RSD0,30');
    expect(formatIpsAmount(999999999999.99)).toBe('RSD999999999999,99');
  });

  it('rejects amounts out of range', () => {
    expect(formatIpsAmount(0)).toBeNull();
    expect(formatIpsAmount(-5)).toBeNull();
    expect(formatIpsAmount(1e13)).toBeNull();
    expect(formatIpsAmount(Number.NaN)).toBeNull();
  });

  it('parses the spellings bills use', () => {
    expect(parseIpsAmount('RSD3702,65')).toEqual({ currency: 'RSD', amount: 3702.65 });
    expect(parseIpsAmount('RSD1025,')).toEqual({ currency: 'RSD', amount: 1025 });
    expect(parseIpsAmount('RSD1025,1')).toEqual({ currency: 'RSD', amount: 1025.1 });
    expect(parseIpsAmount('RSD1025.12')).toEqual({ currency: 'RSD', amount: 1025.12 });
    expect(parseIpsAmount('RSD0,00')).toEqual({ currency: 'RSD', amount: 0 });
    expect(parseIpsAmount('RSD,01')).toBeNull();
  });
});

describe('buildIpsPayload', () => {
  it('produces the canonical tag order without empty optional tags', () => {
    expect(buildIpsPayload({ account: '160-1234567-29', name: 'Petar Petrović', amount: 1500, purpose: 'Bergamo' })).toEqual({
      ok: true,
      payload: `K:PR|V:01|C:1|R:${DUMMY}|N:Petar Petrović|I:RSD1500,00|SF:289|S:Bergamo`,
    });
    const bare = buildIpsPayload({ account: DUMMY, name: 'Ana', amount: 10, purpose: '   ' });
    expect(bare.ok && bare.payload).toBe(`K:PR|V:01|C:1|R:${DUMMY}|N:Ana|I:RSD10,00|SF:289`);
  });

  it('adds address lines and a reference', () => {
    const result = buildIpsPayload({ account: DUMMY, name: 'Ana', address: 'Nova 5', city: 'Niš', amount: 99.9, reference: '00 123' });
    expect(result.ok && result.payload).toBe(`K:PR|V:01|C:1|R:${DUMMY}|N:Ana\nNova 5\nNiš|I:RSD99,90|SF:289|RO:00123`);
  });

  it('never lets user text break the field structure', () => {
    const result = buildIpsPayload({ account: DUMMY, name: 'Ana|I:RSD1,00', amount: 5, purpose: 'x|SF:189' });
    expect(result.ok).toBe(true);
    const fields = result.ok ? result.payload.split('|') : [];
    expect(fields.map((field) => field.split(':')[0])).toEqual(['K', 'V', 'C', 'R', 'N', 'I', 'SF', 'S']);
  });

  it('refuses bad input', () => {
    expect(buildIpsPayload({ account: '160-1234567-28', name: 'Ana', amount: 5 })).toEqual({ ok: false, reason: 'account' });
    expect(buildIpsPayload({ account: DUMMY, name: ' 🍕 ', amount: 5 })).toEqual({ ok: false, reason: 'name' });
    expect(buildIpsPayload({ account: DUMMY, name: 'Ana', amount: 0 })).toEqual({ ok: false, reason: 'amount' });
    expect(buildIpsPayload({ account: DUMMY, name: 'Ana', amount: 5, paymentCode: '389' })).toEqual({ ok: false, reason: 'paymentCode' });
    expect(buildIpsPayload({ account: DUMMY, name: 'Ana', amount: 5, reference: 'x' })).toEqual({ ok: false, reason: 'reference' });
  });

  it('stays well under the version 13 size limit at error correction M (331 bytes)', () => {
    const result = buildIpsPayload({
      account: DUMMY,
      name: 'Đ'.repeat(80),
      address: 'Š'.repeat(30),
      city: 'Ž'.repeat(10),
      amount: 999999999999.99,
      purpose: 'Č'.repeat(40),
      reference: `00${'1'.repeat(23)}`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(new TextEncoder().encode(result.payload).length).toBeLessThanOrEqual(331);
  });
});

describe('parseIpsPayload', () => {
  it('reads the NBS example bill', () => {
    expect(parseIpsPayload(NBS_EXAMPLE)).toEqual({
      kind: 'PR',
      account: '845000000040484987',
      accountValid: true,
      payee: 'JP EPS BEOGRAD',
      payeeLines: ['JP EPS BEOGRAD'],
      amount: 3702.65,
      currency: 'RSD',
      paymentCode: '289',
      purpose: 'UPLATA PO RAČUNU ZA EL. ENERGIJU',
      reference: '97163220000111111111000',
      payer: undefined,
    });
  });

  it('round-trips what we build', () => {
    const built = buildIpsPayload({ account: DUMMY, name: 'Ana Anić', address: 'Nova 5', city: 'Niš', amount: 1234.5, purpose: 'Bergamo' });
    const bill = built.ok ? parseIpsPayload(built.payload) : null;
    expect(bill).toMatchObject({ kind: 'PR', account: DUMMY, accountValid: true, payee: 'Ana Anić', payeeLines: ['Ana Anić', 'Nova 5', 'Niš'], amount: 1234.5, purpose: 'Bergamo' });
  });

  it('tolerates CRLF lines, trailing whitespace and a payer block', () => {
    const bill = parseIpsPayload(`K:PR|V:01|C:1|R:${DUMMY}|N:Infostan\r\nBeograd|I:RSD0,00|P:Petar Petrović\r\nNova 1|SF:289\n`);
    expect(bill).toMatchObject({ payee: 'Infostan', payeeLines: ['Infostan', 'Beograd'], amount: 0, payer: 'Petar Petrović', paymentCode: '289' });
  });

  it('flags a bad account but still reads the bill', () => {
    expect(parseIpsPayload(NBS_EXAMPLE.replace('987', '988'))).toMatchObject({ accountValid: false, payee: 'JP EPS BEOGRAD' });
  });

  it('ignores anything that is not an IPS code', () => {
    expect(looksLikeIps('https://suf.purs.gov.rs/v/?vl=abc')).toBe(false);
    expect(parseIpsPayload('https://suf.purs.gov.rs/v/?vl=abc')).toBeNull();
    expect(parseIpsPayload('K:XX|V:01|N:a|I:RSD1,00')).toBeNull();
    expect(parseIpsPayload('K:PR|V:02|N:a|I:RSD1,00')).toBeNull();
    expect(parseIpsPayload('K:PR|V:01|I:RSD1,00')).toBeNull();
    expect(parseIpsPayload('K:PR|V:01|N:a|I:EUR')).toBeNull();
    expect(parseIpsPayload('K:PR|V:01|N:a|N:b|I:RSD1,00')).toBeNull();
    expect(parseIpsPayload('K:PR|V:01|N:a|ZZ:1|I:RSD1,00')).toBeNull();
    expect(parseIpsPayload(null)).toBeNull();
  });
});

describe('suggestIpsCategory', () => {
  const bill = (payee: string, purpose?: string) => ({ payeeLines: [payee], purpose });

  it('files electricity and joint utility bills under utilities', () => {
    expect(suggestIpsCategory(bill('JP EPS BEOGRAD', 'UPLATA PO RAČUNU ZA EL. ENERGIJU'), DEFAULT_CATEGORIES)).toEqual({ categoryName: 'Housing', subcategory: 'Utilities' });
    expect(suggestIpsCategory(bill('JKP INFOSTAN TEHNOLOGIJE'), DEFAULT_CATEGORIES)).toEqual({ categoryName: 'Housing', subcategory: 'Utilities' });
  });

  it('files phone and internet bills under internet', () => {
    expect(suggestIpsCategory(bill('SBB d.o.o.', 'Pretplata'), DEFAULT_CATEGORIES)).toEqual({ categoryName: 'Housing', subcategory: 'Internet' });
  });

  it('uses the user\'s own category names and skips income categories', () => {
    const custom = [
      { name: 'Režije', type: 'income' },
      { name: 'Komunalije', type: 'expense', subcategories: [] },
    ];
    expect(suggestIpsCategory(bill('Vodovod i kanalizacija'), custom)).toEqual({ categoryName: 'Komunalije', subcategory: undefined });
  });

  it('returns undefined for unknown payees', () => {
    expect(suggestIpsCategory(bill('Ana Anić', 'Bergamo'), DEFAULT_CATEGORIES)).toBeUndefined();
  });
});
