import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  belgradeToday,
  daysBetween,
  fillCalendarDays,
  isIsoDate,
  kursRangeUrl,
  missingSpans,
  nbsListUrl,
  parseKursList,
  parseKursRate,
  parseNbsListHtml,
  toBusinessPoints,
  validateLatest,
  validatePoints,
  type DailyRate,
} from '../utils/nbsRates';
import {
  convertWithRate,
  downsample,
  mergePoints,
  pointsSince,
  rangeStart,
  rangeStats,
  ratesFromNbs,
  rsdPer,
} from '../domain/exchangeRates';
import { convertAmount } from '../services/currencyService';

// Fixtures are real public responses (kurs.resenje.org JSON, NBS exchange rate web app HTML).
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', 'nbs', name), 'utf8');

describe('kurs.resenje.org parsing', () => {
  it('reads a calendar-day list where weekends carry the Friday list', () => {
    const eur = parseKursList(JSON.parse(fixture('kurs-eur-2026-10-30-12.json')), 'EUR');
    expect(eur).toHaveLength(12);
    expect(eur[0]).toEqual({ date: '2026-10-30', listDate: '2026-10-30', middle: 117.5367, listNumber: 208 });
    // Saturday and Sunday repeat Friday's list 208.
    expect(eur[1]).toMatchObject({ date: '2026-10-31', listDate: '2026-10-30', middle: 117.5367 });
    expect(eur[2]).toMatchObject({ date: '2026-11-01', listDate: '2026-10-30' });
    expect(eur[3]).toMatchObject({ date: '2026-11-02', listDate: '2026-11-02', listNumber: 209 });

    const usd = parseKursList(JSON.parse(fixture('kurs-usd-2026-10-30-12.json')), 'USD');
    expect(usd.find(rate => rate.date === '2026-11-06')?.middle).toBe(105.0079);
  });

  it('rejects the other currency, bad dates and unusable values', () => {
    expect(parseKursList(JSON.parse(fixture('kurs-eur-2026-10-30-12.json')), 'USD')).toEqual([]);
    expect(parseKursRate({ code: 'EUR', date: '2026-02-30', exchange_middle: 117 })).toBeNull();
    expect(parseKursRate({ code: 'EUR', date: '2026-11-02', date_from: '2026-11-03', exchange_middle: 117 })).toBeNull();
    expect(parseKursRate({ code: 'EUR', date: '2026-11-02', exchange_middle: -1 })).toBeNull();
    expect(parseKursRate({ code: 'GBP', date: '2026-11-02', exchange_middle: 150 })).toBeNull();
    expect(parseKursList({ nope: true }, 'EUR')).toEqual([]);
  });

  it('reads today and divides by parity', () => {
    expect(parseKursRate(JSON.parse(fixture('kurs-eur-today.json')))).toMatchObject({ currency: 'EUR', date: '2026-11-13', middle: 117.6203, listNumber: 217 });
    expect(parseKursRate({ code: 'USD', date: '2026-11-02', parity: 100, exchange_middle: 10500 })?.middle).toBe(105);
  });

  it('builds capped range URLs on the allowlisted host', () => {
    expect(kursRangeUrl('EUR', '2026-01-01', 5000)).toBe('https://kurs.resenje.org/api/v1/currencies/eur/rates/2026-01-01/count/1000');
    expect(nbsListUrl('2026-11-08')).toContain('https://webappcenter.nbs.rs/');
    expect(nbsListUrl('2026-11-08')).toContain('Date=08.11.2026&ExchangeRateListTypeID=3');
  });
});

