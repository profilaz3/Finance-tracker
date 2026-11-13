import { describe, expect, it } from 'vitest';
import { cyrillicToLatin, sanitizeMerchantHints, validateParsedTransaction, MAX_MERCHANT_HINTS } from '../utils/aiShared';
import { validateVoiceEntry } from '../services/aiService';
import { pickRecordingMimeType } from '../hooks/useVoiceRecorder';

describe('cyrillicToLatin', () => {
  it('writes Serbian Cyrillic in latinica, keeping case', () => {
    expect(cyrillicToLatin('Платио сам хиљаду двеста динара ручак у Максију.')).toBe('Platio sam hiljadu dvesta dinara ručak u Maksiju.');
    expect(cyrillicToLatin('Љубав, Њива, Џеп, Ђак, Ћуп')).toBe('Ljubav, Njiva, Džep, Đak, Ćup');
    expect(cyrillicToLatin('Coffee 50 EUR')).toBe('Coffee 50 EUR');
  });
});

describe('sanitizeMerchantHints', () => {
  it('keeps well-formed hints, trims and bounds them', () => {
    expect(sanitizeMerchantHints([{ merchant: ' Maxi ', category: 'Groceries' }, { merchant: '', category: 'x' }, 'nope', { merchant: 'a'.repeat(200), category: 'B' }]))
      .toEqual([{ merchant: 'Maxi', category: 'Groceries' }, { merchant: 'a'.repeat(60), category: 'B' }]);
    expect(sanitizeMerchantHints('x')).toEqual([]);
    expect(sanitizeMerchantHints(Array.from({ length: 200 }, () => ({ merchant: 'm', category: 'c' })))).toHaveLength(MAX_MERCHANT_HINTS);
  });
});

describe('voice entry validation', () => {
  const parsed = { amount: 50, currency: 'EUR', categoryName: 'Coffee', type: 'expense', note: 'Coffee', date: '2026-11-12', merchant: 'Starbucks' };

  it('accepts a transcript with or without a parse', () => {
    expect(validateVoiceEntry({ transcript: ' Fifty euros coffee ', parsed })).toEqual({
      transcript: 'Fifty euros coffee',
      parsed: { ...validateParsedTransaction(parsed) },
    });
    expect(validateVoiceEntry({ transcript: 'hmm', parsed: null })).toEqual({ transcript: 'hmm', parsed: null });
  });

  it('rejects an empty transcript and drops a malformed parse', () => {
    expect(validateVoiceEntry({ transcript: '  ', parsed })).toBeNull();
    expect(validateVoiceEntry(null)).toBeNull();
    expect(validateVoiceEntry({ transcript: 'x', parsed: { amount: 'lots' } })?.parsed).toBeNull();
  });

  it('carries the merchant through the transaction validator', () => {
    expect(validateParsedTransaction(parsed)?.merchant).toBe('Starbucks');
    expect(validateParsedTransaction({ ...parsed, merchant: '  ' })?.merchant).toBeUndefined();
  });
});

describe('pickRecordingMimeType', () => {
  it('prefers webm/opus, falls back to mp4, and survives a throwing check', () => {
    expect(pickRecordingMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickRecordingMimeType(type => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecordingMimeType(() => { throw new Error('x'); })).toBeNull();
  });
});

describe('withMerchantInNote', async () => {
  const { withMerchantInNote } = await import('../services/smartEntry');
  const base = { amount: 1, currency: 'RSD' as const, categoryName: 'Food', type: 'expense' as const, date: '2026-11-13' };

  it('adds the shop to the note so the habit can be learned', () => {
    expect(withMerchantInNote({ ...base, note: 'Ručak', merchant: 'Maxi' }).note).toBe('Ručak · Maxi');
    expect(withMerchantInNote({ ...base, note: '', merchant: 'Maxi' }).note).toBe('Maxi');
  });

  it('leaves notes that already name it, or results without a merchant', () => {
    expect(withMerchantInNote({ ...base, note: 'Kupovina u Maksiju', merchant: 'Maxi' }).note).toBe('Kupovina u Maksiju');
    expect(withMerchantInNote({ ...base, note: 'Lunch at Maxi', merchant: 'MAXI' }).note).toBe('Lunch at Maxi');
    expect(withMerchantInNote({ ...base, note: 'Coffee' }).note).toBe('Coffee');
  });
});
