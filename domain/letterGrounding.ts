/**
 * Grounding and clean-up for AI-written text about the user's money (the monthly letter and
 * the anomaly explanations).
 *
 * The model only ever sees aggregates computed on the device, already formatted as text.
 * Everything it writes back is checked here: every number in the output must appear in those
 * facts, or the sentence carrying it is dropped. Dashes are normalized too.
 *
 * Pure and import free: shared by the app and the `monthly-letter` edge function (Deno).
 */

export interface LetterSection {
  heading: string;
  body: string;
}

export interface LetterText {
  title: string;
  sections: LetterSection[];
}

export const LETTER_MIN_SECTIONS = 3;
export const LETTER_MAX_SECTIONS = 6;
const MAX_TITLE = 120;
const MAX_HEADING = 80;
const MAX_BODY = 900;

/**
 * Numbers as people write them: "1,234.56", "1.234,56", "12,5", "1 234" with a no-break space,
 * "2026". A plain space never groups digits, so "2026 120" stays two numbers.
 */
const NUMBER_TOKEN = /\d+(?:[.,  ]\d{3})*(?:[.,]\d+)?/g;

const canonical = (value: number): string => (Math.round(value * 100) / 100).toFixed(2);

/**
 * The value of a written number. The last separator is the decimal point unless exactly three
 * digits follow it (then it groups thousands, as in "1,730" or "1.730"); any other separator
 * groups. Works for English and Serbian spellings alike, since money never has three decimals.
 */
export const readNumber = (token: string): number => {
  const compact = token.replace(/[\u00a0\u202f]/g, '');
  const last = Math.max(compact.lastIndexOf('.'), compact.lastIndexOf(','));
  if (last === -1) return Number(compact);
  const decimals = compact.length - last - 1;
  if (decimals === 3) return Number(compact.replace(/[.,]/g, ''));
  return Number(`${compact.slice(0, last).replace(/[.,]/g, '')}.${compact.slice(last + 1)}`);
};

/** Kept for callers that want every plausible reading; currently there is exactly one. */
export const numberReadings = (token: string): number[] => {
  const value = readNumber(token);
  return Number.isFinite(value) ? [value] : [];
};

export const extractNumberTokens = (text: string): string[] => text.match(NUMBER_TOKEN) ?? [];

const addValue = (allowed: Set<string>, value: number) => {
  if (!Number.isFinite(value)) return;
  const abs = Math.abs(value);
  allowed.add(canonical(abs));
  // Whole-number rounding of a given figure is a restatement, not a new number.
  allowed.add(canonical(Math.round(abs)));
};

/** All numbers present anywhere in the facts (numbers, and digits inside strings). */
export const collectAllowedNumbers = (facts: unknown, allowed: Set<string> = new Set()): Set<string> => {
  if (typeof facts === 'number') {
    addValue(allowed, facts);
  } else if (typeof facts === 'string') {
    for (const token of extractNumberTokens(facts)) {
      for (const reading of numberReadings(token)) addValue(allowed, reading);
    }
  } else if (Array.isArray(facts)) {
    for (const item of facts) collectAllowedNumbers(item, allowed);
  } else if (facts && typeof facts === 'object') {
    for (const [key, value] of Object.entries(facts as Record<string, unknown>)) {
      collectAllowedNumbers(key, allowed);
      collectAllowedNumbers(value, allowed);
    }
  }
  return allowed;
};

/** Numbers in `text` that do not appear in the allowed set. */
export const ungroundedNumbers = (text: string, allowed: Set<string>): string[] =>
  extractNumberTokens(text).filter(token => !numberReadings(token).some(reading => allowed.has(canonical(Math.abs(reading)))));

/** Splits prose into sentences at end punctuation followed by a space, so "1.234,50" stays whole. */
export const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

/** Keeps only the sentences whose numbers all appear in the facts. */
export const stripUngroundedSentences = (text: string, allowed: Set<string>): { text: string; removed: string[] } => {
  const removed: string[] = [];
  const kept = splitSentences(text).filter(sentence => {
    const bad = ungroundedNumbers(sentence, allowed);
    if (bad.length > 0) removed.push(...bad);
    return bad.length === 0;
  });
  return { text: kept.join(' '), removed };
};