describe('NBS list page parsing', () => {
  it('reads a business-day list', () => {
    expect(parseNbsListHtml(fixture('nbs-list-2026-11-12.html'))).toEqual({
      listDate: '2026-11-12',
      listNumber: 216,
      rates: { EUR: 117.6322, USD: 106.1567 },
    });
  });

  it('returns the last published list for a Sunday, with that list date', () => {
    expect(parseNbsListHtml(fixture('nbs-list-2026-11-08.html'))).toEqual({
      listDate: '2026-11-06',
      listNumber: 213,
      rates: { EUR: 117.6089, USD: 105.0079 },
    });
  });

  it('matches the mirror for the same day', () => {
    const nbs = parseNbsListHtml(fixture('nbs-list-2026-11-08.html'))!;
    const mirror = parseKursList(JSON.parse(fixture('kurs-usd-2026-10-30-12.json')), 'USD').find(rate => rate.date === '2026-11-08')!;
    expect(mirror.listDate).toBe(nbs.listDate);
    expect(mirror.middle).toBe(nbs.rates.USD);
  });

  it('gives up on pages without a list', () => {
    expect(parseNbsListHtml('<html><body>Kursna lista nije formirana</body></html>')).toBeNull();
    expect(parseNbsListHtml('')).toBeNull();
  });

  it('handles Latin headers, thousands separators and parity', () => {
    const html = `<h6>KURSNA LISTA BR. 5</h6><h6>FORMIRANA NA DAN 9.1.2026. GODINE</h6>
      <tr><td>EUR</td><td>978</td><td>EMU</td><td>1</td><td>1.117,1234</td></tr>
      <tr><td>USD</td><td>840</td><td>SAD</td><td>100</td><td>10.500,00</td></tr>`;
    expect(parseNbsListHtml(html)).toEqual({ listDate: '2026-01-09', listNumber: 5, rates: { EUR: 1117.1234, USD: 105 } });
  });
});

describe('series helpers', () => {
  const friday: DailyRate = { date: '2026-11-06', listDate: '2026-11-06', middle: 117.6089, listNumber: 213 };
  const monday: DailyRate = { date: '2026-11-09', listDate: '2026-11-09', middle: 117.6, listNumber: 214 };

  it('fills weekends with the last published list', () => {
    const days = fillCalendarDays([monday, friday], '2026-11-05', '2026-11-09');
    expect(days.map(day => day.date)).toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
    expect(days[1]).toEqual({ date: '2026-11-07', listDate: '2026-11-06', middle: 117.6089, listNumber: 213 });
    expect(days[3].listDate).toBe('2026-11-09');
  });

  it('keeps one point per published list', () => {
    const days = fillCalendarDays([friday, monday], '2026-11-06', '2026-11-09');
    expect(toBusinessPoints(days)).toEqual([['2026-11-06', 117.6089], ['2026-11-09', 117.6]]);
  });

  it('finds the missing calendar spans', () => {
    const have = new Set(['2026-11-02', '2026-11-03', '2026-11-06']);
    expect(missingSpans(have, '2026-11-01', '2026-11-08')).toEqual([
      ['2026-11-01', '2026-11-01'],
      ['2026-11-04', '2026-11-05'],
      ['2026-11-07', '2026-11-08'],
    ]);
    expect(missingSpans(new Set(['2026-11-01']), '2026-11-01', '2026-11-01')).toEqual([]);
  });

  it('does date maths in whole days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(isIsoDate('2026-02-29')).toBe(false);
    // 23:30 UTC on 13 Nov is already 14 Nov in Belgrade.
    expect(belgradeToday(new Date('2026-11-13T23:30:00Z'))).toBe('2026-11-14');
  });

  it('validates the function payloads', () => {
    expect(validatePoints([['2026-11-09', 117.6], ['2026-11-06', 117.6089], ['bad', 1], ['2026-11-06', 0], ['2026-11-09', 117.7]]))
      .toEqual([['2026-11-06', 117.6089], ['2026-11-09', 117.6]]);
    expect(validateLatest({ listDate: '2026-11-13', listNumber: 217, source: 'nbs', rates: { EUR: 117.62, USD: 101.2 } }))
      .toEqual({ listDate: '2026-11-13', listNumber: 217, source: 'nbs', rates: { EUR: 117.62, USD: 101.2 } });
    expect(validateLatest({ listDate: '2026-11-13', rates: { EUR: 117.62 } })).toBeNull();
  });
});

