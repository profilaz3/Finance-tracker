import React, { useId, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownUp, ChevronsUpDown, RotateCcw, Wallet, WifiOff } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { MOTION } from '../../config';
import type { AppState, Currency } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { GlassSheet } from '../ui/GlassSheet';
import { Segmented } from '../ui/Segmented';
import { AmountInput } from '../ui/AmountInput';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { formatMediumDate, formatMoney, formatNumber, formatPercent, formatShortDate, type AppLanguage } from '../../utils/locale';
import { formatAmountForInput } from '../../utils/numberInput';
import { pluralText } from '../../utils/plural';
import { belgradeToday, type NbsCurrency, type RatePoint } from '../../utils/nbsRates';
import {
  convertWithRate,
  downsample,
  holdingIn,
  holdingWorth,
  pointsSince,
  RATE_RANGES,
  rangeStart,
  rangeStats,
  rsdPer,
  type RangeStats,
  type RateRange,
} from '../../domain/exchangeRates';
import { resolveHomeHeader } from '../../domain/homeHeader';
import { calculateAccountBalance } from '../../utils/financialSelectors';
import { fill } from '../home/parts';
import { RateChart } from './RateChart';
import { useNbsHistory } from './useNbsHistory';
import { RATES_STRINGS } from './ratesStrings';

type Strings = (typeof RATES_STRINGS)['en'];

interface RatesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  state: Pick<AppState, 'language' | 'rates' | 'accounts' | 'transactions' | 'homeHeader'>;
}

const PAIRS: NbsCurrency[] = ['EUR', 'USD'];
const MINUS = '−';

/** ISO day (YYYY-MM-DD) as a local noon date, so no time zone shifts the day. */
const day = (iso: string) => new Date(`${iso}T12:00:00`);

const formatRate = (value: number, language: AppLanguage) =>
  formatNumber(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 }, language);

const sign = (value: number) => (value > 0 ? '+' : value < 0 ? MINUS : '');

const signedRate = (value: number, language: AppLanguage) => `${sign(value)}${formatRate(Math.abs(value), language)}`;

const signedPct = (value: number, language: AppLanguage) => `${sign(value)}${formatPercent(Math.abs(value), 2, language)}`;

const dinars = (value: number, language: AppLanguage) =>
  `${formatNumber(Math.abs(value), { maximumFractionDigits: 0 }, language)} RSD`;

/** Rates are neither good nor bad: changes read in white on the header and in the accent below, never green or red. */
const isFlat = (change: number) => Math.abs(change) < 0.00005;

const Arrow: React.FC<{ change: number }> = ({ change }) =>
  isFlat(change) ? null : <span aria-hidden="true">{change > 0 ? '↑' : '↓'}</span>;

// ------------------------------------------------------------------ header

