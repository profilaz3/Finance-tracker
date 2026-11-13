import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownUp, Info, Loader2, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import type { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { GlassSheet } from '../ui/GlassSheet';
import { Segmented } from '../ui/Segmented';
import { formatMediumDate, formatNumber, formatPercent, formatShortDate, type AppLanguage } from '../../utils/locale';
import { belgradeToday, type NbsCurrency, type RatePoint } from '../../utils/nbsRates';
import {
  convertWithRate,
  downsample,
  pointsSince,
  RATE_RANGES,
  rangeStart,
  rangeStats,
  rsdPer,
  type RateRange,
} from '../../domain/exchangeRates';
import { parseOptionalNumberInput } from '../../utils/numberInput';
import { RateChart } from './RateChart';
import { useNbsHistory } from './useNbsHistory';

type Strings = (typeof TRANSLATIONS)['en'];

interface RatesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  state: Pick<AppState, 'language' | 'rates'>;
}

const PAIRS: NbsCurrency[] = ['EUR', 'USD'];

/** ISO day (YYYY-MM-DD) as a local noon date, so no time zone shifts the day. */
const day = (iso: string) => new Date(`${iso}T12:00:00`);

const formatRate = (value: number, language: AppLanguage) =>
  formatNumber(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 }, language);

const formatSigned = (value: number, language: AppLanguage, digits = 4) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value), { minimumFractionDigits: digits, maximumFractionDigits: digits }, language)}`;

const formatSignedPct = (value: number, language: AppLanguage) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercent(Math.abs(value), 2, language)}`;

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');

const ChangeChip: React.FC<{ change: number; pct: number; language: AppLanguage; t: Strings }> = ({ change, pct, language, t }) => {
  const flat = Math.abs(change) < 0.00005;
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums',
        flat ? 'bg-chip text-muted' : 'bg-accent-soft text-accent',
      )}
    >
      {!flat && <Icon size={13} aria-hidden="true" />}
      {flat ? t.ratesUnchanged : `${formatSigned(change, language)} (${formatSignedPct(pct, language)})`}
    </span>
  );
};

