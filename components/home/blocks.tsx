import React from 'react';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import type { HomeBlock, HomeBlockType } from '../../types';
import { topCategories, parseLocalDate } from '../../domain/home';
import { formatNumber, formatPercent, formatShortDate, formatMediumDate, formatMonthYear, getIntlLocale } from '../../utils/locale';
import { localizeTransactionNote } from '../../utils/systemText';
import type { HomeActions, HomeData } from './useHomeData';
import { HEADER_STRINGS } from './headerStrings';
import { openRates } from '../rates/ratesBus';
import { RatesTrend } from '../rates/RatesTrend';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { AccountGlyph } from '../ui/AccountGlyph';
import { CurrencyFlag, CurrencyPair } from '../ui/CurrencyFlag';
import { Illustration, type IllustrationName } from '../ui/Illustration';
import { Sparkline } from '../ui/Sparkline';
import { DeltaPill, deltaTone } from '../ui/primitives';
import { Avatar, Big, BlockHead, DateChip, Label, ListRow, Ring, SummaryAmount, compactMoney, fill, fitFont, money, rowMoney } from './parts';

export interface BlockProps {
  block: HomeBlock;
  data: HomeData;
  actions: HomeActions;
  /** Gallery and settings previews: no network, stored data only. */
  preview?: boolean;
}

/** Blocks whose content holds its own buttons; their tile is not one big button. */
export const HAS_INNER_ACTIONS = (block: HomeBlock): boolean =>
  block.type === 'quickadd' || block.type === 'recent' || (block.type === 'people' && block.style === 'list');

/** What tapping the whole tile does outside edit mode. */
export function tileAction(block: HomeBlock, data: HomeData, actions: HomeActions): (() => void) | undefined {
  switch (block.type) {
    case 'budget': return actions.openBudgets;
    case 'networth': return actions.openInsights;
    case 'categories': return actions.openInsights;
    case 'daily': return actions.openActivity;
    case 'wallets': return actions.openWallets;
    case 'people': return actions.openPeople;
    case 'event': return data.event ? () => actions.openEvent(data.event!.event) : actions.createEvent;
    case 'upcoming': return actions.openRecurring;
    case 'rates': return openRates;
    default: return undefined;
  }
}

const Tile: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className, style }) => (
  <div className={clsx('paper-tile flex h-full w-full flex-col overflow-hidden p-4 text-left', className)} style={style}>
    {children}
  </div>
);

const monthLabel = (data: HomeData) =>
  data.isCurrentMonth ? data.t.thisMonth : formatMonthYear(new Date(data.month.year, data.month.month, 1), data.language);

/** "No spending this month", or "No spending in October 2025" for a past month. */
const noSpendingLabel = (data: HomeData) =>
  data.isCurrentMonth ? data.t.noSpendingYet : fill(data.t.noSpendingIn, { month: monthLabel(data) });

/** Past months show the net worth they ended at: say so ("As of 31 Oct 2025"). */
const netWorthAsOf = (data: HomeData): string | null =>
  data.isCurrentMonth ? null : fill(data.t.netWorthAsOf, { date: formatMediumDate(new Date(data.month.year, data.month.month + 1, 0), data.language) });

/** Empty block body: a small spot illustration beside (or above, when `stacked`) the message. */
const EmptyArt: React.FC<{ name: IllustrationName; children: React.ReactNode; stacked?: boolean }> = ({ name, children, stacked }) => (
  <span className={clsx('flex flex-1 items-center text-[13px] text-muted', stacked ? 'flex-col justify-center gap-1 text-center' : 'gap-3 py-1')}>
    <Illustration name={name} className={clsx('shrink-0', stacked ? '!h-[60px] !w-[76px]' : '!h-[58px] !w-[72px]')} />
    <span className="min-w-0">{children}</span>
  </span>
);

/** Budget share that deserves a heads-up before it runs over. */

// ---------------------------------------------------------------- Budget

const BudgetBar: React.FC<{ data: HomeData }> = ({ data }) => {
  const progress = data.budgetProgress!;
  const ratio = progress.spentRatio;
  const over = ratio > 1;
  const elapsed = Math.min(1, progress.monthElapsed);
  const showToday = data.isCurrentMonth && progress.total > 0;
  const todayLeft = `${Math.min(94, Math.max(6, elapsed * 100)).toFixed(1)}%`;
  const label = fill(data.t.spentOfLimit, {
    spent: money(progress.spent, data.currency, data.language),
    limit: money(progress.total, data.currency, data.language),
  });
  return (
    <div role="img" aria-label={label} className="relative h-[34px] shrink-0">
      <span className="absolute inset-x-0 top-0 h-3 rounded-md bg-chip" />
      <span
        className={clsx('absolute left-0 top-0 h-3 rounded-md', over ? 'bg-neg' : 'bg-accent')}
        style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }}
      />
      {showToday && (
        <>
          <span className="absolute top-[-3px] h-[18px] w-0.5 rounded-sm bg-on-surface" style={{ left: `${(elapsed * 100).toFixed(1)}%` }} />
          <span className="absolute top-[18px] -translate-x-1/2 text-[11px] font-semibold text-muted" style={{ left: todayLeft }}>
            {data.t.today}
          </span>
        </>
      )}
    </div>
  );
};