const Hero: React.FC<{
  currency: NbsCurrency;
  onCurrency: (currency: NbsCurrency) => void;
  rate: number;
  scrub: RatePoint | null;
  onScrub: (point: RatePoint | null) => void;
  stats: RangeStats | null;
  points: RatePoint[];
  range: RateRange;
  onRange: (range: RateRange) => void;
  rangeAvailable: (range: RateRange) => boolean;
  loading: boolean;
  sourceLine: string;
  language: AppLanguage;
  s: Strings;
}> = ({ currency, onCurrency, rate, scrub, onScrub, stats, points, range, onRange, rangeAvailable, loading, sourceLine, language, s }) => {
  const drawn = useMemo(() => downsample(points), [points]);
  const longRange = range === '1Y' || range === '5Y';
  const chartDate = (date: string) => (longRange ? formatMediumDate(day(date), language) : formatShortDate(day(date), language));
  const shown = scrub ? scrub[1] : rate;
  // While scrubbing: that day, and how far it is from today's rate.
  const scrubDiff = scrub ? scrub[1] - rate : 0;

  return (
    <>
      <div className="pr-12">
        <Segmented<NbsCurrency>
          tone="hero"
          size="sm"
          ariaLabel={s.pairs}
          value={currency}
          onChange={onCurrency}
          className="w-fit"
          options={PAIRS.map((code) => ({
            value: code,
            label: (
              <span className="inline-flex items-center gap-1.5 px-1">
                <CurrencyFlag currency={code} size={16} />
                {code}
              </span>
            ),
          }))}
        />
      </div>

      {/* Not a live region: the chart is a slider, which reads the scrubbed day itself. */}
      <p className="mt-4 whitespace-nowrap text-[42px] font-bold leading-none tracking-[-0.035em] tabular-nums" data-rate-value>
        <span className="sr-only">1 {currency} = </span>
        {formatRate(shown, language)}{' '}
        <span className="text-[16px] font-semibold tracking-normal text-white/60">RSD</span>
      </p>

      <div className="mt-2.5 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        {scrub ? (
          <>
            <span className="font-semibold">{formatMediumDate(day(scrub[0]), language)}</span>
            {!isFlat(scrubDiff) && (
              <span className="text-white/70 tabular-nums">{signedRate(scrubDiff, language)} {fill(s.vsPrevious, { date: formatShortDate(day(stats?.currentDate ?? scrub[0]), language) })}</span>
            )}
          </>
        ) : stats?.previousDate ? (
          <>
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-white/15 px-2.5 font-semibold tabular-nums">
              {isFlat(stats.dayChange) ? s.unchanged : (
                <>
                  <Arrow change={stats.dayChange} />
                  <span className="sr-only">{sign(stats.dayChange)}</span>
                  {formatRate(Math.abs(stats.dayChange), language)}
                  {Math.abs(stats.dayChangePct) >= 0.005 && <span className="text-white/70">· {formatPercent(Math.abs(stats.dayChangePct), 2, language)}</span>}
                </>
              )}
            </span>
            <span className="text-white/70">{fill(s.vsPrevious, { date: formatShortDate(day(stats.previousDate), language) })}</span>
          </>
        ) : (
          <span className="text-white/70">{sourceLine}</span>
        )}
      </div>

      <div className="-mx-2 mt-3">
        {drawn.length > 1 ? (
          <RateChart
            points={drawn}
            height={124}
            drawKey={`${currency}-${range}`}
            formatDateLabel={chartDate}
            formatValue={(value) => `${formatRate(value, language)} RSD`}
            onScrub={onScrub}
            ariaLabel={fill(s.chartAria, { pair: `${currency}/RSD`, range: s.over[range] })}
          />
        ) : loading ? (
          <div className="mx-2 h-[124px] animate-pulse rounded-[20px] bg-white/10 motion-reduce:animate-none" role="status">
            <span className="sr-only">{s.loading}</span>
          </div>
        ) : (
          <div className="mx-2 flex h-[124px] items-center justify-center rounded-[20px] border border-dashed border-white/25 px-6 text-center text-[13px] text-white/75">
            {s.noHistory}
          </div>
        )}
      </div>

      {(drawn.length > 1 || loading) && <div className="mt-3 flex items-center justify-between gap-3">
        <Segmented<RateRange>
          tone="hero"
          size="sm"
          ariaLabel={s.rangeAria}
          value={range}
          onChange={onRange}
          className="w-fit"
          options={RATE_RANGES.map((value) => ({ value, label: <span className="px-1">{s.range[value]}</span>, disabled: !rangeAvailable(value) }))}
        />
        {(scrub || stats?.previousDate) && <span className="truncate text-[12px] font-semibold text-white/70">{sourceLine}</span>}
      </div>}
    </>
  );
};

// ------------------------------------------------------------------ body

