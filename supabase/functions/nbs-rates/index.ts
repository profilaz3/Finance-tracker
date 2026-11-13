import {
  addDays,
  belgradeToday,
  type DailyRate,
  daysBetween,
  isIsoDate,
  KURS_HOST,
  KURS_MAX_DAYS,
  kursRangeUrl,
  kursTodayUrl,
  type LatestRates,
  MAX_HISTORY_DAYS,
  missingSpans,
  NBS_CURRENCIES,
  NBS_FIRST_DATE,
  NBS_HOST,
  nbsListUrl,
  type NbsCurrency,
  parseKursList,
  parseKursRate,
  parseNbsListHtml,
  type RateSource,
  toBusinessPoints,
} from '../../../utils/nbsRates.ts';
import { adminClient, requireUser } from '../_shared/auth.ts';
import { requireRecord } from '../_shared/input.ts';
import { HttpError, jsonResponse, readJsonBody, serveJson } from '../_shared/http.ts';

/**
 * Official NBS middle rates for EUR and USD (RSD per unit), today and history.
 *
 * - `latest`: today's list straight from NBS, falling back to kurs.resenje.org.
 * - `history`: business-day points for [from, to]. Past days come from the shared
 *   `exchange_rates` cache; missing days are fetched once from kurs.resenje.org (NBS for short
 *   gaps if that fails) and stored. Today is never cached because its list may not be out yet.
 *
 * Only the two allowlisted hosts are ever called: https, no redirects, timeouts, size caps.
 * No AI and no quota; signed-in users only.
 */

const MAX_BODY_BYTES = 2 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_HTML_BYTES = 256 * 1024;
const NBS_GAP_LIMIT = 31;
const DB_PAGE = 1000;
const USER_AGENT = 'FinanceTracker/1.0 (NBS exchange rates)';
const ALLOWED_HOSTS = new Set([KURS_HOST, NBS_HOST]);

const sourceFetch = async (url: string, accept: string, maxBytes: number): Promise<string | null> => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) throw new Error('refusing non-allowlisted host');
  let response: Response;
  try {
    response = await fetch(parsed, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
    });
  } catch (error) {
    console.error('[nbs-rates] fetch failed', parsed.hostname, error instanceof Error ? error.name : error);
    return null;
  }
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    console.error('[nbs-rates] status', parsed.hostname, response.status);
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      console.error('[nbs-rates] response too large', parsed.hostname);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

const parseJson = (text: string | null): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Today's list: NBS first (official), kurs.resenje.org if NBS is down or changed its page. */
const fetchLatest = async (today: string): Promise<LatestRates | null> => {
  const list = parseNbsListHtml((await sourceFetch(nbsListUrl(today), 'text/html', MAX_HTML_BYTES)) ?? '');
  if (list && list.rates.EUR && list.rates.USD && list.listDate <= today) {
    return { listDate: list.listDate, listNumber: list.listNumber, source: 'nbs', rates: { EUR: list.rates.EUR, USD: list.rates.USD } };
  }
  const [eur, usd] = await Promise.all(
    NBS_CURRENCIES.map(async (currency) => parseKursRate(parseJson(await sourceFetch(kursTodayUrl(currency), 'application/json', MAX_JSON_BYTES)), currency)),
  );
  if (!eur || !usd) return null;
  // Both lists must be the same day; otherwise report the older one (never mix days silently).
  return {
    listDate: eur.listDate < usd.listDate ? eur.listDate : usd.listDate,
    listNumber: eur.listDate === usd.listDate ? eur.listNumber : null,
    source: 'kurs',
    rates: { EUR: eur.middle, USD: usd.middle },
  };
};

type CacheRow = { rate_date: string; currency: NbsCurrency; middle: number | string; list_date: string; list_number: number | null };

const readCache = async (from: string, to: string): Promise<Record<NbsCurrency, DailyRate[]>> => {
  const out: Record<NbsCurrency, DailyRate[]> = { EUR: [], USD: [] };
  if (from > to) return out;
  const db = adminClient();
  for (let offset = 0; ; offset += DB_PAGE) {
    const { data, error } = await db
      .from('exchange_rates')
      .select('rate_date, currency, middle, list_date, list_number')
      .gte('rate_date', from)
      .lte('rate_date', to)
      .order('rate_date', { ascending: true })
      .order('currency', { ascending: true })
      .range(offset, offset + DB_PAGE - 1);
    if (error) {
      console.error('[nbs-rates] cache read failed', error.message);
      break;
    }
    for (const row of (data ?? []) as CacheRow[]) {
      if (row.currency !== 'EUR' && row.currency !== 'USD') continue;
      out[row.currency].push({ date: row.rate_date, listDate: row.list_date, middle: Number(row.middle), listNumber: row.list_number });
    }
    if (!data || data.length < DB_PAGE) break;
  }
  return out;
};

const writeCache = async (currency: NbsCurrency, rows: DailyRate[], source: RateSource, lastCacheable: string): Promise<void> => {
  const payload = rows
    .filter((row) => row.date <= lastCacheable && row.date >= NBS_FIRST_DATE)
    .map((row) => ({
      rate_date: row.date,
      currency,
      middle: row.middle,
      list_date: row.listDate,
      list_number: row.listNumber,
      source,
    }));
  if (payload.length === 0) return;
  const db = adminClient();
  for (let offset = 0; offset < payload.length; offset += DB_PAGE) {
    const { error } = await db.from('exchange_rates').upsert(payload.slice(offset, offset + DB_PAGE), { onConflict: 'rate_date,currency' });
    if (error) console.error('[nbs-rates] cache write failed', error.message);
  }
};

