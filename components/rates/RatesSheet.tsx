import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownUp, Info, Loader2, RotateCcw } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { MOTION } from '../../config';
import { DeltaPill } from '../ui/primitives';
import { Illustration } from '../ui/Illustration';
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
import { AmountInput } from '../ui/AmountInput';
import { formatAmountForInput } from '../../utils/numberInput';
import { RateChart } from './RateChart';
import { useNbsHistory } from './useNbsHistory';
import { CurrencyFlag, CurrencyPair } from '../ui/CurrencyFlag';

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

/** Rates are neither good nor bad, so the change reads in the accent, not green or red. */
const ChangeChip: React.FC<{ change: number; pct: number; language: AppLanguage; t: Strings }> = ({ change, pct, language, t }) => {
  const flat = Math.abs(change) < 0.00005;
  return (
    <DeltaPill
      direction={flat ? 'flat' : change > 0 ? 'up' : 'down'}
      size="md"
      className={flat ? undefined : 'bg-accent-soft! text-accent!'}
    >
      {flat ? t.ratesUnchanged : `${formatSigned(change, language)} (${formatSignedPct(pct, language)})`}
    </DeltaPill>
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
      <div className="flex items-center gap-3">
        <CurrencyPair base={currency} size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{currency}/RSD</p>
          <p className="truncate text-[12px] text-muted">1 {currency} = RSD</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[36px] font-bold leading-none tracking-[-1px] tabular-nums" aria-live="polite">
          {formatRate(shown[1], language)}
        </p>
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
          {!scrub && stats.previousDate ? (
            <>
              <ChangeChip change={stats.dayChange} pct={stats.dayChangePct} language={language} t={t} />
              <span className="text-[12px] text-muted">{fill(t.ratesVsPrevious, { date: formatShortDate(day(stats.previousDate), language) })}</span>
            </>
          ) : (
            <span className="text-[12px] text-muted">{formatMediumDate(day(shown[0]), language)}</span>
          )}
        </div>
      </div>

      <RateChart
        points={drawn}
        formatTick={(value) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)}
        formatDateLabel={rangeDate}
        onScrub={setScrub}
        formatValue={(value) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)}
        ariaLabel={fill(t.ratesChartAria, { pair: `${currency}/RSD`, range: rangeLabel })}
      />

      <dl className="grid grid-cols-3 gap-2 text-[12px]">
        <div className="flex min-w-0 flex-col rounded-2xl bg-chip px-3 py-2">
          <dt className="text-muted">{rangeLabel}</dt>
          <dd className={clsx('truncate font-semibold tabular-nums', stats.rangeChange !== 0 && 'text-accent')}>
            <span aria-hidden="true">{stats.rangeChange > 0 ? '↑ ' : stats.rangeChange < 0 ? '↓ ' : ''}</span>
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

const CodeChip: React.FC<{ code: NbsCurrency | 'RSD' }> = ({ code }) => (
  <span className="flex h-9 flex-none items-center gap-1.5 rounded-full bg-tile pl-1.5 pr-3 text-[14px] font-semibold shadow-[0_0_0_1px_var(--paper-line)]">
    <CurrencyFlag currency={code} size={22} />
    {code}
  </span>
);

