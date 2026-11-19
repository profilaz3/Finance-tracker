import React, { useMemo, useRef } from 'react';
import clsx from 'clsx';
import { Pencil, Plane, TrendingDown, TrendingUp } from 'lucide-react';
import type { Currency, HomeHeader, HomeHeaderFace } from '../../types';
import { parseLocalDate, topCategories } from '../../domain/home';
import {
  daysLeftInMonth,
  shownFace,
  shownStats,
  statAmount,
  todayAllowance,
  tripToday,
  walletIdOf,
  type HeaderNumbers,
} from '../../domain/homeHeader';
import { pointsSince, rangeStart, rangeStats } from '../../domain/exchangeRates';
import { belgradeToday } from '../../utils/nbsRates';
import { formatDate, formatSummaryNumber, formatNumber, formatPercent, formatShortDate, getIntlLocale, type AppLanguage } from '../../utils/locale';
import { pluralForm } from '../../utils/plural';
import { useStatusBarOverHeader } from '../../hooks/useStatusBarOverHeader';
import { useNbsHistory } from '../rates/useNbsHistory';
import { openRates } from '../rates/ratesBus';
import { Sparkline } from '../ui/Sparkline';
import { netWorthTrend } from './blocks';
import { Avatar, fill, fitFont } from './parts';
import type { HomeActions, HomeData } from './useHomeData';
import { HEADER_STRINGS, type HeaderStrings } from './headerStrings';

interface HomeHeroProps {
  data: HomeData;
  header: HomeHeader;
  actions: HomeActions;
  editing: boolean;
  /** Month picker, team chip and profile (or the edit-mode buttons), drawn on the header colour. */
  topBar: React.ReactNode;
  onChangeHeader: () => void;
  /** Settings previews: no network, no status bar changes, no tap action. */
  preview?: boolean;
}

/** What one face draws: the label line, the main number and what sits under it. */
interface FaceView {
  label: React.ReactNode;
  chip?: React.ReactNode;
  amount: string;
  unit?: string;
  negative?: boolean;
  /** Short words after the number ("owed to you"). */
  suffix?: string;
  sub?: React.ReactNode;
  visual?: React.ReactNode;
  action?: () => void;
}

const plural = (count: number, language: AppLanguage, one: string, few: string, other: string): string => {
  const form = pluralForm(count, language);
  return (form === 'one' ? one : form === 'few' ? few : other).replace(/\{count\}/g, formatNumber(count, {}, language));
};

/** The number without its currency (the code sits beside it, smaller). Cents only for small foreign amounts. */
const figure = (amount: number, currency: Currency, language: AppLanguage): string => {
  return formatSummaryNumber(Math.abs(amount), currency, language);
};

const moneyText = (amount: number, currency: Currency, language: AppLanguage): string => `${figure(amount, currency, language)} ${currency}`;

const monthName = (data: HomeData): string =>
  new Intl.DateTimeFormat(getIntlLocale(data.language), {
    month: 'long',
    ...(data.month.year !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  }).format(new Date(data.month.year, data.month.month, 1));

const weekdayInitials = (language: AppLanguage): string[] => {
  const formatter = new Intl.DateTimeFormat(getIntlLocale(language), { weekday: 'narrow' });
  // 2026-11-02 is a Monday.
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2026, 10, 2 + i)));
};

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white/90">
    {children}
  </span>
);

// ---------------------------------------------------------------- Visuals

const CategoryBar: React.FC<{ data: HomeData; total: number }> = ({ data, total }) => {
  const { t, summary } = data;
  const h = HEADER_STRINGS[data.language];
  const scale = Math.max(total, summary.spent, 1);
  const segments = topCategories(summary.byCategory, 5, t.other);
  const legend = summary.byCategory.slice(0, 3);
  const more = summary.byCategory.length - legend.length;
  return (
    <div className="mt-4">
      <div aria-hidden="true" className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-white/20">
        {segments.map(segment => (
          <span key={segment.categoryId} className="h-full first:rounded-l-full" style={{ width: `${((segment.amount / scale) * 100).toFixed(2)}%`, background: segment.color }} />
        ))}
      </div>
      {legend.length > 0 && (
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] font-medium text-white/85">
          {legend.map(entry => (
            <span key={entry.categoryId} className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/50" style={{ background: entry.color }} />
              <span className="max-w-[9rem] truncate">{entry.name}</span>
            </span>
          ))}
          {more > 0 && <span className="text-white/60">{fill(h.hdrMore, { count: more })}</span>}
        </div>
      )}
    </div>
  );
};

