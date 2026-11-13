/**
 * National Bank of Serbia official middle exchange rates (srednji kurs), RSD per unit.
 *
 * Sources, both public and without registration:
 * - Primary for history: kurs.resenje.org, a JSON mirror that reads the NBS web services and
 *   returns their unmodified values, up to 1000 calendar days per request. Weekends and
 *   holidays carry the last published list (`date_from` is that list's date).
 * - Primary for today, fallback for short history gaps: the NBS exchange rate web app
 *   (webappcenter.nbs.rs), one HTML list per requested day ("formirana na dan" = list date).
 *
 * Pure and runtime agnostic: imported by the `nbs-rates` edge function (Deno) and the app.
 */

export const NBS_CURRENCIES = ['EUR', 'USD'] as const;
export type NbsCurrency = (typeof NBS_CURRENCIES)[number];

export const KURS_HOST = 'kurs.resenje.org';
export const NBS_HOST = 'webappcenter.nbs.rs';
/** kurs.resenje.org returns at most this many days per request. */
export const KURS_MAX_DAYS = 1000;
/** NBS lists start on this day; nothing earlier exists. */
export const NBS_FIRST_DATE = '2002-05-15';
/** Longest range the app asks for (5 years plus slack). */
export const MAX_HISTORY_DAYS = 1900;

export type RateSource = 'nbs' | 'kurs';

/** One calendar day's middle rate, and which published list it comes from. */
export interface DailyRate {
  /** Calendar day, YYYY-MM-DD (Belgrade). */
  date: string;
  /** Day the list was formed; earlier than `date` on weekends and holidays. */
  listDate: string;
  /** RSD per 1 unit (already divided by the list's parity). */
  middle: number;
  listNumber: number | null;
}

/** A published list: the rates of one business day. */
export interface NbsList {
  listDate: string;
  listNumber: number | null;
  rates: Partial<Record<NbsCurrency, number>>;
}

/** Business-day point sent to the app: [list date, middle]. */
export type RatePoint = [string, number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Today's date in Belgrade, where NBS lists are dated. */
export const belgradeToday = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const isUsableMiddle = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100_000;

const roundRate = (value: number): number => Math.round(value * 1e6) / 1e6;

const isCurrency = (value: unknown): value is NbsCurrency =>
  typeof value === 'string' && (NBS_CURRENCIES as readonly string[]).includes(value.toUpperCase());

// ---------------------------------------------------------------- kurs.resenje.org

/** One kurs.resenje.org rate object, or null when it is not a usable rate for `currency`. */
export const parseKursRate = (value: unknown, currency?: NbsCurrency): (DailyRate & { currency: NbsCurrency }) | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code.toUpperCase() : '';
  if (!isCurrency(code) || (currency && code !== currency)) return null;
  const date = record.date;
  const listDate = record.date_from ?? record.date;
  if (!isIsoDate(date) || !isIsoDate(listDate) || listDate > date) return null;
  const parity = typeof record.parity === 'number' && record.parity > 0 ? record.parity : 1;
  const middle = record.exchange_middle;
  if (!isUsableMiddle(middle)) return null;
  const number = record.number;
  return {
    currency: code,
    date,
    listDate,
    middle: roundRate(middle / parity),
    listNumber: typeof number === 'number' && Number.isInteger(number) && number > 0 && number <= 400 ? number : null,
  };
};