/** Fills one missing span from kurs.resenje.org in 1000-day chunks. */
const fetchKursSpan = async (currency: NbsCurrency, start: string, end: string): Promise<DailyRate[] | null> => {
  const out: DailyRate[] = [];
  for (let chunkStart = start; chunkStart <= end; chunkStart = addDays(chunkStart, KURS_MAX_DAYS)) {
    const days = Math.min(KURS_MAX_DAYS, daysBetween(chunkStart, end) + 1);
    const rows = parseKursList(parseJson(await sourceFetch(kursRangeUrl(currency, chunkStart, days), 'application/json', MAX_JSON_BYTES)), currency);
    if (rows.length === 0) return null;
    out.push(...rows.filter((row) => row.date >= chunkStart && row.date <= end));
  }
  return out;
};

/** Short gaps only: one NBS list per calendar day (each list has both currencies). */
const fetchNbsSpan = async (start: string, end: string): Promise<Record<NbsCurrency, DailyRate[]> | null> => {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  if (days.length > NBS_GAP_LIMIT) return null;
  const out: Record<NbsCurrency, DailyRate[]> = { EUR: [], USD: [] };
  for (let i = 0; i < days.length; i += 4) {
    const batch = days.slice(i, i + 4);
    const lists = await Promise.all(batch.map(async (day) => parseNbsListHtml((await sourceFetch(nbsListUrl(day), 'text/html', MAX_HTML_BYTES)) ?? '')));
    for (let j = 0; j < batch.length; j += 1) {
      const list = lists[j];
      if (!list || list.listDate > batch[j]) return null;
      for (const currency of NBS_CURRENCIES) {
        const middle = list.rates[currency];
        if (!middle) return null;
        out[currency].push({ date: batch[j], listDate: list.listDate, middle, listNumber: list.listNumber });
      }
    }
  }
  return out;
};

const parseRange = (body: Record<string, unknown>, today: string): { from: string; to: string } => {
  const to = isIsoDate(body.to) && body.to < today ? body.to : today;
  if (!isIsoDate(body.from)) throw new HttpError(400, 'Invalid from date');
  const from = body.from < NBS_FIRST_DATE ? NBS_FIRST_DATE : body.from;
  if (from > to) throw new HttpError(400, 'Invalid range');
  if (daysBetween(from, to) > MAX_HISTORY_DAYS) throw new HttpError(400, 'Range too long');
  return { from, to };
};

serveJson('nbs-rates', async (req) => {
  await requireUser(req);
  const body = requireRecord(await readJsonBody(req, MAX_BODY_BYTES));
  const today = belgradeToday();

  if (body.mode === 'latest') {
    const latest = await fetchLatest(today);
    if (!latest) throw new HttpError(502, 'unavailable');
    return jsonResponse(req, { data: { ...latest, today } });
  }

  if (body.mode !== 'history') throw new HttpError(400, 'Unknown mode');
  const { from, to } = parseRange(body, today);
  const yesterday = addDays(today, -1);
  const cacheTo = to < yesterday ? to : yesterday;

  // Start a few days early so a range that opens on a weekend still knows Friday's list.
  const lookbackFrom = addDays(from, -7) < NBS_FIRST_DATE ? NBS_FIRST_DATE : addDays(from, -7);
  const cached = await readCache(lookbackFrom, cacheTo);
  let source: RateSource | 'cache' = 'cache';

  for (const currency of NBS_CURRENCIES) {
    const have = new Set(cached[currency].map((row) => row.date));
    for (const [start, end] of missingSpans(have, lookbackFrom, cacheTo)) {
      let rows = await fetchKursSpan(currency, start, end);
      let rowSource: RateSource = 'kurs';
      if (!rows) {
        const nbs = await fetchNbsSpan(start, end);
        rows = nbs ? nbs[currency] : null;
        rowSource = 'nbs';
      }
      if (!rows) continue;
      source = rowSource;
      cached[currency].push(...rows);
      await writeCache(currency, rows, rowSource, yesterday);
    }
  }

  let latest: LatestRates | null = null;
  if (to >= today) latest = await fetchLatest(today);

  const series = {} as Record<NbsCurrency, ReturnType<typeof toBusinessPoints>>;
  for (const currency of NBS_CURRENCIES) {
    const rows = cached[currency].filter((row) => row.date <= to);
    if (latest) rows.push({ date: today, listDate: latest.listDate, middle: latest.rates[currency], listNumber: latest.listNumber });
    const points = toBusinessPoints(rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
    // Keep the list in force on `from` (it may predate it) and everything after.
    const firstInside = points.findIndex(([date]) => date >= from);
    const startIndex = firstInside === -1 ? Math.max(0, points.length - 1) : Math.max(0, firstInside - (points[firstInside][0] > from ? 1 : 0));
    series[currency] = points.slice(startIndex);
  }

  if (series.EUR.length === 0 && series.USD.length === 0) throw new HttpError(502, 'unavailable');
  return jsonResponse(req, { data: { from, to, today, source, latest, series } });
});