/** Change over the range, low and high: one quiet row instead of boxes. */
const RangeRow: React.FC<{ stats: RangeStats; range: RateRange; language: AppLanguage; s: Strings }> = ({ stats, range, language, s }) => {
  const longRange = range === '1Y' || range === '5Y';
  const date = (iso: string) => (longRange ? formatMediumDate(day(iso), language) : formatShortDate(day(iso), language));
  const cell = 'flex min-w-0 flex-col gap-0.5 px-3 first:pl-4 last:pr-4';
  return (
    <dl className="paper-tile grid grid-cols-3 divide-x divide-[var(--paper-line)] py-3.5">
      <div className={cell}>
        <dt className="truncate text-[12px] font-medium text-muted">{s.over[range]}</dt>
        <dd className={clsx('truncate text-[16px] font-bold tabular-nums', !isFlat(stats.rangeChange) && 'text-accent')}>
          {signedPct(stats.rangeChangePct, language)}
        </dd>
        <dd className="truncate text-[12px] text-muted tabular-nums">{signedRate(stats.rangeChange, language)}</dd>
      </div>
      <div className={cell}>
        <dt className="truncate text-[12px] font-medium text-muted">{s.low}</dt>
        <dd className="truncate text-[16px] font-bold tabular-nums">{formatRate(stats.min.value, language)}</dd>
        <dd className="truncate text-[12px] text-muted">{date(stats.min.date)}</dd>
      </div>
      <div className={cell}>
        <dt className="truncate text-[12px] font-medium text-muted">{s.high}</dt>
        <dd className="truncate text-[16px] font-bold tabular-nums">{formatRate(stats.max.value, language)}</dd>
        <dd className="truncate text-[12px] text-muted">{date(stats.max.date)}</dd>
      </div>
    </dl>
  );
};

const CodeChip: React.FC<{ code: Currency; onSwitch?: () => void; switchLabel?: string }> = ({ code, onSwitch, switchLabel }) => {
  const look = 'flex h-10 flex-none items-center gap-1.5 rounded-full bg-tile pl-1.5 pr-3 text-[14px] font-semibold shadow-[0_0_0_1px_var(--paper-line)]';
  if (!onSwitch) {
    return (
      <span className={look}>
        <CurrencyFlag currency={code} size={24} />
        {code}
      </span>
    );
  }
  return (
    <button type="button" onClick={onSwitch} aria-label={switchLabel} className={clsx(look, 'pr-2 hover:bg-chip focus-visible:ring-2 focus-visible:ring-accent')}>
      <CurrencyFlag currency={code} size={24} />
      {code}
      <ChevronsUpDown size={14} className="text-muted" aria-hidden="true" />
    </button>
  );
};

const Converter: React.FC<{
  currency: NbsCurrency;
  onCurrency: (currency: NbsCurrency) => void;
  rate: number;
  language: AppLanguage;
  s: Strings;
  t: (typeof TRANSLATIONS)['en'];
}> = ({ currency, onCurrency, rate, language, s, t }) => {
  const [toRsd, setToRsd] = useState(true);
  // Parsed in the app language ("1.500,50" in Serbian); unreadable text says so instead of showing 0.
  const [amount, setAmount] = useState<number | undefined>(100);
  const [text, setText] = useState('100');
  const inputId = useId();
  const errorId = useId();
  const unreadable = text.trim() !== '' && amount === undefined;
  const negative = amount !== undefined && amount < 0;
  const usable = amount !== undefined && amount >= 0 ? amount : 0;
  const result = convertWithRate(usable, rate, toRsd ? 'toRsd' : 'fromRsd');
  const fromCode: Currency = toRsd ? currency : 'RSD';
  const toCode: Currency = toRsd ? 'RSD' : currency;
  const error = unreadable ? t.amountUnreadable : negative ? t.amountAboveZero : null;
  const other = PAIRS.find((code) => code !== currency) ?? 'EUR';
  const switchChip = { onSwitch: () => onCurrency(other), switchLabel: fill(s.switchCurrency, { currency: other }) };

  return (
    <section className="paper-tile flex flex-col gap-3 p-4" aria-labelledby={`${inputId}-title`}>
      <h3 id={`${inputId}-title`} className="px-0.5 text-[15px] font-bold">{s.convert}</h3>
      <div className="relative flex flex-col gap-1.5">
        <div className="flex h-[60px] min-w-0 items-center gap-2 rounded-[20px] pl-4 pr-2.5 shadow-[inset_0_0_0_1.5px_var(--paper-line)] transition-shadow focus-within:shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]">
          <label htmlFor={inputId} className="sr-only">{fill(s.amountIn, { currency: fromCode })}</label>
          <AmountInput
            id={inputId}
            value={amount}
            onValueChange={(next, raw) => {
              setAmount(next);
              setText(raw);
            }}
            language={language}
            enterKeyHint="done"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="min-w-0 flex-1 bg-transparent text-[22px] font-bold tabular-nums focus:outline-none"
          />
          <CodeChip code={fromCode} {...(toRsd ? switchChip : {})} />
        </div>
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
          aria-label={s.swap}
          animate={{ rotate: toRsd ? 0 : 180 }}
          transition={MOTION.modal.spring}
          className="absolute left-1/2 top-1/2 z-10 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_0_4px_var(--paper-tile)]"
        >
          <ArrowDownUp size={18} aria-hidden="true" />
        </m.button>
        <div className="flex h-[60px] min-w-0 items-center justify-between gap-2 rounded-[20px] bg-chip pl-4 pr-2.5">
          <output aria-label={fill(s.resultIn, { currency: toCode })} aria-live="polite" className="min-w-0 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={`${toCode}-${currency}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={MOTION.view.transition}
                className="block truncate text-[22px] font-bold tabular-nums"
              >
                {formatNumber(result, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)}
              </m.span>
            </AnimatePresence>
          </output>
          <CodeChip code={toCode} {...(toRsd ? {} : switchChip)} />
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="-mt-1 px-1 text-[12px] font-medium text-neg">{error}</p>
      )}
      <p className="text-center text-[12px] font-semibold tabular-nums text-muted">
        1 {currency} = {formatRate(rate, language)} RSD
        <span className="mx-1.5 opacity-60" aria-hidden="true">·</span>
        1 RSD = {formatNumber(1 / rate, { minimumFractionDigits: 4, maximumFractionDigits: 4 }, language)} {currency}
      </p>
    </section>
  );
};