describe('app rates from NBS', () => {
  const table = ratesFromNbs({ listDate: '2026-11-13', rates: { EUR: 117.6203, USD: 101.5 } }, Date.UTC(2026, 10, 13, 9));

  it('is EUR based with EUR/USD as the cross of the two middle rates', () => {
    expect(table).toMatchObject({ base: 'EUR', provider: 'nbs', listDate: '2026-11-13' });
    expect(table.rates.RSD).toBe(117.6203);
    expect(table.rates.USD).toBeCloseTo(117.6203 / 101.5, 10);
    expect(rsdPer(table, 'EUR')).toBeCloseTo(117.6203, 8);
    expect(rsdPer(table, 'USD')).toBeCloseTo(101.5, 8);
  });

  it('converts amounts at the NBS middle rate', () => {
    expect(convertAmount(100, 'EUR', 'RSD', table)).toBe(11762.03);
    expect(convertAmount(10150, 'RSD', 'USD', table)).toBe(100);
    expect(convertAmount(101.5, 'USD', 'EUR', table)).toBeCloseTo(87.59, 2);
  });

  it('converter goes both ways', () => {
    expect(convertWithRate(100, 117.6203, 'toRsd')).toBe(11762.03);
    expect(convertWithRate(11762.03, 117.6203, 'fromRsd')).toBe(100);
    expect(convertWithRate(Number.NaN, 117.6, 'toRsd')).toBe(0);
    expect(convertWithRate(10, 0, 'toRsd')).toBe(0);
  });
});

describe('range maths', () => {
  const points: Array<[string, number]> = [
    ['2026-10-30', 117.5367],
    ['2026-11-02', 117.55],
    ['2026-11-03', 117.49],
    ['2026-11-04', 117.6],
    ['2026-11-05', 117.58],
  ];

  it('reports day and range change, low and high', () => {
    const stats = rangeStats(points)!;
    expect(stats.current).toBe(117.58);
    expect(stats.currentDate).toBe('2026-11-05');
    expect(stats.previousDate).toBe('2026-11-04');
    expect(stats.dayChange).toBe(-0.02);
    expect(stats.dayChangePct).toBeCloseTo((-0.02 / 117.6) * 100, 8);
    expect(stats.rangeChange).toBe(0.0433);
    expect(stats.rangeChangePct).toBeCloseTo((0.0433 / 117.5367) * 100, 8);
    expect(stats.min).toEqual({ value: 117.49, date: '2026-11-03' });
    expect(stats.max).toEqual({ value: 117.6, date: '2026-11-04' });
    expect(rangeStats([])).toBeNull();
    expect(rangeStats([['2026-11-05', 117]])).toMatchObject({ dayChange: 0, rangeChange: 0, previousDate: null });
  });

  it('keeps the list in force on the first day of the range', () => {
    // The range opens on Sunday 1 Nov: Friday's list still applies.
    expect(pointsSince(points, '2026-11-01')[0]).toEqual(['2026-10-30', 117.5367]);
    expect(pointsSince(points, '2026-11-02')[0]).toEqual(['2026-11-02', 117.55]);
    expect(pointsSince(points, '2026-12-01')).toEqual([['2026-11-05', 117.58]]);
    expect(rangeStart('2026-11-13', '1M')).toBe('2026-10-13');
  });

  it('downsamples long series but keeps the ends and the extremes', () => {
    const long: Array<[string, number]> = Array.from({ length: 1300 }, (_, i) => [addDays('2021-11-01', i), 117 + Math.sin(i / 40)]);
    long[700] = [long[700][0], 125];
    const drawn = downsample(long, 260);
    expect(drawn.length).toBeLessThanOrEqual(260);
    expect(drawn[0]).toEqual(long[0]);
    expect(drawn.at(-1)).toEqual(long.at(-1));
    expect(drawn.some(([, value]) => value === 125)).toBe(true);
    expect(downsample(points, 260)).toEqual(points);
  });

  it('merges stored and fresh points, fresh winning', () => {
    expect(mergePoints([['2026-11-02', 1], ['2026-11-03', 2]], [['2026-11-03', 3], ['2026-11-04', 4]]))
      .toEqual([['2026-11-02', 1], ['2026-11-03', 3], ['2026-11-04', 4]]);
  });
});