/** The `{ rates: [...] }` list from a `/rates/<date>/count/<n>` request. */
export const parseKursList = (value: unknown, currency: NbsCurrency): DailyRate[] => {
  const rates = value && typeof value === 'object' ? (value as { rates?: unknown }).rates : null;
  if (!Array.isArray(rates)) return [];
  const out: DailyRate[] = [];
  for (const entry of rates) {
    const parsed = parseKursRate(entry, currency);
    if (parsed) out.push({ date: parsed.date, listDate: parsed.listDate, middle: parsed.middle, listNumber: parsed.listNumber });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

export const kursRangeUrl = (currency: NbsCurrency, from: string, days: number): string =>
  `https://${KURS_HOST}/api/v1/currencies/${currency.toLowerCase()}/rates/${from}/count/${Math.max(1, Math.min(KURS_MAX_DAYS, days))}`;

export const kursTodayUrl = (currency: NbsCurrency): string =>
  `https://${KURS_HOST}/api/v1/currencies/${currency.toLowerCase()}/rates/today`;

// ---------------------------------------------------------------- NBS web app (HTML)

/** dd.mm.yyyy as the NBS form expects. */
export const nbsListUrl = (date: string): string => {
  const [year, month, day] = date.split('-');
  return `https://${NBS_HOST}/ExchangeRateWebApp/ExchangeRate/IndexByDate?isSearchExecuted=true&Date=${day}.${month}.${year}&ExchangeRateListTypeID=3`;
};

const decodeEntities = (html: string): string =>
  html
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/** "117,6089" or "1.234,5678" (Serbian format) to a number. */
const parseSerbianNumber = (value: string): number => Number(value.replace(/\./g, '').replace(',', '.'));

/**
 * The middle rate list page. The header says which list it is ("KURSNA LISTA BR. 213" /
 * "КУРСНА ЛИСТА БР. 213") and the day it was formed ("FORMIRANA NA DAN 6.11.2026."), which
 * is the last business day on or before the requested date.
 */
export const parseNbsListHtml = (html: string): NbsList | null => {
  if (typeof html !== 'string' || html.length === 0) return null;
  const text = decodeEntities(html);
  const dateMatch = text.match(/(?:ФОРМИРАНА НА ДАН|FORMIRANA NA DAN)\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
  if (!dateMatch) return null;
  const listDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
  if (!isIsoDate(listDate)) return null;
  const numberMatch = text.match(/(?:КУРСНА ЛИСТА БР|KURSNA LISTA BR)\.\s*(\d{1,3})/i);
  const listNumber = numberMatch ? Number(numberMatch[1]) : null;

  const rates: Partial<Record<NbsCurrency, number>> = {};
  const row = /<tr>\s*<td>\s*([A-Z]{3})\s*<\/td>\s*<td>\s*\d+\s*<\/td>\s*<td>[^<]*<\/td>\s*<td>\s*(\d+)\s*<\/td>\s*<td>\s*([\d.,]+)\s*<\/td>/g;
  for (const match of text.matchAll(row)) {
    const code = match[1];
    if (!isCurrency(code)) continue;
    const parity = Number(match[2]);
    const value = parseSerbianNumber(match[3]);
    if (!(parity > 0) || !isUsableMiddle(value)) continue;
    rates[code] = roundRate(value / parity);
  }
  if (Object.keys(rates).length === 0) return null;
  return { listDate, listNumber: listNumber && listNumber > 0 && listNumber <= 400 ? listNumber : null, rates };
};

// ---------------------------------------------------------------- series helpers

/**
 * One entry per calendar day in [from, to]: each day carries the last rate known on or before it
 * (weekends and holidays repeat the previous list). Days before the first known rate are skipped.
 */
export const fillCalendarDays = (rates: readonly DailyRate[], from: string, to: string): DailyRate[] => {
  const sorted = [...rates].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: DailyRate[] = [];
  let index = 0;
  let current: DailyRate | null = null;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    while (index < sorted.length && sorted[index].date <= day) {
      current = sorted[index];
      index += 1;
    }
    if (current) out.push({ date: day, listDate: current.listDate, middle: current.middle, listNumber: current.listNumber });
  }
  return out;
};

/** Business days only: one point per published list, in date order. */
export const toBusinessPoints = (rates: readonly DailyRate[]): RatePoint[] => {
  const byList = new Map<string, number>();
  for (const rate of rates) {
    if (!byList.has(rate.listDate)) byList.set(rate.listDate, rate.middle);
  }
  return [...byList.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
};

/** Calendar days in [from, to] that `have` does not cover, as contiguous [start, end] spans. */
export const missingSpans = (have: ReadonlySet<string>, from: string, to: string): Array<[string, string]> => {
  const spans: Array<[string, string]> = [];
  let start: string | null = null;
  let previous: string | null = null;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!have.has(day)) {
      if (start === null) start = day;
      previous = day;
    } else if (start !== null && previous !== null) {
      spans.push([start, previous]);
      start = null;
    }
  }
  if (start !== null && previous !== null) spans.push([start, previous]);
  return spans;
};

/** Validates a `[date, middle][]` list from the edge function. */
export const validatePoints = (value: unknown): RatePoint[] => {
  if (!Array.isArray(value)) return [];
  const out: RatePoint[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [date, middle] = entry;
    if (isIsoDate(date) && isUsableMiddle(middle)) out.push([date, middle]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out.filter((point, index) => index === 0 || point[0] !== out[index - 1][0]);
};

export interface LatestRates {
  /** Day the list was formed (the last business day on or before today). */
  listDate: string;
  listNumber: number | null;
  source: RateSource;
  rates: Record<NbsCurrency, number>;
}

/** Validates the edge function's `latest` payload. */
export const validateLatest = (value: unknown): LatestRates | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const rates = record.rates as Record<string, unknown> | undefined;
  if (!isIsoDate(record.listDate) || !rates || typeof rates !== 'object') return null;
  if (!isUsableMiddle(rates.EUR) || !isUsableMiddle(rates.USD)) return null;
  const listNumber = typeof record.listNumber === 'number' && Number.isInteger(record.listNumber) ? record.listNumber : null;
  return {
    listDate: record.listDate,
    listNumber,
    source: record.source === 'kurs' ? 'kurs' : 'nbs',
    rates: { EUR: rates.EUR, USD: rates.USD },
  };
};