/** What the user's wallets in this currency are worth in dinars, and how the rate moved that value over the range. */
const HoldingRow: React.FC<{
  currency: NbsCurrency;
  total: number;
  wallets: number;
  worth: number;
  change: number | null;
  range: RateRange;
  language: AppLanguage;
  s: Strings;
}> = ({ currency, total, wallets, worth, change, range, language, s }) => (
  <section className="paper-tile flex flex-col gap-3 p-4" aria-label={s.yours[currency]}>
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Wallet size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-bold">{s.yours[currency]}</h3>
        <p className="truncate text-[13px] text-muted tabular-nums">
          {formatMoney(total, currency, language)} {pluralText(wallets, language, s.inWallets)}
        </p>
      </div>
    </div>
    <dl className="flex flex-col divide-y divide-[var(--paper-line)] border-t border-[var(--paper-line)] text-[14px]">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <dt className="text-muted">{s.worthToday}</dt>
        <dd className="font-bold tabular-nums">{total < 0 ? MINUS : ''}{dinars(worth, language)}</dd>
      </div>
      {change !== null && (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <dt className="text-muted">{s.over[range]}</dt>
          <dd className={clsx('font-bold tabular-nums', change !== 0 && 'text-accent')}>
            {change === 0 ? s.unchanged : `${sign(change)}${dinars(change, language)}`}
          </dd>
        </div>
      )}
    </dl>
  </section>
);

const Banner: React.FC<{ text: string; onRetry?: () => void; s: Strings }> = ({ text, onRetry, s }) => (
  <div role="status" className="flex items-center gap-3 rounded-[22px] bg-chip py-2.5 pl-4 pr-2.5">
    <WifiOff size={18} className="shrink-0 text-muted" aria-hidden="true" />
    <p className="min-w-0 flex-1 text-[13px] text-muted">{text}</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent">
        <RotateCcw size={14} aria-hidden="true" />
        {s.retry}
      </button>
    )}
  </div>
);

// ------------------------------------------------------------------ sheet

