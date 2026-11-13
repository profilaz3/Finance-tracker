import type { AppState } from '../types';
import { applyUsualChoice, containsWords, merchantHints, merchantMemoryFor, merchantTokens } from '../domain/merchantMemory';
import { blobToBase64 } from '../utils/blobBase64';
import { parseTransaction, transcribeTransaction, type ParsedTransaction, type VoiceEntryResult } from './aiService';

type EntryState = Pick<AppState, 'transactions' | 'categories' | 'accounts' | 'people' | 'language'>;

/**
 * Habits are learned from notes, so the shop name has to end up in the note:
 * "Ručak" with merchant "Maxi" becomes "Ručak · Maxi".
 */
export const withMerchantInNote = (parsed: ParsedTransaction): ParsedTransaction => {
  const merchant = parsed.merchant?.trim();
  if (!merchant) return parsed;
  const merchantWords = merchantTokens(merchant);
  if (merchantWords.length === 0 || containsWords(merchantTokens(parsed.note), merchantWords)) return parsed;
  const note = parsed.note.trim();
  return { ...parsed, note: note ? `${note} · ${merchant}`.slice(0, 200) : merchant };
};

/**
 * Typed entry with the user's habits: merchants mentioned in the text travel as hints to the AI,
 * and a clear habit ("Maxi is always Groceries") overrides the AI's category locally.
 */
export const parseWithHabits = async (text: string, state: EntryState): Promise<ParsedTransaction | null> => {
  const memory = merchantMemoryFor(state.transactions);
  const hints = merchantHints(memory, state.categories, { text, limit: 15 });
  const parsed = await parseTransaction(text, state.categories, state.accounts, state.people, hints);
  return parsed ? applyUsualChoice(withMerchantInNote(parsed), memory, state.categories, state.accounts) : null;
};

/** Voice entry: the transcript is unknown up front, so the strongest habits go along as hints. */
export const transcribeWithHabits = async (recording: { blob: Blob; mimeType: string }, state: EntryState): Promise<VoiceEntryResult | null> => {
  const memory = merchantMemoryFor(state.transactions);
  const hints = merchantHints(memory, state.categories, { limit: 40 });
  const audio = await blobToBase64(recording.blob);
  const result = await transcribeTransaction(
    audio,
    recording.mimeType,
    state.language === 'sr' ? 'sr' : 'en',
    state.categories,
    state.accounts,
    state.people,
    hints,
  );
  if (!result?.parsed) return result;
  return { ...result, parsed: applyUsualChoice(withMerchantInNote(result.parsed), memory, state.categories, state.accounts) };
};