const Converter: React.FC<{
  rsdPerUnit: Record<NbsCurrency, number>;
  /** Whether each rate is the NBS middle rate (else the app's market fallback). */
  nbsRate: Record<NbsCurrency, boolean>;
  language: AppLanguage;
  t: Strings;
}> = ({ rsdPerUnit, nbsRate, language, t }) => {
  const [currency, setCurrency] = useState<NbsCurrency>('EUR');
  const [toRsd, setToRsd] = useState(true);
  // Parsed in the app language ("1.500,50" in Serbian); unreadable text says so instead of showing 0.
  const [amount, setAmount] = useState<number | undefined>(100);
  const [text, setText] = useState('100');
  const unreadable = text.trim() !== '' && amount === undefined;
  const negative = amount !== undefined && amount < 0;
  const usable = amount !== undefined && amount >= 0 ? amount : 0;
  const result = convertWithRate(usable, rsdPerUnit[currency], toRsd ? 'toRsd' : 'fromRsd');
  const fromCode = toRsd ? currency : 'RSD';
  const toCode = toRsd ? 'RSD' : currency;
  const errorId = 'rates-converter-error';
  const error = unreadable ? t.amountUnreadable : negative ? t.amountAboveZero : null;

  return (
    <section className="paper-tile flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold">{t.ratesConverter}</h3>
        <Segmented<NbsCurrency>
          size="sm"
          ariaLabel={t.ratesConverter}
          value={currency}
          onChange={setCurrency}
          options={PAIRS.map((code) => ({
            value: code,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <CurrencyFlag currency={code} size={16} />
                {code}
              </span>
            ),
          }))}
        />
      </div>
      <div className="relative flex flex-col gap-1.5">
        <label className="paper-field flex h-14 min-w-0 items-center gap-2 rounded-[18px] pl-4 pr-2">
          <span className="sr-only">{fill(t.ratesAmount, { currency: fromCode })}</span>
          <AmountInput
            value={amount}
            onValueChange={(next, raw) => {
              setAmount(next);
              setText(raw);
            }}
            language={language}
            enterKeyHint="done"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="min-w-0 flex-1 bg-transparent text-[20px] font-bold tabular-nums focus:outline-none"
          />
          <CodeChip code={fromCode} />
        </label>
        <m.button
          type="button"
          onClick={() => {
            setToRsd((value) => !value);
            if (result > 0 && !error) {
              // The result becomes the new amount, written the way the app language types it.
              const next = Math.round(result * 100) / 100;
              setAmount(next);
              setText(formatAmountForInput(next, language));
            }
          }}
          aria-label={t.ratesSwap}
          animate={{ rotate: toRsd ? 0 : 180 }}
          transition={MOTION.modal.spring}
          className="absolute left-1/2 top-1/2 z-10 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_0_4px_var(--paper-tile)]"
        >
          <ArrowDownUp size={18} aria-hidden="true" />
        </m.button>
        <p className="flex h-14 items-center justify-between gap-2 rounded-[18px] bg-chip pl-4 pr-2">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={`${toCode}-${currency}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={MOTION.view.transition}
              className="truncate text-[22px] font-bold tabular-nums"
            >
              {formatNumber(result, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)}
            </m.span>
          </AnimatePresence>
          <CodeChip code={toCode} />
        </p>
      </div>
      {error && (
        <p id={errorId} role="alert" className="-mt-1 px-1 text-[12px] font-medium text-neg">{error}</p>
      )}
      <p className="text-center text-[12px] font-semibold tabular-nums text-muted">
        1 {currency} = {formatRate(rsdPerUnit[currency], language)} RSD
      </p>
      <p className="text-[12px] text-muted">{nbsRate[currency] ? t.ratesConverterNote : t.ratesConverterNoteMarket}</p>
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
  // Which rate the converter really uses: NBS when it came from the list or history, else the market fallback.
  const nbsRate: Record<NbsCurrency, boolean> = {
    EUR: Boolean(latest?.rates.EUR) || series.EUR.length > 0 || appIsNbs,
    USD: Boolean(latest?.rates.USD) || series.USD.length > 0 || appIsNbs,
  };
  const showsNbs = Boolean(latest) || hasSeries || appIsNbs;
  // After a failed refresh only the ranges the saved history covers can be shown.
  const failed = status === 'error' || status === 'offline';
  const rangeAvailable = (value: RateRange) =>
    !failed || value === range || Boolean(history && history.coveredFrom <= rangeStart(today, value));
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
          options={RATE_RANGES.map((value) => ({ value, label: t[`ratesRange_${value}` as const], disabled: !rangeAvailable(value) }))}
        />

        {status === 'loading' && !hasSeries && (
          <div className="paper-tile flex h-48 items-center justify-center gap-2 text-[14px] text-muted" role="status">
            <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {t.ratesLoading}
          </div>
        )}

        {(status === 'error' || status === 'offline') && (
          <div className="paper-tile flex items-center gap-3 p-3 pr-4" role="status">
            <span className="h-[72px] w-[88px] shrink-0" aria-hidden="true">
              <Illustration name="offline" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <p className="text-[13px] text-muted">
                {status === 'offline' ? t.ratesOffline : (hasSeries ? `${t.ratesUnavailable} ${t.ratesTryAgainHint}` : t.ratesUnavailable)}
              </p>
              {status === 'error' && (
                <button type="button" onClick={retry} className="flex h-10 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent">
                  <RotateCcw size={14} aria-hidden="true" />
                  {t.ratesRetry}
                </button>
              )}
            </div>
          </div>
        )}

        {PAIRS.map((currency) => (
          series[currency].length > 0 && (
            <PairCard key={currency} currency={currency} points={series[currency]} range={range} language={language} t={t} />
          )
        ))}

        {rsdPerUnit.EUR > 0 && rsdPerUnit.USD > 0 && <Converter rsdPerUnit={rsdPerUnit} nbsRate={nbsRate} language={language} t={t} />}

        <p className="px-1 text-[12px] text-muted">{showsNbs ? t.ratesNbsSource : t.ratesMarketSource}</p>
      </div>
    </GlassSheet>
  );
};