/** NBS middle rates for EUR and USD: one pair at a time in the header with its chart, then the range, a converter and what the user's own wallets in that currency are worth. */
export const RatesSheet: React.FC<RatesSheetProps> = ({ isOpen, onClose, state }) => {
  const language = state.language;
  const t = TRANSLATIONS[language];
  const s = RATES_STRINGS[language];
  const [currency, setCurrency] = useState<NbsCurrency>('EUR');
  const [range, setRange] = useState<RateRange>('3M');
  const [scrub, setScrub] = useState<RatePoint | null>(null);
  const today = belgradeToday();
  const from = rangeStart(today, range);
  const { history, status, retry } = useNbsHistory(from, isOpen);
  const tone = resolveHomeHeader(state.homeHeader).tone;

  const points = useMemo(() => (history ? pointsSince(history.series[currency], from) : []), [history, currency, from]);
  const stats = useMemo(() => rangeStats(points), [points]);

  // Today's list: from the history call, else the series, else the app's own rate table.
  const latest = history?.latest ?? null;
  const appIsNbs = state.rates.provider === 'nbs';
  const rate = latest?.rates[currency] ?? stats?.current ?? rsdPer(state.rates, currency);
  const usesNbs = Boolean(latest?.rates[currency]) || points.length > 0 || appIsNbs;
  const listDate = latest?.listDate ?? stats?.currentDate ?? (appIsNbs ? state.rates.listDate : undefined);
  const sourceLine = usesNbs && listDate
    ? fill(s.source, { date: formatShortDate(day(listDate), language) })
    : fill(s.sourceMarket, { date: formatShortDate(new Date(state.rates.date), language) });

  // After a failed refresh only the ranges the saved history covers can be shown.
  const failed = status === 'error' || status === 'offline';
  const hasData = points.length > 0;
  const rangeAvailable = (value: RateRange) =>
    !failed || value === range || Boolean(history && history.coveredFrom <= rangeStart(today, value));
  const shownDate = listDate ? formatShortDate(day(listDate), language) : formatShortDate(new Date(state.rates.date), language);
  const bannerText = status === 'offline' ? fill(s.offline, { date: shownDate }) : hasData ? fill(s.failed, { date: shownDate }) : s.failedNoData;

  const holding = useMemo(() => {
    const wallets = state.accounts.map((account) => ({ currency: account.currency, balance: calculateAccountBalance(state, account) }));
    return holdingIn(wallets, currency);
    // calculateAccountBalance reads only accounts, transactions and rates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.accounts, state.transactions, state.rates, currency]);
  const value = holding ? holdingWorth(holding.total, rate, points[0]?.[1] ?? null) : null;

  const footnote = [
    usesNbs
      ? fill(s.footNbs, { list: latest?.listNumber ? fill(s.footList, { number: String(latest.listNumber) }) : '' })
      : s.footMarket,
    listDate && listDate < today ? s.footWeekend : '',
  ].filter(Boolean).join(' ');

  const changeCurrency = (next: NbsCurrency) => {
    setCurrency(next);
    setScrub(null);
  };
  const changeRange = (next: RateRange) => {
    setRange(next);
    setScrub(null);
  };

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={onClose}
      title={s.title}
      hideTitle
      closeLabel={t.close}
      hero={{
        tone,
        content: (
          <Hero
            currency={currency}
            onCurrency={changeCurrency}
            rate={rate}
            scrub={scrub}
            onScrub={setScrub}
            stats={stats}
            points={points}
            range={range}
            onRange={changeRange}
            rangeAvailable={rangeAvailable}
            loading={status === 'loading'}
            sourceLine={sourceLine}
            language={language}
            s={s}
          />
        ),
      }}
    >
      <div className="flex flex-col gap-3 pb-1 pt-1">
        {failed && <Banner text={bannerText} onRetry={status === 'error' ? retry : undefined} s={s} />}
        {stats && points.length > 1 && <RangeRow stats={stats} range={range} language={language} s={s} />}
        {rate > 0 && <Converter currency={currency} onCurrency={changeCurrency} rate={rate} language={language} s={s} t={t} />}
        {holding && value && (
          <HoldingRow
            currency={currency}
            total={holding.total}
            wallets={holding.wallets}
            worth={value.worth}
            change={value.change}
            range={range}
            language={language}
            s={s}
          />
        )}
        <p className="px-1 text-[12px] leading-relaxed text-muted">{footnote}</p>
      </div>
    </GlassSheet>
  );
};