const WeekBars: React.FC<{ week: readonly number[]; pace: number; language: AppLanguage }> = ({ week, pace, language }) => {
  const todayIndex = (new Date().getDay() + 6) % 7;
  const top = Math.max(pace, ...week, 1) * 1.08;
  const labels = weekdayInitials(language);
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="relative flex h-[68px] items-end gap-2">
        {pace > 0 && (
          <span className="absolute inset-x-0 border-t-[1.5px] border-dashed border-white/70" style={{ bottom: `${((pace / top) * 100).toFixed(1)}%` }} />
        )}
        {week.map((value, i) => (
          <span
            key={i}
            className={clsx('flex-1 rounded-[7px]', i === todayIndex ? 'bg-white' : i < todayIndex ? 'bg-white/45' : 'bg-white/15')}
            style={{ height: i > todayIndex ? 4 : `${Math.max(7, (value / top) * 100).toFixed(1)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {labels.map((label, i) => (
          <span key={i} className={clsx('flex-1 text-center text-[11px] font-semibold', i === todayIndex ? 'text-white' : 'text-white/55')}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

const InOutBars: React.FC<{ h: HeaderStrings; income: number; spent: number }> = ({ h, income, spent }) => {
  const max = Math.max(income, spent, 1);
  const rows: Array<[string, number, string]> = [
    [h.stat_in, income, 'bg-white'],
    [h.stat_spent, spent, 'bg-white/55'],
  ];
  return (
    <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
      {rows.map(([label, value, tone]) => (
        <span key={label} className="grid grid-cols-[minmax(0,76px)_1fr] items-center gap-3">
          <span className="truncate text-[12px] font-semibold text-white/70">{label}</span>
          <span className="h-2.5 rounded-full bg-white/15">
            <span className={clsx('block h-full rounded-full', tone)} style={{ width: `${Math.max(value > 0 ? 2 : 0, (value / max) * 100).toFixed(1)}%` }} />
          </span>
        </span>
      ))}
    </div>
  );
};

const Progress: React.FC<{ ratio: number }> = ({ ratio }) => (
  <span aria-hidden="true" className="mt-4 block h-2 rounded-full bg-white/20">
    <span className="block h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%` }} />
  </span>
);

// ---------------------------------------------------------------- Faces

function budgetFace(data: HomeData, actions: HomeActions): FaceView {
  const { language, currency, summary } = data;
  const h = HEADER_STRINGS[data.language];
  const progress = data.budgetProgress!;
  const over = progress.left < 0;
  const daysLeft = daysLeftInMonth(summary.todayIndex, summary.daysInMonth);
  const month = monthName(data);
  return {
    label: fill(over ? h.hdrOverIn : h.hdrLeftIn, { month }),
    chip: data.isCurrentMonth ? <Chip>{plural(daysLeft, language, h.hdrDayLeft, h.hdrDaysLeftFew, h.hdrDaysLeft)}</Chip> : undefined,
    amount: figure(progress.left, currency, language),
    unit: currency,
    negative: over,
    sub: data.isCurrentMonth && !over
      ? fill(h.hdrAboutPerDay, { amount: moneyText(progress.left / daysLeft, currency, language) })
      : fill(h.hdrOverHint, { spent: moneyText(progress.spent, currency, language), limit: moneyText(progress.total, currency, language) }),
    visual: <CategoryBar data={data} total={progress.total} />,
    action: actions.openBudgets,
  };
}

function netWorthFace(data: HomeData, actions: HomeActions): FaceView {
  const { t, language, currency, summary } = data;
  const h = HEADER_STRINGS[data.language];
  const trend = netWorthTrend(data);
  const change = `${summary.netChange > 0 ? '+' : summary.netChange < 0 ? '−' : ''}${figure(summary.netChange, currency, language)}`;
  const TrendIcon = summary.netChange < 0 ? TrendingDown : TrendingUp;
  return {
    label: data.isCurrentMonth
      ? h.hdrTotalWallets
      : `${h.hdrTotalWallets} · ${fill(t.netWorthAsOf, { date: formatShortDate(new Date(data.month.year, data.month.month + 1, 0), language) })}`,
    chip: (
      <Chip>
        <TrendIcon size={13} aria-hidden="true" />
        {data.isCurrentMonth ? fill(h.hdrChangeThisMonth, { amount: change }) : fill(h.hdrChangeIn, { amount: change, month: monthName(data) })}
      </Chip>
    ),
    amount: figure(data.netWorth, currency, language),
    unit: currency,
    negative: data.netWorth < 0,
    visual: trend.length > 1 ? <Sparkline values={trend} height={58} color="rgba(255,255,255,0.95)" className="mt-3" /> : undefined,
    action: actions.openWallets,
  };
}

function todayFace(data: HomeData, numbers: HeaderNumbers, actions: HomeActions): FaceView {
  const { language, currency, summary } = data;
  const h = HEADER_STRINGS[data.language];
  const week = data.week ?? new Array<number>(7).fill(0);
  const date = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' }, language);
  const progress = data.budgetProgress;
  if (progress && progress.total > 0) {
    const allowance = todayAllowance(progress.total, summary.spent, numbers.spentToday, summary.todayIndex, summary.daysInMonth);
    const pace = moneyText(allowance.perDay, currency, language);
    return {
      label: allowance.left >= 0 ? h.hdrCanSpendToday : h.hdrOverToday,
      chip: <Chip><span className="capitalize">{date}</span></Chip>,
      amount: figure(allowance.left, currency, language),
      unit: currency,
      negative: allowance.left < 0,
      sub: numbers.spentToday > 0
        ? fill(h.hdrTodaySome, { amount: moneyText(numbers.spentToday, currency, language), pace })
        : fill(h.hdrTodayNothing, { pace }),
      visual: <WeekBars week={week} pace={allowance.perDay} language={language} />,
      action: actions.openActivity,
    };
  }
  return {
    label: h.hdrSpentToday,
    chip: <Chip><span className="capitalize">{date}</span></Chip>,
    amount: figure(numbers.spentToday, currency, language),
    unit: currency,
    sub: numbers.avgDay > 0 ? fill(h.hdrTodayAverage, { pace: moneyText(numbers.avgDay, currency, language) }) : undefined,
    visual: <WeekBars week={week} pace={numbers.avgDay} language={language} />,
    action: actions.openActivity,
  };
}

function monthFace(data: HomeData, actions: HomeActions): FaceView {
  const { language, currency, summary } = data;
  const h = HEADER_STRINGS[data.language];
  const net = summary.income - summary.spent;
  const month = monthName(data);
  return {
    label: fill(net >= 0 ? h.hdrSavedIn : h.hdrShortIn, { month }),
    amount: figure(net, currency, language),
    unit: currency,
    negative: net < 0,
    sub: fill(h.hdrInOut, { income: moneyText(summary.income, currency, language), spent: moneyText(summary.spent, currency, language) }),
    visual: <InOutBars h={h} income={summary.income} spent={summary.spent} />,
    action: actions.openInsights,
  };
}

function owedFace(data: HomeData, actions: HomeActions): FaceView {
  const { language, currency } = data;
  const h = HEADER_STRINGS[data.language];
  const owers = data.people.filter(entry => entry.net > 0);
  const onlyIOwe = data.owedToMe < 0.005 && data.iOwe >= 0.005;
  const people = onlyIOwe ? data.people.filter(entry => entry.net < 0) : owers;
  const peopleText = people.length > 0 ? plural(people.length, language, h.hdrOnePerson, h.hdrPeopleFew, h.hdrPeople) : null;
  const sub = data.owedToMe < 0.005 && data.iOwe < 0.005
    ? h.hdrAllSettled
    : [peopleText, !onlyIOwe && data.iOwe >= 0.005 ? fill(h.hdrYouOweAmount, { amount: moneyText(data.iOwe, currency, language) }) : null]
      .filter(Boolean)
      .join(' · ');
  return {
    label: onlyIOwe ? h.stat_iOwe : h.face_owed,
    amount: figure(onlyIOwe ? data.iOwe : data.owedToMe, currency, language),
    unit: currency,
    sub,
    visual: people.length > 0 ? (
      <span aria-hidden="true" className="mt-4 flex items-center">
        {people.slice(0, 5).map((entry, i) => (
          <span key={entry.person.id} className={clsx('rounded-full ring-2 ring-white/45', i > 0 && '-ml-2')}>
            <Avatar name={entry.person.name} color={entry.person.color} image={/^(data:|http)/.test(entry.person.avatar ?? '') ? entry.person.avatar : undefined} size={34} />
          </span>
        ))}
        {people.length > 5 && <span className="ml-2 text-[13px] font-semibold text-white/75">{fill(h.hdrMore, { count: people.length - 5 })}</span>}
      </span>
    ) : undefined,
    action: actions.openPeople,
  };
}

function tripFace(data: HomeData, actions: HomeActions): FaceView | null {
  const { language, currency } = data;
  const h = HEADER_STRINGS[data.language];
  const trip = data.event ? tripToday(data.event.event) : null;
  if (!data.event || !trip) return null;
  const { event, total, expenseCount } = data.event;
  return {
    label: (
      <span className="flex min-w-0 items-center gap-1.5">
        <Plane size={15} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{fill(h.hdrTripDay, { name: event.name, day: trip.day, days: trip.days })}</span>
      </span>
    ),
    chip: trip.days > 1 ? <Chip>{trip.day === trip.days ? h.hdrTripLastDay : fill(h.hdrTripEnds, { date: formatShortDate(trip.end, language) })}</Chip> : undefined,
    amount: figure(total, currency, language),
    unit: currency,
    suffix: h.hdrTripSpent,
    sub: expenseCount > 0 ? plural(expenseCount, language, h.hdrTripExpense, h.hdrTripExpensesFew, h.hdrTripExpenses) : h.hdrTripNone,
    visual: <Progress ratio={trip.day / trip.days} />,
    action: () => actions.openEvent(event),
  };
}

/** Euro rate over the past month; reads stored history at once and refreshes when `live`. */
function useRateFace(data: HomeData, live: boolean): FaceView {
  const { t, language } = data;
  const h = HEADER_STRINGS[data.language];
  const from = rangeStart(belgradeToday(), '1M');
  const { history, status } = useNbsHistory(from, live);
  const points = useMemo(() => (history ? pointsSince(history.series.EUR, from) : []), [history, from]);
  const stats = rangeStats(points);
  const value = stats?.current ?? data.rsdPerUnit.EUR;
  const pct = stats?.rangeChangePct ?? null;
  // Without history (offline, or the request failed) the sub line is left out rather than "Loading" forever.
  const change = pct == null
    ? (live && status === 'loading' ? h.hdrRateLoading : undefined)
    : Math.abs(pct) < 0.005
      ? t.ratesUnchanged
      : fill(h.hdrRateChange, { change: `${pct > 0 ? '+' : '−'}${formatPercent(Math.abs(pct), 2, language)}` });
  return {
    label: h.hdrEuroRate,
    chip: data.ratesListDate ? <Chip>{fill(h.hdrRateList, { date: formatShortDate(parseLocalDate(data.ratesListDate), language) })}</Chip> : undefined,
    amount: value > 0 ? formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language) : '…',
    unit: 'RSD',
    sub: change,
    visual: points.length > 1 ? <Sparkline values={points.map(([, rate]) => rate)} height={58} color="rgba(255,255,255,0.95)" className="mt-3" /> : undefined,
    action: openRates,
  };
}

// ---------------------------------------------------------------- Numbers under it

interface StatCell {
  key: string;
  label: string;
  value: string;
  sub?: string;
  negative?: boolean;
}

export function headerNumbers(data: HomeData): HeaderNumbers {
  const { summary, budgetProgress } = data;
  const hasBudget = !!budgetProgress && budgetProgress.total > 0;
  return {
    income: summary.income,
    spent: summary.spent,
    budgetTotal: hasBudget ? budgetProgress!.total : null,
    budgetLeft: hasBudget ? budgetProgress!.left : null,
    netWorth: data.netWorth,
    owedToMe: data.owedToMe,
    iOwe: data.iOwe,
    spentToday: data.isCurrentMonth ? summary.byDay[summary.todayIndex - 1] ?? 0 : 0,
    avgDay: summary.todayIndex > 0 ? summary.spent / summary.todayIndex : 0,
    week: data.week ? data.week.reduce((sum, value) => sum + value, 0) : 0,
  };
}

export const headerContext = (data: HomeData) => ({
  hasBudget: !!data.budgetProgress && data.budgetProgress.total > 0,
  isCurrentMonth: data.isCurrentMonth,
  walletIds: data.wallets.map(wallet => wallet.account.id),
});

/** Label of a number under the main one, for the cells and the sheet's chips. */
export function statLabel(stat: string, data: HomeData): string {
  const walletId = walletIdOf(stat);
  if (walletId) return data.wallets.find(wallet => wallet.account.id === walletId)?.account.name ?? '';
  return (HEADER_STRINGS[data.language] as Record<string, string>)[`stat_${stat}`] ?? stat;
}

export function statCells(stats: readonly string[], data: HomeData, numbers: HeaderNumbers): StatCell[] {
  const { language, currency, summary } = data;
  const h = HEADER_STRINGS[data.language];
  return stats.map(stat => {
    const walletId = walletIdOf(stat);
    if (walletId) {
      const wallet = data.wallets.find(entry => entry.account.id === walletId)!;
      const own = wallet.account.currency;
      const foreign = own !== currency;
      return {
        key: stat,
        label: wallet.account.name,
        value: foreign ? `${figure(wallet.balance, own, language)} ${own}` : figure(wallet.balance, own, language),
        negative: wallet.balance < 0,
        sub: foreign ? `≈ ${moneyText(wallet.baseBalance, currency, language)}` : own,
      };
    }
    const amount = statAmount(stat, numbers) ?? 0;
    const sub = stat === 'left' && data.isCurrentMonth
      ? plural(daysLeftInMonth(summary.todayIndex, summary.daysInMonth), language, h.hdrDayLeft, h.hdrDaysLeftFew, h.hdrDaysLeft)
      : stat === 'avgDay'
        ? h.statSub_avgDay
        : stat === 'week'
          ? h.statSub_week
          : undefined;
    return { key: stat, label: statLabel(stat, data), value: figure(amount, currency, language), negative: amount < 0, sub };
  });
}

const Stats: React.FC<{ cells: StatCell[]; dark: boolean }> = ({ cells, dark }) => (
  <div className={clsx('mt-5 grid gap-2', cells.length === 1 ? 'grid-cols-1' : cells.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
    {cells.map(cell => (
      <span
        key={cell.key}
        className={clsx('flex min-w-0 flex-col rounded-2xl px-3 py-2.5 ring-1 ring-inset', dark ? 'bg-white/[0.07] ring-white/10' : 'bg-white/[0.13] ring-white/[0.16]')}
        style={{ containerType: 'inline-size' }}
      >
        <span className="truncate text-[12px] font-semibold text-white/70">{cell.label}</span>
        {/* Shrinks to fit instead of cutting the figure off. */}
        <span className="mt-0.5 whitespace-nowrap font-bold leading-[22px] tabular-nums tracking-[-0.01em]" style={{ fontSize: fitFont(17, `${cell.negative ? '−' : ''}${cell.value}`, 0.62) }}>
          {cell.negative && '−'}
          {cell.value}
        </span>
        {cell.sub && <span className="truncate text-[11.5px] text-white/55">{cell.sub}</span>}
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------- Header

/** Which face is on screen: a trip while one is on (when allowed), else the pick with its fallbacks. */
export function activeFace(header: HomeHeader, data: HomeData): HomeHeaderFace | 'trip' {
  if (header.trip && data.isCurrentMonth && data.event && tripToday(data.event.event)) return 'trip';
  return shownFace(header.face, headerContext(data));
}

export const HomeHero: React.FC<HomeHeroProps> = ({ data, header, actions, editing, topBar, onChangeHeader, preview }) => {
  const ref = useRef<HTMLElement>(null);
  useStatusBarOverHeader(ref, !preview);
  const face = activeFace(header, data);
  const rate = useRateFace(data, !preview && face === 'rate');
  const numbers = headerNumbers(data);
  const h = HEADER_STRINGS[data.language];
  const dark = header.tone === 'dark';

  const view: FaceView =
    face === 'trip' ? tripFace(data, actions)!
      : face === 'budget' ? budgetFace(data, actions)
        : face === 'networth' ? netWorthFace(data, actions)
          : face === 'today' ? todayFace(data, numbers, actions)
            : face === 'owed' ? owedFace(data, actions)
              : face === 'rate' ? rate
                : monthFace(data, actions);

  const cells = statCells(shownStats(header.stats, headerContext(data)), data, numbers);
  const amountText = `${view.negative ? '−' : ''}${view.amount}${view.unit ?? ''}${view.suffix ?? ''}`;

  const body = (
    <>
      <span className="flex min-h-[26px] items-center justify-between gap-2">
        <span className="min-w-0 truncate py-px text-[14px] font-medium leading-5 text-white/80">{view.label}</span>
        {view.chip}
      </span>
      <span className="mt-1 block min-w-0" style={{ containerType: 'inline-size' }}>
        <span
          className="flex items-baseline gap-x-2 whitespace-nowrap font-bold leading-[1.08] tracking-[-0.04em] tabular-nums"
          style={{ fontSize: fitFont(52, amountText, view.suffix ? 0.5 : 0.58) }}
        >
          <span>
            {view.negative && '−'}
            {view.amount}
          </span>
          {view.unit && <span className="text-[0.42em] font-semibold tracking-normal text-white/70">{view.unit}</span>}
          {view.suffix && <span className="text-[0.4em] font-semibold tracking-normal text-white/75">{view.suffix}</span>}
        </span>
      </span>
      {view.sub && <span className="mt-1 block text-[13.5px] leading-snug text-white/75">{view.sub}</span>}
      {view.visual}
      {cells.length > 0 && <Stats cells={cells} dark={dark} />}
    </>
  );

  return (
    <section
      ref={ref}
      aria-label={typeof view.label === 'string' ? view.label : undefined}
      className={clsx('screen-hero hero-bg relative isolate overflow-hidden', dark && 'hero-dark', preview && 'screen-hero-preview')}
    >
      <div className="relative">{topBar}</div>
      <div className={clsx('relative px-4 md:px-5', preview ? 'pb-4 pt-4' : editing ? 'pb-[58px] pt-2 md:pb-12' : 'pb-[42px] pt-2 md:pb-5')}>
        {editing ? (
          <button
            type="button"
            onClick={onChangeHeader}
            aria-label={h.changeHeader}
            className="relative block w-full rounded-[24px] p-3 text-left outline-dashed outline-[1.5px] outline-offset-0 outline-white/50"
          >
            {body}
            <span className="absolute -bottom-[22px] left-1/2 flex h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 text-[15px] font-semibold text-[#14171A] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)]">
              <Pencil size={16} aria-hidden="true" />
              {h.changeHeader}
            </span>
          </button>
        ) : view.action && !preview ? (
          // overflow-visible: buttons hide overflow globally, and the rounded corner would clip the label's first letter.
          <button type="button" onClick={view.action} className="block w-full overflow-visible rounded-[20px] text-left">
            {body}
          </button>
        ) : (
          <div>{body}</div>
        )}
      </div>
    </section>
  );
};
