import React from 'react';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import type { HomeBlock, HomeBlockType } from '../../types';
import { topCategories, parseLocalDate } from '../../domain/home';
import { readableTextOn, squarify } from '../../domain/treemap';
import { formatNumber, formatShortDate, formatMonthYear, getIntlLocale } from '../../utils/locale';
import type { HomeActions, HomeData } from './useHomeData';
import { openRates } from '../rates/ratesBus';
import { RatesTrend } from '../rates/RatesTrend';
import { Avatar, Big, BlockHead, DateChip, Empty, Label, ListRow, Ring, compactMoney, fill, fitFont, money, signedMoney } from './parts';

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
          <Ring ratio={progress.spentRatio} radius={20} stroke={7} color={over ? 'var(--paper-neg)' : undefined} />
        </div>
        <Big className={clsx('mt-auto', over && 'text-neg')}>{money(Math.abs(progress.left), currency, language)}</Big>
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
            return (
              <div key={row.categoryId} className="flex flex-col gap-[5px]">
                <span className="flex justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className={clsx('shrink-0', over ? 'font-bold text-neg' : 'font-medium text-muted')}>
                    {over
                      ? fill(t.amountOver, { amount: money(row.over, currency, language) })
                      : fill(t.amountLeft, { amount: money(row.left, currency, language) })}
                  </span>
                </span>
                <span className="block h-1.5 rounded-full bg-chip">
                  <span
                    className="block h-1.5 rounded-full"
                    style={{ width: `${Math.min(100, (row.spent / row.limit) * 100).toFixed(0)}%`, background: over ? 'var(--paper-neg)' : row.color }}
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

const splitCents = (value: string): [string, string] => {
  const match = /^(.*?)([.,]\d{2})(\D*)$/.exec(value);
  return match ? [match[1], match[2] + match[3]] : [value, ''];
};

const NetWorthBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, currency, language, summary } = data;
  const change = signedMoney(summary.netChange, currency, language);
  const spentRatio = summary.income > 0 ? summary.spent / summary.income : summary.spent > 0 ? 1 : 0;

  if (block.style === 'small') {
    return (
      <Tile>
        <Label>{t.block_networth}</Label>
        <Big className="mt-auto" size={26}>{money(data.netWorth, currency, language)}</Big>
        <span className={clsx('text-[13px] font-semibold', summary.netChange >= 0 ? 'text-pos' : 'text-neg')}>{change}</span>
        <span className="text-[12px] text-muted">{monthLabel(data)}</span>
      </Tile>
    );
  }

  const [whole, cents] = splitCents(money(data.netWorth, currency, language, true));
  const accent = block.style === 'card';
  const stats = [
    [t.inShort, summary.income],
    [t.spent, summary.spent],
    [t.leftShort, summary.left],
  ] as const;

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
      <span className={clsx('relative text-sm font-medium', accent ? 'opacity-80' : 'text-muted')}>{t.block_networth}</span>
      <span className="relative mt-0.5 block min-w-0" style={{ containerType: 'inline-size' }}>
        <span className="block truncate font-bold leading-[50px] tracking-[-0.04em]" style={{ fontSize: fitFont(46, `${whole}${cents}`, 0.62) }}>
          {whole}
          <span className="text-[0.57em] opacity-60">{cents}</span>
        </span>
      </span>
      <span className={clsx('relative mt-1 text-[13px] font-semibold', !accent && (summary.netChange >= 0 ? 'text-pos' : 'text-neg'))}>
        {change}{' '}
        <span className={clsx('font-medium', accent ? 'opacity-75' : 'text-muted')}>{monthLabel(data)}</span>
      </span>
      <div className="relative mt-[18px] grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <span key={label} className="flex min-w-0 flex-col gap-px">
            <span className={clsx('text-[12px]', accent ? 'opacity-75' : 'text-muted')}>{label}</span>
            <span className="truncate text-[17px] font-bold">{compactMoney(value, currency, language)}</span>
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
              <span className="shrink-0 font-semibold">{money(wallet.balance, wallet.account.currency, language)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Categories

const TREEMAP_WIDTH = 326;

const Treemap: React.FC<{ data: HomeData; height: number; max: number }> = ({ data, height, max }) => {
  const list = topCategories(data.summary.byCategory, max, data.t.other);
  const rects = squarify(list.map(entry => entry.amount), TREEMAP_WIDTH, height);
  const total = data.summary.spent;
  return (
    <div role="list" className="relative w-full shrink-0" style={{ height }}>
      {rects.map(rect => {
        const entry = list[rect.index];
        const color = readableTextOn(entry.color);
        const showLabel = rect.w > 52 && rect.h > 34;
        const showAmount = rect.w > 52 && rect.h > 52;
        return (
          <div
            key={entry.categoryId}
            role="listitem"
            aria-label={`${entry.name}: ${money(entry.amount, data.currency, data.language)}`}
            className="absolute p-[2px]"
            style={{
              left: `${(rect.x / TREEMAP_WIDTH) * 100}%`,
              top: `${(rect.y / height) * 100}%`,
              width: `${(rect.w / TREEMAP_WIDTH) * 100}%`,
              height: `${(rect.h / height) * 100}%`,
            }}
          >
            <div className="flex h-full w-full flex-col justify-between overflow-hidden rounded-[10px] p-2" style={{ background: entry.color, color }}>
              {showLabel && <span className="truncate text-[13px] font-semibold leading-4">{entry.name}</span>}
              {showAmount && (
                <span className="truncate text-[12px] font-medium leading-4 opacity-85">
                  {money(entry.amount, data.currency, data.language)} · {formatNumber(Math.round((entry.amount / total) * 100))}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
          <span className="mt-auto text-[13px] text-muted">{t.noSpendingYet}</span>
        )}
      </Tile>
    );
  }

  const right = empty ? undefined : money(summary.spent, currency, language);
  if (empty) {
    return (
      <Tile>
        <BlockHead title={t.block_categories} />
        <Empty>{t.noSpendingYet}</Empty>
      </Tile>
    );
  }

  if (block.style === 'bars') {
    const list = topCategories(summary.byCategory, block.size === 'l' ? 10 : 5, t.other);
    const max = list.reduce((m, entry) => Math.max(m, entry.amount), 0);
    return (
      <Tile>
        <BlockHead title={t.block_categories} right={right} />
        <div className="flex flex-col gap-[9px]">
          {list.map(entry => (
            <div key={entry.categoryId} className="grid grid-cols-[84px_1fr_auto] items-center gap-2.5 text-[13px]">
              <span className="truncate font-medium text-muted">{entry.name}</span>
              <span className="h-3.5 rounded-full bg-chip">
                <span className="block h-3.5 rounded-full" style={{ width: `${((entry.amount / max) * 100).toFixed(1)}%`, background: entry.color }} />
              </span>
              <span className="text-right font-semibold">{money(entry.amount, currency, language)}</span>
            </div>
          ))}
        </div>
      </Tile>
    );
  }

  return (
    <Tile>
      <BlockHead title={t.block_categories} right={right} />
      <Treemap data={data} height={block.size === 'l' ? 330 : 150} max={block.size === 'l' ? 9 : 6} />
    </Tile>
  );
};

// ---------------------------------------------------------------- Day by day

const weekdayInitials = (language: HomeData['language']): string[] => {
  const formatter = new Intl.DateTimeFormat(getIntlLocale(language), { weekday: 'narrow' });
  // 2026-11-02 is a Monday.
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2026, 10, 2 + i)));
};

const DailyBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, summary, currency, language, month } = data;
  const days = summary.byDay;
  const elapsed = summary.todayIndex;
  const max = Math.max(1, ...days);

  if (block.style === 'week') {
    const end = Math.max(elapsed, 1);
    const start = Math.max(0, end - 7);
    const week = days.slice(start, end);
    const weekMax = Math.max(1, ...week);
    const last = days[end - 1] ?? 0;
    return (
      <Tile>
        <Label>{data.isCurrentMonth ? t.today : formatShortDate(new Date(month.year, month.month, end), language)}</Label>
        <Big className="mt-1" size={26}>{money(last, currency, language)}</Big>
        <div className="mt-auto flex h-14 items-end gap-1" aria-hidden="true">
          {week.map((value, i) => (
            <span
              key={i}
              className={clsx('flex-1 rounded-[5px]', i === week.length - 1 ? 'bg-accent' : 'bg-accent/35')}
              style={{ height: `${Math.max(6, (value / weekMax) * 100)}%` }}
            />
          ))}
        </div>
      </Tile>
    );
  }

  const average = elapsed > 0 ? summary.spent / elapsed : 0;
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
  return (
    <Tile>
      <BlockHead title={t.block_daily} right={right} />
      <div role="img" aria-label={t.block_daily} className="flex items-end gap-[2px]" style={{ height }}>
        {days.map((value, i) => {
          const past = i < elapsed;
          return (
            <span
              key={i}
              className={clsx('min-w-0 flex-1 rounded-t-[3px] rounded-b-[1px]', past ? (i === elapsed - 1 && data.isCurrentMonth ? 'bg-on-surface' : 'bg-accent') : 'bg-chip')}
              style={{ height: past ? `${Math.max(2, (value / max) * 100)}%` : '4%' }}
            />
          );
        })}
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
        <Empty>{t.noWalletsYet}</Empty>
      </Tile>
    );
  }

  if (block.style === 'cards') {
    return (
      <Tile>
        <BlockHead title={t.block_wallets} right={money(total, currency, language)} />
        <div className="grid grid-cols-2 gap-2">
          {wallets.slice(0, 4).map(wallet => (
            <span key={wallet.account.id} className="flex min-w-0 flex-col gap-1 rounded-[18px] bg-chip p-3">
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-muted">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: wallet.account.color }} aria-hidden="true" />
                <span className="truncate">{wallet.account.name}</span>
              </span>
              <span className="truncate text-[17px] font-bold">{money(wallet.balance, wallet.account.currency, language)}</span>
            </span>
          ))}
        </div>
      </Tile>
    );
  }

  const rows = wallets.slice(0, block.size === 'l' ? 8 : 3);
  return (
    <Tile>
      <BlockHead title={t.block_wallets} right={money(total, currency, language)} className="mb-1" />
      <div>
        {rows.map((wallet, i) => (
          <ListRow
            key={wallet.account.id}
            left={<Avatar name={wallet.account.name} color={wallet.account.color} size={36} />}
            title={wallet.account.name}
            sub={wallet.account.currency}
            amount={money(wallet.balance, wallet.account.currency, language)}
            amountClassName={wallet.balance < 0 ? 'text-neg' : undefined}
            last={i === rows.length - 1}
          />
        ))}
      </div>
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
            <Big className={clsx('mt-auto', net >= 0 ? 'text-pos' : 'text-neg')} size={26}>{money(Math.abs(net), currency, language)}</Big>
            <span className="text-[13px] text-muted">{net >= 0 ? t.owesYou : t.youOwe}</span>
          </>
        )}
      </Tile>
    );
  }

  const rows = people.slice(0, block.size === 'l' ? 7 : 3);
  return (
    <Tile>
      <BlockHead title={t.block_people} className="mb-1" />
      {rows.length === 0 ? (
        <Empty>{t.allSettled}</Empty>
      ) : (
        <div>
          {rows.map((entry, i) => (
            <ListRow
              key={entry.person.id}
              left={<Avatar name={entry.person.name} color={entry.person.color} image={entry.person.avatar} />}
              title={entry.person.name}
              sub={entry.net >= 0 ? t.owesYou : t.youOwe}
              amount={money(Math.abs(entry.net), currency, language)}
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

const EventBlock: React.FC<BlockProps> = ({ block, data }) => {
  const { t, currency, language } = data;
  if (!data.event) {
    return (
      <Tile>
        <Label>{t.block_event}</Label>
        <span className="mt-auto text-[15px] font-semibold">{t.noActiveEvent}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-accent">
          <Plus size={15} aria-hidden="true" />
          {t.startEvent}
        </span>
      </Tile>
    );
  }
  const { event, total, expenseCount } = data.event;
  const dates = [event.startDate, event.endDate].filter(Boolean).map(value => formatShortDate(parseLocalDate(value!), language));
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
          : [money(total, currency, language), `${expenseCount}×`, dates.join(' to ')].filter(Boolean).join(' · ')}
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
        {next ? (
          <>
            <span className="mt-auto flex items-center gap-2.5">
              <DateChip date={next.due} language={language} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{next.recurring.name}</span>
                <span className="block text-[13px] text-muted">{dueLabel(next.due, data)}</span>
              </span>
            </span>
            <span className={clsx('mt-2 text-[17px] font-bold', next.recurring.type === 'income' && 'text-pos')}>
              {sign(next.recurring.type)}{money(next.recurring.amount, next.recurring.currency, language, true)}
            </span>
          </>
        ) : (
          <span className="mt-auto text-[13px] text-muted">{t.nothingUpcoming}</span>
        )}
      </Tile>
    );
  }

  const rows = upcoming.slice(0, block.size === 'l' ? 7 : 3);
  return (
    <Tile>
      <BlockHead title={t.block_upcoming} className="mb-1" />
      {rows.length === 0 ? (
        <Empty>{t.nothingUpcoming}</Empty>
      ) : (
        <div>
          {rows.map((item, i) => (
            <ListRow
              key={item.recurring.id}
              left={<DateChip date={item.due} language={language} />}
              title={item.recurring.name}
              sub={[dueLabel(item.due, data), data.accountName(item.recurring.accountId)].filter(Boolean).join(' · ')}
              amount={`${sign(item.recurring.type)}${money(item.recurring.amount, item.recurring.currency, language, true)}`}
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
  return (
    <Tile>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-bold tracking-[-0.3px]">{t.block_recent}</h3>
        <button type="button" onClick={actions.openActivity} className="text-sm font-semibold text-accent">
          {t.navActivity}
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty>{t.noTransactions}</Empty>
      ) : (
        <div>
          {rows.map((transaction, i) => {
            const category = data.categoryName(transaction.categoryId);
            const title = transaction.note?.trim() || category || t.other;
            const income = transaction.type === 'income';
            return (
              <ListRow
                key={transaction.id}
                left={<Avatar name={title} color={data.categoryColor(transaction.categoryId)} />}
                title={title}
                sub={[category !== title ? category : null, data.accountName(transaction.accountId)].filter(Boolean).join(' · ') || formatShortDate(parseLocalDate(transaction.date), language)}
                amount={`${income ? '+' : '−'}${money(transaction.amount, transaction.currency, language, true)}`}
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
              <span className="font-medium text-muted">{pair.from}/{pair.to}</span>
              <span className="text-[15px] font-semibold">{format(pair.value)}</span>
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
            <span className="text-[12px] font-medium text-muted">1 {pair.from}</span>
            <span className="truncate text-[17px] font-bold">{format(pair.value)}</span>
            <span className="text-[12px] text-muted">{pair.to}</span>
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
            className="flex h-10 max-w-full items-center gap-2 rounded-full bg-chip pl-3 pr-3.5 text-sm font-semibold"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: data.categoryColor(template.categoryId) }} aria-hidden="true" />
            <span className="truncate">{template.name}</span>
            {template.amount != null && <span className="shrink-0 font-medium text-muted">{money(template.amount, template.currency, language, true)}</span>}
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
