import { CONFIG } from '../config';
import {
  letterArchiveKey,
  letterAttemptKey,
  letterMonthFor,
  monthId,
  parseLetterArchive,
  type LetterArchive,
  type LetterAttempt,
} from '../domain/letterArchive';

/**
 * The light half of the monthly letter: the per-device archive for the signed-in user and
 * active workspace, as an external store. Writing letters and explaining anomalies lives in
 * `letterService.ts`, which is loaded on demand so it stays out of the entry chunk.
 */

export const LETTER_PREFIX = CONFIG.STORAGE_KEY;

export const readLetterJson = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeLetterJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the letter stays in memory for this session.
  }
};

export interface LetterSnapshot {
  userId: string | null;
  scope: string | null;
  archive: LetterArchive;
  /** Months being written right now. */
  writing: string[];
  /** A month the app was asked to open (a notification tap), until the letter view takes it. */
  openRequest: string | null;
}

let snapshot: LetterSnapshot = { userId: null, scope: null, archive: {}, writing: [], openRequest: null };
const listeners = new Set<() => void>();

/** Replaces part of the snapshot and notifies subscribers. */
export const updateLetters = (next: Partial<LetterSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach(listener => listener());
};

export const subscribeLetters = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getLetterSnapshot = (): LetterSnapshot => snapshot;

/** Points the store at a user and workspace; loads that archive from this device. */
export const setLetterContext = (userId: string | null, scope: string | null) => {
  if (snapshot.userId === userId && snapshot.scope === scope) return;
  const archive = userId ? parseLetterArchive(readLetterJson(letterArchiveKey(LETTER_PREFIX, userId, scope))) : {};
  updateLetters({ userId, scope, archive, writing: [] });
};

export const requestOpenLetter = (month: string | null) =>
  updateLetters({ openRequest: month ?? monthId(letterMonthFor(new Date())) });

export const clearOpenLetterRequest = () => {
  if (snapshot.openRequest !== null) updateLetters({ openRequest: null });
};

export const readLetterAttempt = (): LetterAttempt | null => {
  if (!snapshot.userId) return null;
  const raw = readLetterJson(letterAttemptKey(LETTER_PREFIX, snapshot.userId, snapshot.scope)) as LetterAttempt | null;
  return raw && typeof raw.month === 'string' && typeof raw.count === 'number' && typeof raw.lastAt === 'number' ? raw : null;
};

export const saveLetterAttempt = (attempt: LetterAttempt) => {
  if (snapshot.userId) writeLetterJson(letterAttemptKey(LETTER_PREFIX, snapshot.userId, snapshot.scope), attempt);
};