/**
 * Removes em and en dashes (and their look-alikes). A dash between numbers becomes a hyphen,
 * anywhere else a comma, so the prose keeps reading naturally.
 */
export const sanitizeDashes = (text: string): string =>
  text
    .replace(/(\d)\s*[\u2012\u2013\u2014\u2015\u2212]\s*(?=\d)/g, '$1-')
    .replace(/\s*[\u2012\u2013\u2014\u2015]\s*/g, ', ')
    .replace(/\s+-{2,}\s+/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?:;])/g, '$1')
    .replace(/^\s*,\s*/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string'
    ? sanitizeDashes(value.replace(/[\r\n\t]+/g, ' ').replace(/[*_#`>]/g, '')).slice(0, max).trim()
    : '';

/** Reads the model's JSON into a letter, or null when the shape is unusable. */
export const normalizeLetterText = (value: unknown): LetterText | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = cleanText(raw.title, MAX_TITLE);
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map(section => {
      const entry = (section && typeof section === 'object' ? section : {}) as Record<string, unknown>;
      return { heading: cleanText(entry.heading, MAX_HEADING), body: cleanText(entry.body, MAX_BODY) };
    })
    .filter(section => section.heading && section.body)
    .slice(0, LETTER_MAX_SECTIONS);
  if (!title || sections.length === 0) return null;
  return { title, sections };
};

export interface GroundingReport {
  /** Numbers found in the text that the facts do not contain. */
  ungrounded: string[];
}

export const checkLetterGrounding = (letter: LetterText, allowed: Set<string>): GroundingReport => ({
  ungrounded: [
    ...ungroundedNumbers(letter.title, allowed),
    ...letter.sections.flatMap(section => [...ungroundedNumbers(section.heading, allowed), ...ungroundedNumbers(section.body, allowed)]),
  ],
});

/**
 * Drops every sentence with an ungrounded number, then sections left empty. A title with an
 * ungrounded number falls back to `fallbackTitle`.
 */
export const groundLetter = (letter: LetterText, allowed: Set<string>, fallbackTitle: string): LetterText & { removed: string[] } => {
  const removed: string[] = [];
  const titleBad = ungroundedNumbers(letter.title, allowed);
  removed.push(...titleBad);
  const sections = letter.sections
    .map(section => {
      const headingBad = ungroundedNumbers(section.heading, allowed);
      removed.push(...headingBad);
      const body = stripUngroundedSentences(section.body, allowed);
      removed.push(...body.removed);
      return { heading: headingBad.length > 0 ? '' : section.heading, body: body.text };
    })
    .filter(section => section.heading && section.body);
  return { title: titleBad.length > 0 ? fallbackTitle : letter.title, sections, removed };
};

/** One grounded, dash-free sentence, or null when it cannot be kept. */
export const groundSentence = (value: unknown, allowed: Set<string>, max = 260): string | null => {
  const text = cleanText(value, max);
  if (!text) return null;
  const { text: kept } = stripUngroundedSentences(text, allowed);
  return kept.length >= 12 ? kept : null;
};

const MAX_FACT_DEPTH = 5;
const MAX_FACT_STRING = 140;
const MAX_FACT_ARRAY = 12;
const MAX_FACT_KEYS = 40;

/**
 * Bounds untrusted facts before they reach a prompt: limited depth, keys, list sizes and string
 * lengths; control characters and backticks removed. Anything else (functions, nulls) is dropped.
 */
export const boundFacts = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.replace(/[\u0000-\u001f`]/g, ' ').slice(0, MAX_FACT_STRING).trim();
  if (depth >= MAX_FACT_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_FACT_ARRAY).map(item => boundFacts(item, depth + 1)).filter(item => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_FACT_KEYS)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
      const bounded = boundFacts(item, depth + 1);
      if (bounded !== undefined && bounded !== '') out[key] = bounded;
    }
    return out;
  }
  return undefined;
};
