import type { Category, Transaction } from '../types';
import { cyrillicToLatin } from '../utils/aiShared';

/**
 * Learns which category (and account) the user picks for each shop, from transaction history.
 * Derived on the fly, so it syncs across devices with the transactions themselves.
 */

const HALF_LIFE_DAYS = 90;
const DAY_MS = 86_400_000;
const MAX_KEY_LENGTH = 48;
const MAX_KEY_TOKENS = 4;
/** A merchant counts as "usual" after this many visits with a clear favourite category. */
export const USUAL_MIN_COUNT = 2;
export const USUAL_MIN_SHARE = 0.6;

// Legal-form and filler words that vary between receipts of the same shop.
const STOP_WORDS = new Set([
  'doo', 'd o o', 'ad', 'pr', 'szr', 'str', 'stur', 'sur', 'tr', 'ltd', 'llc', 'inc', 'gmbh', 'co',
  'radnja', 'prodavnica', 'objekat', 'filijala', 'store', 'shop', 'branch',
  'the', 'at', 'in', 'u', 'na', 'kod', 'sa', 'with', 'and', 'i', 'za', 'for',
]);

const DIACRITICS: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' };

/** All meaningful words of a text, normalized: Latin, no diacritics, digits, punctuation or legal suffixes. */
export const merchantTokens = (value: string | null | undefined): string[] => {
  if (!value) return [];
  return cyrillicToLatin(value)
    .toLowerCase()
    .replace(/[čćšžđ]/g, ch => DIACRITICS[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "d.o.o." and "d o o" collapse to "doo" before punctuation is stripped.
    .replace(/\bd\s*\.?\s*o\s*\.?\s*o\b\.?/g, ' doo ')
    // Web addresses on card statements: "NETFLIX.COM", "www.wolt.com" -> the brand.
    .replace(/\bwww\./g, ' ')
    .replace(/\.(com|net|org|rs|io|co|eu|de|uk|me|app)\b/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    // Spelling folds so "Maxi" (receipt) and "Maksi" (speech transcript) meet.
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(/q/g, 'k')
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
};

/** Merchant key: the first few normalized words (branch numbers and legal suffixes dropped). */
export const normalizeMerchant = (value: string | null | undefined): string =>
  merchantTokens(value).slice(0, MAX_KEY_TOKENS).join(' ').slice(0, MAX_KEY_LENGTH).trim();

export interface MerchantEntry {
  key: string;
  /** Display label: the most recent original spelling. */
  label: string;
  count: number;
  score: number;
  lastTime: number;
  categories: Map<string, { score: number; lastTime: number }>;
  accounts: Map<string, { score: number; lastTime: number }>;
}

export interface MerchantMemory {
  entries: Map<string, MerchantEntry>;
}

const merchantSource = (transaction: Transaction): string =>
  transaction.receiptData?.merchant?.trim() || transaction.note?.trim() || '';

const bump = (map: Map<string, { score: number; lastTime: number }>, id: string, weight: number, time: number) => {
  const current = map.get(id);
  if (current) {
    current.score += weight;
    current.lastTime = Math.max(current.lastTime, time);
  } else {
    map.set(id, { score: weight, lastTime: time });
  }
};

/** Builds the memory from history. Recent choices weigh more (90 day half-life). */
export const buildMerchantMemory = (transactions: readonly Transaction[], now = Date.now()): MerchantMemory => {
  const entries = new Map<string, MerchantEntry>();
  for (const transaction of transactions) {
    if (transaction.transferId || transaction.categoryId === 'internal-transfer' || !transaction.categoryId) continue;
    const source = merchantSource(transaction);
    const key = normalizeMerchant(source);
    if (key.length < 3) continue;
    const time = Date.parse(transaction.date);
    if (!Number.isFinite(time)) continue;
    const ageDays = Math.max(0, (now - time) / DAY_MS);
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    let entry = entries.get(key);
    if (!entry) {
      entry = { key, label: source, count: 0, score: 0, lastTime: time, categories: new Map(), accounts: new Map() };
      entries.set(key, entry);
    }
    entry.count += 1;
    entry.score += weight;
    if (time >= entry.lastTime) {
      entry.lastTime = time;
      entry.label = source;
    }
    bump(entry.categories, transaction.categoryId, weight, time);
    if (transaction.accountId) bump(entry.accounts, transaction.accountId, weight, time);
  }
  return { entries };
};

const memoCache = new WeakMap<readonly Transaction[], MerchantMemory>();

/** Memoized by array identity: state updates produce a new array, so the cache stays correct. */
export const merchantMemoryFor = (transactions: readonly Transaction[]): MerchantMemory => {
  let memory = memoCache.get(transactions);
  if (!memory) {
    memory = buildMerchantMemory(transactions);
    memoCache.set(transactions, memory);
  }
  return memory;
};

/** Highest score wins; a tie goes to the most recently used. */
const best = (map: Map<string, { score: number; lastTime: number }>) => {
  let winner: { id: string; score: number; lastTime: number } | null = null;
  let total = 0;
  for (const [id, value] of map) {
    total += value.score;
    if (
      !winner ||
      value.score > winner.score + 1e-9 ||
      (Math.abs(value.score - winner.score) <= 1e-9 && value.lastTime > winner.lastTime)
    ) {
      winner = { id, ...value };
    }
  }
  return winner ? { id: winner.id, share: total > 0 ? winner.score / total : 0 } : null;
};

/** Finds the entry for a shop name or a free-text note. */
/** "maksiju" counts as "maksi": Serbian case endings add up to three letters to a name. */
export const wordMatches = (word: string, known: string): boolean =>
  word === known || (known.length >= 4 && word.startsWith(known) && word.length - known.length <= 3);

/** Whether `known` appears as consecutive words of `words` (allowing case endings). */
export const containsWords = (words: readonly string[], known: readonly string[]): boolean => {
  if (known.length === 0 || known.length > words.length) return false;
  for (let start = 0; start + known.length <= words.length; start += 1) {
    if (known.every((part, offset) => wordMatches(words[start + offset], part))) return true;
  }
  return false;
};

export const findMerchant = (memory: MerchantMemory, text: string | null | undefined): MerchantEntry | null => {
  const words = merchantTokens(text);
  const key = words.slice(0, MAX_KEY_TOKENS).join(' ');
  if (key.length < 3) return null;
  const exact = memory.entries.get(key);
  if (exact) return exact;
  // A known merchant whose words appear in the text ("lunch at mama mia" contains "mama mia",
  // "u maksiju" contains "maksi"), or a text that is the start of a known merchant.
  // Longest, then strongest, match wins.
  let match: MerchantEntry | null = null;
  for (const entry of memory.entries.values()) {
    if (entry.key.length < 4) continue;
    const entryWords = entry.key.split(' ');
    const contained = containsWords(words, entryWords);
    const prefix = key.length >= 4 && ` ${entry.key} `.startsWith(` ${key} `);
    if (!contained && !prefix) continue;
    if (
      !match ||
      entry.key.length > match.key.length ||
      (entry.key.length === match.key.length && entry.score > match.score)
    ) {
      match = entry;
    }
  }
  return match;
};

export interface UsualChoice {
  merchant: string;
  categoryId: string;
  accountId?: string;
  count: number;
  share: number;
}

/** The user's usual category for this shop, only when the habit is clear. */
export const usualChoice = (memory: MerchantMemory, text: string | null | undefined): UsualChoice | null => {
  const entry = findMerchant(memory, text);
  if (!entry || entry.count < USUAL_MIN_COUNT) return null;
  const category = best(entry.categories);
  if (!category || category.share < USUAL_MIN_SHARE) return null;
  const account = best(entry.accounts);
  return {
    merchant: entry.label,
    categoryId: category.id,
    accountId: account && account.share >= USUAL_MIN_SHARE ? account.id : undefined,
    count: entry.count,
    share: category.share,
  };
};

export interface MerchantHint {
  merchant: string;
  category: string;
}

/**
 * Compact merchant -> category hints for the AI parser. With `text`, only merchants that share
 * a word with it are sent (less data leaves the device); without it, the strongest habits.
 */
export const merchantHints = (
  memory: MerchantMemory,
  categories: readonly Category[],
  options: { text?: string; limit?: number } = {},
): MerchantHint[] => {
  const limit = options.limit ?? 40;
  const names = new Map(categories.map(category => [category.id, category.name]));
  const words = options.text ? new Set(merchantTokens(options.text).filter(word => word.length >= 3)) : null;
  const candidates: { entry: MerchantEntry; categoryId: string }[] = [];
  for (const entry of memory.entries.values()) {
    if (words && !entry.key.split(' ').some(part => [...words].some(word => wordMatches(word, part)))) continue;
    const category = best(entry.categories);
    if (!category || category.share < 0.5 || !names.has(category.id)) continue;
    candidates.push({ entry, categoryId: category.id });
  }
  candidates.sort((a, b) => b.entry.score - a.entry.score || b.entry.lastTime - a.entry.lastTime);
  return candidates.slice(0, limit).map(({ entry, categoryId }) => ({
    merchant: entry.label.slice(0, 60),
    category: names.get(categoryId) ?? '',
  }));
};

/** Applies the usual category (and account) to an AI result when the shop is a clear habit. */
export const applyUsualChoice = <T extends { categoryName: string; type: 'income' | 'expense'; accountName?: string; note: string; merchant?: string }>(
  parsed: T,
  memory: MerchantMemory,
  categories: readonly Category[],
  accounts: readonly { id: string; name: string }[],
): T => {
  const usual = usualChoice(memory, parsed.merchant) ?? usualChoice(memory, parsed.note);
  if (!usual) return parsed;
  const category = categories.find(c => c.id === usual.categoryId);
  if (!category || category.type !== parsed.type) return parsed;
  const account = !parsed.accountName && usual.accountId ? accounts.find(a => a.id === usual.accountId) : undefined;
  return {
    ...parsed,
    categoryName: category.name,
    ...(account ? { accountName: account.name } : {}),
  };
};
