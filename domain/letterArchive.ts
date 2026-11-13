import type { Currency } from '../types';
import type { AppLanguage } from '../utils/locale';
import { monthKeyOf, shiftMonth, type MonthKey } from './home';
import type { LetterSection } from './letterGrounding';

/**
 * Month ids and the per-device letter archive. Kept apart from the letter builders in
 * `monthlyLetter.ts` so the app shell can check for a due letter without loading them.
 */

// ---------------------------------------------------------------------------
// Months

const pad = (value: number) => String(value).padStart(2, '0');

/** "2026-10" for October 2026. */
export const monthId = (key: MonthKey): string => `${key.year}-${pad(key.month + 1)}`;

export const parseMonthId = (value: string): MonthKey | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  return month >= 0 && month <= 11 ? { year: Number(match[1]), month } : null;
};

/** The month a letter written today is about: always the previous calendar month. */
export const letterMonthFor = (now: Date): MonthKey => shiftMonth(monthKeyOf(now), -1);

/** Last moment of the month, so month maths treats it as fully elapsed. */
export const endOfMonth = (key: MonthKey): Date => new Date(key.year, key.month + 1, 0, 23, 59, 59, 999);

// ---------------------------------------------------------------------------
// Cache: per user and workspace, one entry per month

export interface StoredLetter {
  month: string;
  language: AppLanguage;
  title: string;
  sections: LetterSection[];
  generatedAt: number;
  /** Exact local figures shown above the prose. */
  stats: {
    currency: Currency;
    spent: number;
    previousSpent: number;
    spentChangePct: number | null;
    income: number;
    budgetLimit: number | null;
  };
}

export type LetterArchive = Record<string, StoredLetter>;

export const MAX_ARCHIVED_LETTERS = 24;

export const letterArchiveKey = (prefix: string, userId: string, scope: string | null): string =>
  `${prefix}:letters:${userId}:${scope ?? 'personal'}`;

export const letterAttemptKey = (prefix: string, userId: string, scope: string | null): string =>
  `${prefix}:letter-attempt:${userId}:${scope ?? 'personal'}`;

const isStoredLetter = (value: unknown): value is StoredLetter => {
  if (!value || typeof value !== 'object') return false;
  const letter = value as StoredLetter;
  return (
    typeof letter.month === 'string'
    && parseMonthId(letter.month) !== null
    && (letter.language === 'en' || letter.language === 'sr')
    && typeof letter.title === 'string'
    && Array.isArray(letter.sections)
    && letter.sections.every(section => section && typeof section.heading === 'string' && typeof section.body === 'string')
    && typeof letter.generatedAt === 'number'
    && Boolean(letter.stats) && typeof letter.stats.spent === 'number'
  );
};

/** Reads a stored archive, dropping anything malformed. */
export const parseLetterArchive = (raw: unknown): LetterArchive => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const archive: LetterArchive = {};
  for (const [month, letter] of Object.entries(raw as Record<string, unknown>)) {
    if (isStoredLetter(letter) && letter.month === month) archive[month] = letter;
  }
  return archive;
};

/** Adds or replaces a letter and keeps the newest MAX_ARCHIVED_LETTERS months. */
export const withLetter = (archive: LetterArchive, letter: StoredLetter): LetterArchive => {
  const next = { ...archive, [letter.month]: letter };
  const months = Object.keys(next).sort().reverse();
  return Object.fromEntries(months.slice(0, MAX_ARCHIVED_LETTERS).map(month => [month, next[month]]));
};

/** Newest first. */
export const archiveList = (archive: LetterArchive): StoredLetter[] =>
  Object.values(archive).sort((a, b) => b.month.localeCompare(a.month));

export interface LetterAttempt {
  month: string;
  count: number;
  lastAt: number;
}

export const MAX_AUTO_ATTEMPTS = 3;
export const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Whether to write last month's letter in the background now: on the 1st or the first open
 * after it, unless it exists, or recent attempts failed (three tries, six hours apart).
 */
export const shouldAutoGenerate = (now: Date, archive: LetterArchive, attempt: LetterAttempt | null): boolean => {
  const month = monthId(letterMonthFor(now));
  if (archive[month]) return false;
  if (!attempt || attempt.month !== month) return true;
  return attempt.count < MAX_AUTO_ATTEMPTS && now.getTime() - attempt.lastAt >= RETRY_AFTER_MS;
};

export const nextAttempt = (now: Date, attempt: LetterAttempt | null): LetterAttempt => {
  const month = monthId(letterMonthFor(now));
  return { month, count: attempt?.month === month ? attempt.count + 1 : 1, lastAt: now.getTime() };
};

/** When the reminder for the next letter fires: the 1st of next month at 9:00 local time. */
export const nextLetterReminderAt = (now: Date): Date => new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0);