const PairCard: React.FC<{
  currency: NbsCurrency;
  points: RatePoint[];
  range: RateRange;
  language: AppLanguage;
  t: Strings;
}> = ({ currency, points, range, language, t }) => {
  const [scrub, setScrub] = useState<RatePoint | null>(null);
  const stats = useMemo(() => rangeStats(points), [points]);
  const drawn = useMemo(() => downsample(points), [points]);
  if (!stats) return null;
  const shown = scrub ?? [stats.currentDate, stats.current];
  const rangeLabel = t[`ratesOver_${range}` as const];
  // Long ranges span years, so their dates carry one.
  const rangeDate = (date: string) => (range === '5Y' || range === '1Y' ? formatMediumDate(day(date), language) : formatShortDate(day(date), language));

  return (
    <section className="paper-tile flex flex-col gap-3 p-4" aria-label={`${currency}/RSD`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">1 {currency} = RSD</p>
          <p className="text-[28px] font-bold leading-tight tracking-[-0.5px] tabular-nums" aria-live="polite">
            {formatRate(shown[1], language)}
          </p>
          <p className="text-[12px] text-muted">{formatMediumDate(day(shown[0]), language)}</p>
        </div>
        {!scrub && stats.previousDate && (
          <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
            <ChangeChip change={stats.dayChange} pct={stats.dayChangePct} language={language} t={t} />
            <span className="text-[11px] text-muted">{fill(t.ratesVsPrevious, { date: formatShortDate(day(stats.previousDate), language) })}</span>
          </div>
        )}
      </div>

      <RateChart
        points={drawn}
        formatTick={(value) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)}
        formatDateLabel={rangeDate}
        onScrub={setScrub}
        ariaLabel={fill(t.ratesChartAria, { pair: `${currency}/RSD`, range: rangeLabel })}
      />

      <dl className="grid grid-cols-3 gap-2 text-[12px]">
        <div className="flex min-w-0 flex-col rounded-2xl bg-chip px-3 py-2">
          <dt className="text-muted">{rangeLabel}</dt>
          <dd className={clsx('truncate font-semibold tabular-nums', stats.rangeChange > 0 ? 'text-accent' : '')}>
            {formatSignedPct(stats.rangeChangePct, language)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col rounded-2xl bg-chip px-3 py-2">
          <dt className="text-muted">{t.ratesLow}</dt>
          <dd className="truncate font-semibold tabular-nums">{formatRate(stats.min.value, language)}</dd>
          <dd className="truncate text-[11px] text-muted">{rangeDate(stats.min.date)}</dd>
        </div>
        <div className="flex min-w-0 flex-col rounded-2xl bg-chip px-3 py-2">
          <dt className="text-muted">{t.ratesHigh}</dt>
          <dd className="truncate font-semibold tabular-nums">{formatRate(stats.max.value, language)}</dd>
          <dd className="truncate text-[11px] text-muted">{rangeDate(stats.max.date)}</dd>
        </div>
      </dl>
    </section>
  );
};

const Converter: React.FC<{ rsdPerUnit: Record<NbsCurrency, number>; language: AppLanguage; t: Strings }> = ({ rsdPerUnit, language, t }) => {
  const [currency, setCurrency] = useState<NbsCurrency>('EUR');
  const [toRsd, setToRsd] = useState(true);
  const [text, setText] = useState('100');
  const amount = parseOptionalNumberInput(text.replace(/\s/g, '').replace(',', '.')) ?? 0;
  const result = convertWithRate(amount, rsdPerUnit[currency], toRsd ? 'toRsd' : 'fromRsd');
  const fromCode = toRsd ? currency : 'RSD';
  const toCode = toRsd ? 'RSD' : currency;

  return (
    <section className="paper-tile flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold">{t.ratesConverter}</h3>
        <Segmented<NbsCurrency>
          size="sm"
          ariaLabel={t.ratesConverter}
          value={currency}
          onChange={setCurrency}
          options={PAIRS.map((code) => ({ value: code, label: code }))}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="paper-field flex h-14 min-w-0 flex-1 items-center gap-2 rounded-[18px] px-4">
          <span className="sr-only">{fill(t.ratesAmount, { currency: fromCode })}</span>
          <input
            inputMode="decimal"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[20px] font-bold tabular-nums focus:outline-none"
          />
          <span className="text-[14px] font-semibold text-muted">{fromCode}</span>
        </label>
        <button
          type="button"
          onClick={() => {
            setToRsd((value) => !value);
            if (result > 0) setText(String(result));
          }}
          aria-label={t.ratesSwap}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-accent"
        >
          <ArrowDownUp size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="flex items-baseline justify-between gap-2 rounded-[18px] bg-chip px-4 py-3">
        <span className="truncate text-[22px] font-bold tabular-nums">
          {formatNumber(result, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)}
        </span>
        <span className="text-[14px] font-semibold text-muted">{toCode}</span>
      </p>
      <p className="text-[12px] text-muted">{t.ratesConverterNote}</p>
    </section>
  );
};

/** NBS middle rates for EUR and USD: today's list, charts over time and a converter. */
export const RatesSheet: React.FC<RatesSheetProps> = ({ isOpen, onClose, state }) => {
  const language = state.language;
  const t = TRANSLATIONS[language];
  const [range, setRange] = useState<RateRange>('3M');
  const today = belgradeToday();
  const from = rangeStart(today, range);
  const { history, status, retry } = useNbsHistory(from, isOpen);

  const series = useMemo(() => {
    const out = {} as Record<NbsCurrency, RatePoint[]>;
    for (const currency of PAIRS) out[currency] = history ? pointsSince(history.series[currency], from) : [];
    return out;
  }, [history, from]);

  // Today's list: from the history call, else the app's own rate table.
  const latest = history?.latest ?? null;
  const appIsNbs = state.rates.provider === 'nbs';
  const listDate = latest?.listDate ?? (appIsNbs ? state.rates.listDate : undefined);
  const rsdPerUnit: Record<NbsCurrency, number> = {
    EUR: latest?.rates.EUR ?? series.EUR.at(-1)?.[1] ?? rsdPer(state.rates, 'EUR'),
    USD: latest?.rates.USD ?? series.USD.at(-1)?.[1] ?? rsdPer(state.rates, 'USD'),
  };
  const hasSeries = series.EUR.length > 0 || series.USD.length > 0;
  const sourceLine = listDate
    ? fill(t.ratesNbsMiddle, { date: formatMediumDate(day(listDate), language) })
    : fill(t.ratesMarketRate, { date: formatMediumDate(new Date(state.rates.date), language) });

  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title={t.ratesTitle} closeLabel={t.close}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-col gap-0.5 px-1">
          <p className="text-[14px] font-semibold">{sourceLine}</p>
          {latest?.listNumber ? <p className="text-[12px] text-muted">{fill(t.ratesListNumber, { number: String(latest.listNumber) })}</p> : null}
          {listDate && listDate < today && (
            <p className="mt-1 flex items-start gap-1.5 text-[12px] text-muted">
              <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
              {t.ratesWeekendNote}
            </p>
          )}
        </div>

        <Segmented<RateRange>
          ariaLabel={t.ratesRangeAria}
          value={range}
          onChange={setRange}
          options={RATE_RANGES.map((value) => ({ value, label: t[`ratesRange_${value}` as const] }))}
        />

        {status === 'loading' && !hasSeries && (
          <div className="paper-tile flex h-48 items-center justify-center gap-2 text-[14px] text-muted" role="status">
            <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t.ratesLoading}
          </div>
        )}

        {(status === 'error' || status === 'offline') && (
          <div className="paper-tile flex items-center justify-between gap-3 p-4" role="status">
            <p className="text-[13px] text-muted">{status === 'offline' ? t.ratesOffline : t.ratesUnavailable}</p>
            {status === 'error' && (
              <button type="button" onClick={retry} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3 text-[13px] font-semibold text-accent">
                <RotateCcw size={14} aria-hidden="true" />
                {t.ratesRetry}
              </button>
            )}
          </div>
        )}

        {PAIRS.map((currency) => (
          series[currency].length > 0 && (
            <PairCard key={currency} currency={currency} points={series[currency]} range={range} language={language} t={t} />
          )
        ))}

        {rsdPerUnit.EUR > 0 && rsdPerUnit.USD > 0 && <Converter rsdPerUnit={rsdPerUnit} language={language} t={t} />}

        <p className="px-1 text-[12px] text-muted">{t.ratesNbsSource}</p>
      </div>
    </GlassSheet>
  );
};