const budgetRight = (data: HomeData) => {
  const progress = data.budgetProgress!;
  if (progress.total <= 0) return undefined;
  return progress.left >= 0
    ? fill(data.t.amountLeft, { amount: money(progress.left, data.currency, data.language) })
    : fill(data.t.amountOver, { amount: money(-progress.left, data.currency, data.language) });
};

const NoBudget: React.FC<{ data: HomeData; small?: boolean }> = ({ data, small }) => (
  <Tile>
    {small ? <Label>{data.t.block_budget}</Label> : <BlockHead title={data.t.block_budget} />}
    <span className="mt-auto flex items-center gap-1.5 text-[17px] font-bold text-accent">
      <Plus size={18} aria-hidden="true" />
      {data.t.setBudget}
    </span>
    <span className="mt-1 text-[13px] text-muted">{data.t.setBudgetHint}</span>
  </Tile>
);

const BudgetBlock: React.FC<BlockProps> = ({ block, data }) => {
  const progress = data.budgetProgress;
  if (!progress) return <NoBudget data={data} small={block.size === 's'} />;
  const { t, currency, language } = data;

  if (block.style === 'ring') {
    const over = progress.left < 0;
    return (
      <Tile>
        <div className="flex items-start justify-between">
          <Label>{t.block_budget}</Label>
          <Ring
            ratio={progress.spentRatio}
            radius={25}
            stroke={7}
            color={over ? 'var(--paper-neg)' : undefined}
          >
            <span className={clsx('text-[12px] font-bold tabular-nums tracking-[-0.3px]', over && 'text-neg')}>
              {formatPercent(Math.round(progress.spentRatio * 100), 0, language)}
            </span>
          </Ring>
        </div>
        <Big className={clsx('mt-auto', over && 'text-neg')}><SummaryAmount value={Math.abs(progress.left)} currency={currency} language={language} fitSize={30} /></Big>
        <span className="text-[13px] text-muted">
          {over ? t.amountOver.replace('{amount}', '').trim() : `${t.leftShort} ${fill(t.ofAmount, { amount: money(progress.total, currency, language) })}`}
        </span>
      </Tile>
    );
  }

  const pace = progress.total > 0 && data.isCurrentMonth ? (progress.aheadOfPace ? t.spendingFast : t.onPace) : null;
  const summaryLine = progress.total > 0
    ? fill(t.spentOfLimit, { spent: money(progress.spent, currency, language), limit: money(progress.total, currency, language) })
    : null;

  if (block.style === 'bar') {
    return (
      <Tile>
        <BlockHead title={t.block_budget} right={budgetRight(data)} />
        {progress.total > 0 && <BudgetBar data={data} />}
        <span className="mt-1.5 text-[13px] text-muted">
          {[summaryLine, pace].filter(Boolean).join(' · ')}
        </span>
      </Tile>
    );
  }

  const maxRows = block.size === 'l' ? 8 : 3;
  const rows = progress.categories.slice(0, maxRows);
  return (
    <Tile>
      <BlockHead title={t.block_budget} right={budgetRight(data)} />
      {progress.total > 0 && <BudgetBar data={data} />}
      {rows.length === 0 ? (
        <span className="mt-2 text-[13px] text-muted">{t.categoryLimits}: {t.notSet}</span>
      ) : (
        <div className="mt-2.5 flex flex-col gap-3">
          {rows.map(row => {
            const over = row.over > 0;
            const share = row.limit > 0 ? row.spent / row.limit : 0;
            return (
              <div key={row.categoryId} className="grid grid-cols-[28px_1fr] items-center gap-x-2.5 gap-y-[5px]">
                <CategoryGlyph category={data.category(row.categoryId) ?? { name: row.name, color: row.color }} size={28} className="row-span-2" />
                <span className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{row.name}</span>
                  <span className={clsx('shrink-0', over ? 'font-bold text-neg' : 'font-medium text-muted')}>
                    {over
                      ? fill(t.amountOver, { amount: money(row.over, currency, language) })
                      : fill(t.amountLeft, { amount: money(row.left, currency, language) })}
                  </span>
                </span>
                <span className="block h-1.5 rounded-full bg-chip">
                  <span
                    className="block h-1.5 rounded-full"
                    style={{ width: `${Math.min(100, share * 100).toFixed(0)}%`, background: over ? 'var(--paper-neg)' : 'rgb(var(--accent-rgb))' }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Tile>
  );
};

// ---------------------------------------------------------------- Net worth

/** Net worth at the end of each elapsed day of the month, ending at today's (or the month-end) total. */
export const netWorthTrend = (data: HomeData): number[] => {
  const { summary } = data;
  if (summary.todayIndex < 3) return [];
  let value = data.netWorth - summary.netChange;
  const points = [value];
  for (let i = 0; i < summary.todayIndex; i += 1) {
    value += summary.netByDay[i] ?? 0;
    points.push(value);
  }
  return points;
};

const NetWorthBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, currency, language, summary } = data;
  const change = <SummaryAmount value={summary.netChange} currency={currency} language={language} showUnit={false} sign={summary.netChange > 0 ? '+' : ''} />;
  const spentRatio = summary.income > 0 ? summary.spent / summary.income : summary.spent > 0 ? 1 : 0;

  if (block.style === 'small') {
    return (
      <Tile>
        <Label>{t.block_networth}</Label>
        <Big className="mt-auto" size={26}><SummaryAmount value={data.netWorth} currency={currency} language={language} fitSize={26} /></Big>
        {netWorthAsOf(data) && <span className="text-[12px] text-muted">{netWorthAsOf(data)}</span>}
        <span className={clsx('text-[13px] font-semibold', summary.netChange >= 0 ? 'text-pos' : 'text-neg')}>{change}</span>
        <span className="text-[12px] text-muted">{monthLabel(data)}</span>
      </Tile>
    );
  }

  const accent = block.style === 'card';
  const trend = netWorthTrend(data);
  const statValues = [summary.income, summary.spent, summary.left];
  const statTexts = rowMoney(statValues, currency, language);
  const stats = [t.inShort, t.spent, t.leftShort].map((label, i) => [label, statTexts[i]] as const);
  const asOf = netWorthAsOf(data);

  return (
    <div
      className={clsx(
        'relative flex h-full w-full flex-col overflow-hidden text-left',
        accent ? 'accent-card rounded-[30px] px-5 pb-[18px] pt-5 text-white' : 'paper-tile p-5',
      )}
    >
      {accent && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute -right-[60px] -top-20 h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22),rgba(255,255,255,0)_70%)]" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[30px] shadow-[inset_1px_1px_0_rgba(255,255,255,0.28),inset_0_0_0_0.5px_rgba(255,255,255,0.12)]" />
        </>
      )}
      <span className={clsx('relative text-sm font-medium', accent ? 'opacity-80' : 'text-muted')}>
        {t.block_networth}
        {asOf && <span className="font-normal"> · {asOf}</span>}
      </span>
      <span className="relative mt-0.5 block min-w-0" style={{ containerType: 'inline-size' }}>
        <span className="block font-bold leading-[1.15] tracking-[-0.04em]">
          <SummaryAmount value={data.netWorth} currency={currency} language={language} fitSize={46} />
        </span>
      </span>
      <span className={clsx('relative mt-1 text-[13px] font-semibold', !accent && (summary.netChange >= 0 ? 'text-pos' : 'text-neg'))}>
        {change}{' '}
        <span className={clsx('font-medium', accent ? 'opacity-75' : 'text-muted')}>{monthLabel(data)}</span>
      </span>
      {trend.length > 0 && (
        <Sparkline
          values={trend}
          height={34}
          color={accent ? 'rgba(255,255,255,0.92)' : undefined}
          className="relative mt-2.5"
        />
      )}
      <div className={clsx('relative grid grid-cols-3 gap-2', trend.length > 0 ? 'mt-3' : 'mt-[18px]')}>
        {stats.map(([label, text]) => (
          <span key={label} className="flex min-w-0 flex-col gap-px" style={{ containerType: 'inline-size' }}>
            <span className={clsx('truncate text-[12px]', accent ? 'opacity-75' : 'text-muted')}>{label}</span>
            {/* Shrinks to fit instead of cutting the figure off. */}
            <span className="whitespace-nowrap font-bold leading-[22px]" style={{ fontSize: fitFont(17, text, 0.62) }}>{text}</span>
          </span>
        ))}
      </div>
      <span
        role="img"
        aria-label={`${formatNumber(Math.round(spentRatio * 100))}% ${t.spent}`}
        className={clsx('relative mt-2.5 block h-2 rounded', accent ? 'bg-white/20' : 'bg-chip')}
      >
        <span className={clsx('block h-2 rounded', accent ? 'bg-white' : 'bg-accent')} style={{ width: `${Math.min(100, spentRatio * 100).toFixed(1)}%` }} />
      </span>
      {block.size === 'l' && data.wallets.length > 0 && (
        <div className={clsx('relative mt-4 flex flex-col border-t pt-1', accent ? 'border-white/20' : 'border-hair')}>
          {data.wallets.slice(0, 4).map(wallet => (
            <span key={wallet.account.id} className="flex h-9 items-center justify-between gap-2 text-sm">
              <span className={clsx('truncate', accent ? 'opacity-85' : 'text-muted')}>{wallet.account.name}</span>
              <span className="shrink-0 font-semibold"><SummaryAmount value={wallet.balance} currency={wallet.account.currency} language={language} /></span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Categories

const Donut: React.FC<{ data: HomeData }> = ({ data }) => {
  const list = topCategories(data.summary.byCategory, 6, data.t.other);
  const radius = 30;
  const stroke = 13;
  const size = radius * 2 + stroke;
  const circumference = 2 * Math.PI * radius;
  const total = list.reduce((sum, entry) => sum + entry.amount, 0);
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0 -rotate-90">
      {total <= 0 && <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--paper-chip)" strokeWidth={stroke} />}
      {list.map(entry => {
        const length = (entry.amount / total) * circumference;
        const segment = (
          <circle
            key={entry.categoryId}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={entry.color}
            strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, length - (list.length > 1 ? 2 : 0)).toFixed(1)} ${circumference.toFixed(1)}`}
            strokeDashoffset={(-offset).toFixed(1)}
          />
        );
        offset += length;
        return segment;
      })}
    </svg>
  );
};

const CategoriesBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, summary, currency, language } = data;
  const empty = summary.byCategory.length === 0;

  if (block.style === 'donut') {
    const top = summary.byCategory[0];
    return (
      <Tile>
        <div className="flex items-start justify-between">
          <Label>{t.block_categories}</Label>
          <Donut data={data} />
        </div>
        {top ? (
          <>
            <span className="mt-auto truncate text-[17px] font-bold">{top.name}</span>
            <span className="text-[13px] text-muted">
              {formatNumber(Math.round((top.amount / summary.spent) * 100))}% · {money(top.amount, currency, language)}
            </span>
          </>
        ) : (
          <span className="mt-auto text-[13px] text-muted">{noSpendingLabel(data)}</span>
        )}
      </Tile>
    );
  }

  const right = <SummaryAmount value={summary.spent} currency={currency} language={language} />;
  if (empty) {
    return (
      <Tile>
        <BlockHead title={t.block_categories} />
        <EmptyArt name="chart">{noSpendingLabel(data)}</EmptyArt>
      </Tile>
    );
  }

  if (block.style === 'bars' && summary.byCategory.length > 2) {
    const list = topCategories(summary.byCategory, block.size === 'l' ? 10 : 5, t.other);
    const max = list.reduce((m, entry) => Math.max(m, entry.amount), 0);
    return (
      <Tile>
        <BlockHead title={t.block_categories} right={right} />
        <div className="flex flex-col gap-[9px]">
          {list.map(entry => (
            <div key={entry.categoryId} className="grid grid-cols-[22px_minmax(0,1.5fr)_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
              <CategoryGlyph category={data.category(entry.categoryId) ?? entry} size={22} className="!rounded-[7px]" />
              <span className="break-words font-medium">{entry.name}</span>
              <span className="h-1.5 rounded-full bg-chip">
                <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${((entry.amount / max) * 100).toFixed(1)}%` }} />
              </span>
              <span className="text-right font-semibold"><SummaryAmount value={entry.amount} currency={currency} language={language} showUnit={false} /></span>
            </div>
          ))}
        </div>
      </Tile>
    );
  }

  return (
    <Tile>
      <BlockHead title={t.block_categories} right={right} />
      <ul className="space-y-3">
        {topCategories(summary.byCategory, block.size === 'l' ? 9 : 5, t.other).map(entry => {
          const pct = summary.spent > 0 ? 100 * entry.amount / summary.spent : 0;
          return (
            <li key={entry.categoryId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[15px]">
                <span className="flex min-w-0 items-baseline gap-2 font-medium">
                  <i aria-hidden="true" className="size-2 shrink-0 self-center rounded-full" style={{ background: entry.color }} />
                  <span className="break-words">{entry.name}</span>
                </span>
                <span className="ml-auto text-right font-semibold tabular-nums">
                  <SummaryAmount value={entry.amount} currency={currency} language={language} showUnit={false} />
                  <span className="ml-1.5 text-[12px] font-medium text-muted">{formatPercent(pct, 0, language)}</span>
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-1 rounded-full bg-chip">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
};

// ---------------------------------------------------------------- Day by day

const weekdayInitials = (language: HomeData['language']): string[] => {
  const formatter = new Intl.DateTimeFormat(getIntlLocale(language), { weekday: 'narrow' });
  // 2026-11-02 is a Monday.
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2026, 10, 2 + i)));
};

/**
 * Scale top for the day bars: one big purchase (rent, a laptop) should not flatten every other day.
 * Above ~2x the 90th percentile of spending days the scale caps and the spike is marked instead.
 */
const dailyScale = (values: number[]): { top: number; capped: boolean } => {
  const max = Math.max(1, ...values);
  const spending = values.filter(value => value > 0).sort((a, b) => a - b);
  if (spending.length < 5) return { top: max, capped: false };
  const p90 = spending[Math.floor(0.9 * (spending.length - 1))];
  return max > p90 * 2.2 ? { top: p90 * 1.35, capped: true } : { top: max, capped: false };
};

const DailyBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, summary, currency, language, month } = data;
  const days = summary.byDay;
  const elapsed = summary.todayIndex;
  const { top: max, capped } = dailyScale(days.slice(0, Math.max(elapsed, 0)));
  const average = elapsed > 0 ? summary.spent / elapsed : 0;

  if (block.style === 'week') {
    const end = Math.max(elapsed, 1);
    const start = Math.max(0, end - 7);
    const week = days.slice(start, end);
    const weekMax = Math.max(1, ...week);
    const last = days[end - 1] ?? 0;
    const perDay = fill(t.perDay, { amount: money(average, currency, language) });
    const change = average > 0 ? (last - average) / average : 0;
    const scaleTop = Math.max(weekMax, average);
    return (
      <Tile>
        <Label>{data.isCurrentMonth ? t.today : formatShortDate(new Date(month.year, month.month, end), language)}</Label>
        <Big className="mt-1" size={26}><SummaryAmount value={last} currency={currency} language={language} fitSize={26} /></Big>
        {average > 0 && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
            {last > 0 && (
              <DeltaPill direction={change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat'} tone={deltaTone(change, 'down', 0.005)}>
                {formatPercent(Math.min(999, Math.round(Math.abs(change) * 100)), 0, language)}
              </DeltaPill>
            )}
            <span className="truncate">{perDay}</span>
          </span>
        )}
        <div className="relative mt-auto flex h-14 items-end gap-1" aria-hidden="true">
          {average > 0 && (
            <span
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--paper-faint)]"
              style={{ bottom: `${((average / scaleTop) * 100).toFixed(1)}%` }}
            />
          )}
          {week.map((value, i) => (
            <span
              key={i}
              className={clsx('flex-1 rounded-[5px]', i === week.length - 1 ? 'bg-accent' : 'bg-accent/35')}
              style={{ height: `${Math.max(6, (value / scaleTop) * 100)}%` }}
            />
          ))}
        </div>
      </Tile>
    );
  }

  const right = elapsed > 0 ? fill(t.perDay, { amount: money(average, currency, language) }) : undefined;

  if (block.style === 'calendar') {
    const first = new Date(month.year, month.month, 1);
    const lead = (first.getDay() + 6) % 7;
    const cellHeight = block.size === 'l' ? 44 : 26;
    return (
      <Tile>
        <BlockHead title={formatMonthYear(first, language)} right={right} />
        <div role="img" aria-label={t.block_daily} className="grid grid-cols-7 gap-1">
          {weekdayInitials(language).map((day, i) => (
            <span key={i} className="text-center text-[11px] font-semibold text-faint">{day}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
          {days.map((value, i) => {
            const day = i + 1;
            const past = day <= elapsed;
            const opacity = Math.min(1, 0.14 + (Math.min(value, max) / max) * 0.86);
            const strong = past && value > 0 && opacity > 0.55;
            return (
              <span
                key={day}
                className={clsx(
                  'relative flex flex-col items-center justify-center overflow-hidden rounded-[7px] text-[11px] font-semibold',
                  !past && 'text-faint shadow-[inset_0_0_0_1px_var(--paper-line)]',
                  data.isCurrentMonth && day === elapsed && 'shadow-[0_0_0_2px_var(--paper-text)]',
                )}
                style={{ height: cellHeight }}
              >
                {past && value > 0 && <span className="absolute inset-0 bg-accent" style={{ opacity }} />}
                <span className={clsx('relative', strong && 'text-on-accent')}>{day}</span>
                {block.size === 'l' && past && value > 0 && (
                  <span className={clsx('relative text-[9px] font-medium', strong ? 'text-on-accent' : 'text-muted')}>
                    {formatNumber(Math.round(value))}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </Tile>
    );
  }

  const height = block.size === 'l' ? 260 : 120;
  const todayPosition = elapsed > 0 ? ((elapsed - 0.5) / days.length) * 100 : -1;
  // Tallest capped day gets its real amount printed above the bar.
  const spikeIndex = capped ? days.slice(0, elapsed).reduce((best, value, i, list) => (value > list[best] ? i : best), 0) : -1;
  const spikeLeft = spikeIndex >= 0 ? Math.min(88, Math.max(12, ((spikeIndex + 0.5) / days.length) * 100)) : 0;
  return (
    <Tile>
      <BlockHead title={t.block_daily} right={right} />
      <div role="img" aria-label={right ? `${t.block_daily}, ${right}` : t.block_daily} className={clsx('relative flex items-end gap-[2px]', capped && 'pt-4')} style={{ height }}>
        {capped && (
          <span
            aria-hidden="true"
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-chip px-1.5 text-[10px] font-semibold leading-[14px] text-muted"
            style={{ left: `${spikeLeft}%` }}
          >
            {compactMoney(days[spikeIndex], currency, language)}
          </span>
        )}
        <span className="relative flex h-full flex-1 items-end gap-[2px]">
          {average > 0 && average < max && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed border-[var(--paper-faint)]"
              style={{ bottom: `${((average / max) * 100).toFixed(1)}%` }}
            />
          )}
          {days.map((value, i) => {
            const past = i < elapsed;
            const clipped = past && value > max;
            return (
              <span
                key={i}
                className={clsx(
                  'relative min-w-0 flex-1 rounded-t-[3px] rounded-b-[1px]',
                  past ? (i === elapsed - 1 && data.isCurrentMonth ? 'bg-on-surface' : 'bg-accent') : 'bg-chip',
                )}
                style={{ height: past ? `${Math.max(2, Math.min(1, value / max) * 100)}%` : '4%' }}
              >
                {clipped && (
                  <span aria-hidden="true" className="absolute inset-x-0 top-[5px] h-[3px] -skew-y-[24deg] bg-[var(--paper-tile)]" />
                )}
              </span>
            );
          })}
        </span>
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-faint">
        <span className="absolute left-0">{formatShortDate(new Date(month.year, month.month, 1), language)}</span>
        {data.isCurrentMonth && todayPosition > 12 && todayPosition < 88 && (
          <span className="absolute -translate-x-1/2 font-semibold text-on-surface" style={{ left: `${todayPosition}%` }}>{t.today}</span>
        )}
        <span className="absolute right-0">{days.length}</span>
      </div>
    </Tile>
  );
};

// ---------------------------------------------------------------- Wallets

const WalletsBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, currency, language, wallets } = data;
  const total = wallets.reduce((sum, wallet) => sum + wallet.baseBalance, 0);
  if (wallets.length === 0) {
    return (
      <Tile>
        <BlockHead title={t.block_wallets} />
        <EmptyArt name="wallet">{t.noWalletsYet}</EmptyArt>
      </Tile>
    );
  }

  const compact = block.style === 'cards';
  let rows = wallets.slice(0, block.size === 'l' ? 8 : 3);
  if (compact) {
    // Preserve wallet order while surfacing the largest holdings when space is limited.
    const biggest = new Set([...wallets].sort((a, b) => Math.abs(b.baseBalance) - Math.abs(a.baseBalance)).slice(0, 3));
    rows = wallets.length <= 4 ? wallets : wallets.filter(wallet => biggest.has(wallet));
  }
  const rowCurrency = rows[0].account.currency;
  const mixed = rows.some(wallet => wallet.account.currency !== rowCurrency);
  return (
    <Tile>
      <BlockHead title={t.block_wallets} right={<SummaryAmount value={total} currency={currency} language={language} />} className="mb-1" />
      {!mixed && rowCurrency !== currency && <span className="text-right text-xs font-medium text-muted">{rowCurrency}</span>}
      <ul className="divide-y divide-hair">
        {rows.map(({ account, balance }) => (
          <li key={account.id} className={clsx('flex flex-wrap items-center gap-x-2.5 gap-y-1', compact ? 'py-2' : 'py-3')}>
            <AccountGlyph account={account} size={compact ? 28 : 36} showCurrency={false} />
            <span className="min-w-0 flex-1 break-words text-[15px] font-medium">{account.name}</span>
            <span className={clsx('ml-auto text-right text-[15px] font-semibold', balance < 0 && 'text-neg')}>
              <SummaryAmount value={balance} currency={account.currency} language={language} showUnit={mixed} />
            </span>
          </li>
        ))}
      </ul>
      {rows.length < wallets.length && <p className="pt-2 text-[13px] font-medium text-muted">
        {fill(HEADER_STRINGS[language].walletsMore, { count: wallets.length - rows.length })}
      </p>}
    </Tile>
  );
};

// ---------------------------------------------------------------- People

const PeopleBlock: React.FC<BlockProps> = ({ block, data, actions }) => {
  const { t, currency, language, people } = data;
  const net = data.owedToMe - data.iOwe;

  if (block.style === 'stack') {
    const faces = people.slice(0, 4);
    return (
      <Tile>
        <div className="flex items-start justify-between gap-2">
          <Label>{t.block_people}</Label>
          {faces.length > 0 && (
            <span className="flex">
              {faces.map((entry, i) => (
                <span key={entry.person.id} className={clsx(i > 0 && '-ml-2.5')}>
                  <Avatar name={entry.person.name} color={entry.person.color} image={entry.person.avatar} size={30} ring />
                </span>
              ))}
            </span>
          )}
        </div>
        {people.length === 0 ? (
          <span className="mt-auto text-[17px] font-bold">{t.allSettled}</span>
        ) : (
          <>
            {/* Who the biggest open balance is with, in the space above the total. */}
            {(() => {
              const top = people.reduce((best, entry) => (Math.abs(entry.net) > Math.abs(best.net) ? entry : best));
              return (
                <span className="mt-2 flex min-w-0 items-baseline gap-1.5 text-[13px]">
                  <span className="truncate font-semibold">{top.person.name}</span>
                  <span className={clsx('shrink-0 whitespace-nowrap tabular-nums', top.net >= 0 ? 'text-pos' : 'text-neg')}>
                    {money(Math.abs(top.net), currency, language)}
                  </span>
                  {people.length > 1 && (
                    <span className="shrink-0 whitespace-nowrap text-muted">{fill(HEADER_STRINGS[language].walletsMore, { count: people.length - 1 })}</span>
                  )}
                </span>
              );
            })()}
            <Big className={clsx('mt-auto', net >= 0 ? 'text-pos' : 'text-neg')} size={26}><SummaryAmount value={Math.abs(net)} currency={currency} language={language} fitSize={26} /></Big>
            <span className="text-[13px] text-muted">{net >= 0 ? t.owesYou : t.youOwe}</span>
          </>
        )}
      </Tile>
    );
  }

  const rows = people.slice(0, block.size === 'l' ? 7 : 3);
  return (
    <Tile>
      <BlockHead title={t.block_people} right={rows.length ? currency : undefined} className="mb-1" />
      {rows.length === 0 ? (
        <EmptyArt name="settled">{t.allSettled}</EmptyArt>
      ) : (
        <div>
          {rows.map((entry, i) => (
            <ListRow
              key={entry.person.id}
              left={<Avatar name={entry.person.name} color={entry.person.color} image={entry.person.avatar} />}
              title={entry.person.name}
              sub={entry.net >= 0 ? t.owesYou : t.youOwe}
              amount={<SummaryAmount value={Math.abs(entry.net)} currency={currency} language={language} showUnit={false} />}
              amountClassName={entry.net >= 0 ? 'text-pos' : 'text-neg'}
              last={i === rows.length - 1}
              onClick={() => actions.openPerson(entry.person)}
            />
          ))}
        </div>
      )}
    </Tile>
  );
};

// ---------------------------------------------------------------- Event

/** "3–7 Nov" / "3–7. nov": a locale-formatted range instead of joining two dates with "to". */
const eventDates = (start: string | undefined, end: string | undefined, language: HomeData['language']): string => {
  const from = start ? parseLocalDate(start) : null;
  const to = end ? parseLocalDate(end) : null;
  if (!from || Number.isNaN(from.getTime())) return to && !Number.isNaN(to.getTime()) ? formatShortDate(to, language) : '';
  if (!to || Number.isNaN(to.getTime())) return formatShortDate(from, language);
  try {
    return new Intl.DateTimeFormat(getIntlLocale(language), { day: 'numeric', month: 'short' }).formatRange(from, to);
  } catch {
    return `${formatShortDate(from, language)} – ${formatShortDate(to, language)}`;
  }
};

const EventBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, currency, language } = data;
  if (!data.event) {
    return (
      <Tile>
        <Label>{t.block_event}</Label>
        <Illustration name="events" className={clsx('mx-auto shrink-0', block.size === 's' ? '!h-[60px] !w-[76px]' : '!h-[72px] !w-[90px]')} />
        <span className="mt-auto text-[15px] font-semibold">{t.noActiveEvent}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-accent">
          <Plus size={15} aria-hidden="true" />
          {t.startEvent}
        </span>
      </Tile>
    );
  }
  const { event, total, expenseCount } = data.event;
  const dates = eventDates(event.startDate, event.endDate, language);
  return (
    <div
      className={clsx('relative flex h-full w-full flex-col overflow-hidden text-left text-white', block.size === 's' ? 'rounded-[26px] p-4' : 'min-h-[150px] rounded-[26px] p-5')}
      style={{ background: event.imageUrl ? undefined : 'var(--accent-card)' }}
    >
      {event.imageUrl && <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05)_0%,rgba(0,0,0,0.6)_100%)]" />
      <span className="relative self-start rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-semibold backdrop-blur-md">{t.block_event}</span>
      <span className="relative mt-auto truncate text-[19px] font-bold leading-6 tracking-[-0.3px]">{event.name}</span>
      <span className="relative truncate text-[13px] font-medium opacity-85">
        {block.size === 's'
          ? money(total, currency, language)
          : [money(total, currency, language), `${expenseCount}×`, dates].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------- Upcoming

const daysUntil = (due: Date): number => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

const dueLabel = (due: Date, data: HomeData): string => {
  const days = daysUntil(due);
  if (days <= 0) return data.t.today;
  if (days === 1) return data.t.tomorrow;
  return fill(data.t.inDays, { days });
};

const UpcomingBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, language, upcoming } = data;
  const sign = (type: string) => (type === 'income' ? '+' : '−');

  if (block.style === 'next') {
    const next = upcoming[0];
    return (
      <Tile>
        <Label>{t.block_upcoming}</Label>
        {upcoming[1] && (
          // What comes after the next one, in the space under the label.
          <span className="mt-1.5 line-clamp-2 text-[13px] text-muted">
            {fill(HEADER_STRINGS[language].upcomingThen, { name: upcoming[1].recurring.name, when: dueLabel(upcoming[1].due, data) })}
          </span>
        )}
        {next ? (
          <>
            <span className="mt-auto flex items-center gap-2.5">
              <DateChip date={next.due} language={language} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{next.recurring.name}</span>
                <span className="block text-[13px] text-muted">{dueLabel(next.due, data)}</span>
              </span>
            </span>
            <span style={{ containerType: 'inline-size' }} className={clsx('mt-2 text-[17px] font-bold', next.recurring.type === 'income' && 'text-pos')}>
              <SummaryAmount value={next.recurring.amount} currency={next.recurring.currency} language={language} sign={sign(next.recurring.type)} fitSize={17} />
            </span>
          </>
        ) : (
          <EmptyArt name="calendar" stacked>{t.nothingUpcoming}</EmptyArt>
        )}
      </Tile>
    );
  }

  const rows = upcoming.slice(0, block.size === 'l' ? 7 : 3);
  const unit = rows.every(item => item.recurring.currency === rows[0]?.recurring.currency) ? rows[0]?.recurring.currency : undefined;
  return (
    <Tile>
      <BlockHead title={t.block_upcoming} right={unit} className="mb-1" />
      {rows.length === 0 ? (
        <EmptyArt name="calendar">{t.nothingUpcoming}</EmptyArt>
      ) : (
        <div>
          {rows.map((item, i) => (
            <ListRow
              key={item.recurring.id}
              left={<DateChip date={item.due} language={language} />}
              title={item.recurring.name}
              sub={[dueLabel(item.due, data), data.accountName(item.recurring.accountId)].filter(Boolean).join(' · ')}
              amount={<SummaryAmount value={item.recurring.amount} currency={item.recurring.currency} language={language} sign={sign(item.recurring.type)} showUnit={!unit} />}
              amountClassName={item.recurring.type === 'income' ? 'text-pos' : undefined}
              last={i === rows.length - 1}
            />
          ))}
        </div>
      )}
    </Tile>
  );
};

// ---------------------------------------------------------------- Recent

const RecentBlock: React.FC<BlockProps> = ({ block, data, actions }) => {
  const { t, language } = data;
  const rows = data.recent.slice(0, block.size === 'l' ? 6 : 3);
  const unit = rows.every(entry => entry.currency === rows[0]?.currency) ? rows[0]?.currency : undefined;
  return (
    <Tile>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-bold tracking-[-0.3px]">{t.block_recent}{unit && <span className="ml-2 text-[13px] font-medium text-muted">{unit}</span>}</h3>
        <button type="button" onClick={actions.openActivity} className="-my-2.5 -mr-2 flex min-h-10 items-center px-2 text-sm font-semibold text-accent">
          {t.navActivity}
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyArt name="transactions">{t.noTransactions}</EmptyArt>
      ) : (
        <div>
          {rows.map((transaction, i) => {
            const category = data.categoryName(transaction.categoryId);
            const title = localizeTransactionNote(transaction.note?.trim(), language) || category || t.other;
            const income = transaction.type === 'income';
            return (
              <ListRow
                key={transaction.id}
                left={
                  <CategoryGlyph
                    category={data.category(transaction.categoryId)}
                    badge={transaction.currency !== data.currency ? <CurrencyFlag currency={transaction.currency} size={15} /> : undefined}
                  />
                }
                title={title}
                sub={[category !== title ? category : null, data.accountName(transaction.accountId)].filter(Boolean).join(' · ') || formatShortDate(parseLocalDate(transaction.date), language)}
                amount={<SummaryAmount value={transaction.amount} currency={transaction.currency} language={language} sign={income ? '+' : '−'} showUnit={!unit} />}
                amountClassName={income ? 'text-pos' : undefined}
                last={i === rows.length - 1}
                onClick={() => actions.openTransaction(transaction)}
              />
            );
          })}
        </div>
      )}
    </Tile>
  );
};

// ---------------------------------------------------------------- Rates

const RatesBlock: React.FC<BlockProps> = ({ block, data, preview }) => {
  const { t, rates } = data;
  const format = (value: number) => formatNumber(value, { maximumFractionDigits: value >= 10 ? 2 : 4, minimumFractionDigits: value >= 10 ? 2 : 4 });
  const nbsDate = data.ratesListDate ? formatShortDate(parseLocalDate(data.ratesListDate), data.language) : null;
  if (block.style === 'trend') {
    return (
      <Tile>
        <BlockHead title={t.block_rates} right={nbsDate ? `NBS ${nbsDate}` : undefined} />
        <RatesTrend language={data.language} t={t} fallback={data.rsdPerUnit} live={!preview} />
      </Tile>
    );
  }
  if (block.style === 'compact') {
    return (
      <Tile>
        <Label>{t.block_rates}</Label>
        <div className="mt-auto flex flex-col gap-1.5">
          {rates.map(pair => (
            <span key={`${pair.from}-${pair.to}`} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-1.5 font-medium text-muted">
                <CurrencyPair base={pair.from} quote={pair.to} size={16} />
                {pair.from}/{pair.to}
              </span>
              <span className="text-[15px] font-semibold tabular-nums">{format(pair.value)}</span>
            </span>
          ))}
        </div>
      </Tile>
    );
  }
  return (
    <Tile>
      <BlockHead title={t.block_rates} right={nbsDate ? `NBS ${nbsDate}` : undefined} />
      <div className="grid grid-cols-3 gap-2">
        {rates.map(pair => (
          <span key={`${pair.from}-${pair.to}`} className="flex min-w-0 flex-col rounded-2xl bg-chip px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
              <CurrencyFlag currency={pair.from} size={16} />1 {pair.from}
            </span>
            <span className="mt-1 truncate text-[17px] font-bold tabular-nums">{format(pair.value)}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <CurrencyFlag currency={pair.to} size={12} />
              {pair.to}
            </span>
          </span>
        ))}
      </div>
    </Tile>
  );
};

// ---------------------------------------------------------------- Quick add

const QuickAddBlock: React.FC<BlockProps> = ({ data, actions }) => {
  const { t, language } = data;
  return (
    <Tile>
      <BlockHead title={t.block_quickadd} right={data.templates.length > 0 ? t.again : undefined} />
      <div className="flex flex-wrap gap-2">
        {data.templates.map(template => (
          <button
            key={template.id}
            type="button"
            onClick={() => actions.useTemplate(template.id)}
            className="flex h-10 max-w-full items-center gap-2 rounded-full bg-chip pl-[7px] pr-3.5 text-sm font-semibold"
          >
            <CategoryGlyph category={data.category(template.categoryId)} size={26} className="!rounded-full" />
            <span className="truncate">{template.name}</span>
            {template.amount != null && <span className="shrink-0 font-medium text-muted"><SummaryAmount value={template.amount} currency={template.currency} language={language} /></span>}
          </button>
        ))}
        <button
          type="button"
          onClick={actions.addEntry}
          className="flex h-10 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-sm font-semibold text-accent"
        >
          <Plus size={16} aria-hidden="true" />
          {t.addEntry}
        </button>
      </div>
      {data.templates.length === 0 && <span className="mt-2 text-[13px] text-muted">{t.noTemplatesYet}</span>}
    </Tile>
  );
};

const BLOCK_COMPONENTS: Record<HomeBlockType, React.FC<BlockProps>> = {
  budget: BudgetBlock,
  networth: NetWorthBlock,
  categories: CategoriesBlock,
  daily: DailyBlock,
  wallets: WalletsBlock,
  people: PeopleBlock,
  event: EventBlock,
  upcoming: UpcomingBlock,
  recent: RecentBlock,
  rates: RatesBlock,
  quickadd: QuickAddBlock,
};

export const BlockContent: React.FC<BlockProps> = props => {
  const Component = BLOCK_COMPONENTS[props.block.type];
  return <Component {...props} />;
};
