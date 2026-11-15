import React from 'react';
import { Transaction, Category, Currency, ExchangeRates, Account, RecurringTransaction, Event } from '../../types';
import { isTransferTransaction } from '../../domain/money';
import { formatDate, getAppLanguage, getIntlLocale, type AppLanguage } from '../../utils/locale';
import { Segmented } from '../ui/Segmented';

// ─── Public Props (same API as original Stats component) ────────────────────

export interface StatsProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  recurringTransactions: RecurringTransaction[];
  baseCurrency: Currency;
  rates: ExchangeRates;
  language: 'en' | 'sr';
  totalExpense: number;
  /** Lets the anomaly explanations mention trips and events of the period. */
  events?: Event[];
}

// ─── Internal Time-Frame Types ──────────────────────────────────────────────

export type TrendTimeFrame = 'daily' | 'weekly' | 'monthly';
export type ComparisonTimeFrame = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type CategoryTimeFrame = 'weekly' | 'monthly' | 'yearly';
export type NetWorthTimeFrame = 'weekly' | 'monthly' | 'quarterly';

// ─── Chart Data Interfaces ──────────────────────────────────────────────────

export interface ChartDataItem {
  date: string;
  expense?: number;
  income?: number;
  [key: string]: unknown;
}

export interface CategoryDataItem {
  name: string;
  value: number;
  color: string;
}

export interface VolatilityDataItem {
  id: string;
  name: string;
  value: number;
  color: string;
}

export interface PaidForOthersResult {
  data: CategoryDataItem[];
  total: number;
}

export interface AccountCashflowItem {
  name: string;
  inflow: number;
  outflow: number;
  color: string;
}

export interface SavingsRateItem {
  date: string;
  income: number;
  expense: number;
  rate: number;
  label: string;
}

export interface NetWorthItem {
  date: string;
  label: string;
  cash: number;
  receivables: number;
  payables: number;
  netWorth: number;
}

// ─── Chart Color / Style Helpers ────────────────────────────────────────────

export const cssColor = (token: string, alpha?: number) =>
  alpha === undefined ? `rgb(var(${token}))` : `rgb(var(${token}) / ${alpha})`;

/** Paper token with a fallback for the older themes, optionally faded toward transparent. */
const paperColor = (token: string, fallbackRgbToken: string, alpha?: number) => {
  const base = `var(${token}, rgb(var(${fallbackRgbToken})))`;
  return alpha === undefined ? base : `color-mix(in oklab, ${base} ${Math.round(alpha * 100)}%, transparent)`;
};

const accentColor = (alpha?: number) => (
  alpha === undefined
    ? 'rgb(var(--accent-rgb, var(--md-sys-color-tertiary)))'
    : `rgb(var(--accent-rgb, var(--md-sys-color-tertiary)) / ${alpha})`
);

export const buildChartColors = () => ({
  income: paperColor('--paper-pos', '--md-sys-color-primary'),
  incomeSoft: paperColor('--paper-pos', '--md-sys-color-primary', 0.55),
  expense: paperColor('--paper-neg', '--md-sys-color-secondary'),
  expenseSoft: paperColor('--paper-neg', '--md-sys-color-secondary', 0.55),
  accent: accentColor(),
  accentSoft: accentColor(0.55),
  axis: cssColor('--md-sys-color-on-surface-variant', 0.85),
  axisSoft: cssColor('--md-sys-color-on-surface-variant', 0.6),
  grid: cssColor('--md-sys-color-outline-variant', 0.45),
  gridStrong: cssColor('--md-sys-color-outline', 0.6),
  surface: cssColor('--md-sys-color-surface'),
  surfaceHigh: cssColor('--md-sys-color-surface-container-high'),
  surfaceHighest: cssColor('--md-sys-color-surface-container-highest'),
  tooltipBorder: cssColor('--md-sys-color-outline-variant', 0.7),
  netLine: cssColor('--md-sys-color-on-surface')
});

export type ChartColors = ReturnType<typeof buildChartColors>;

export const buildTooltipStyle = (chartColors: ChartColors) => ({
  backgroundColor: chartColors.surfaceHigh,
  borderRadius: '14px',
  border: `1px solid ${chartColors.tooltipBorder}`,
  boxShadow: '0 18px 30px rgb(0 0 0 / 0.2)',
  padding: '10px 12px'
});

export const buildTooltipItemStyle = () => ({ color: cssColor('--md-sys-color-on-surface') });

export const buildTooltipLabelStyle = (chartColors: ChartColors) => ({ color: chartColors.axisSoft });

export const buildAxisProps = (chartColors: ChartColors) => ({
  stroke: chartColors.axis,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
  tickMargin: 8
});

// ─── Shared Helper Functions ────────────────────────────────────────────────

export const isTransfer = (tx: Transaction) => isTransferTransaction(tx);

/** Axis ticks: "266.8K" in English, "266,8 hilj." in Serbian (Intl compact, app language). */
export const formatCompactNumber = (value: number, language: AppLanguage = getAppLanguage()) => {
  const abs = Math.abs(value);
  try {
    return new Intl.NumberFormat(getIntlLocale(language), {
      notation: abs >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: abs >= 1000 ? 1 : 0,
    }).format(value);
  } catch {
    return abs >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
  }
};

/** "Q4 '26" in English, "4. kv. '26" in Serbian. */
export const formatQuarterShort = (year: number | string, quarter: number | string, language: AppLanguage = getAppLanguage()) =>
  language === 'sr' ? `${quarter}. kv. '${String(year).slice(2)}` : `Q${quarter} '${String(year).slice(2)}`;

// Buckets follow the user's local calendar (a purchase at 00:30 on the 1st
// belongs to the new month even if it is still the previous month in UTC).
const pad2 = (value: number) => String(value).padStart(2, '0');

export const getMonthKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const getDayKey = (date: Date) => `${getMonthKey(date)}-${pad2(date.getDate())}`;

export const getMonthRange = (start: Date, end: Date) => {
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= endMonth) {
    months.push(getMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

export const getWeekStart = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() - (dayNum - 1));
  return d;
};

export const getQuarterStart = (date: Date) => {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1);
};

export const getGroupKey = (dateStr: string, tf: string): string => {
  const date = new Date(dateStr);
  if (tf === 'daily') {
    return getDayKey(date); // YYYY-MM-DD (local)
  } else if (tf === 'weekly') {
    // ISO week of the local calendar day, computed on a UTC copy to avoid DST.
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  } else if (tf === 'monthly') {
    return getMonthKey(date); // YYYY-MM (local)
  } else if (tf === 'quarterly') {
    const month = date.getMonth();
    const quarter = Math.floor(month / 3) + 1;
    return `${date.getFullYear()}-Q${quarter}`;
  } else {
    return `${date.getFullYear()}`; // YYYY
  }
};

const parseLocalKey = (dateKey: string) => {
  const [year, month, day = 1] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatLabel = (dateKey: string, tf: string, language: 'en' | 'sr') => {
  if (tf === 'daily') return formatDate(parseLocalKey(dateKey), { month: 'short', day: 'numeric' }, language);
  if (tf === 'weekly') {
    // "2026-W32" reads as the Monday that starts the ISO week ("Aug 3").
    const match = /^(\d{4})-W(\d{1,2})$/.exec(dateKey);
    if (!match) return dateKey;
    const jan4 = new Date(Date.UTC(Number(match[1]), 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (Number(match[2]) - 1) * 7);
    return formatDate(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()), { month: 'short', day: 'numeric' }, language);
  }
  if (tf === 'monthly') return formatDate(parseLocalKey(dateKey), { month: 'short', year: '2-digit' }, language);
  if (tf === 'quarterly') {
    const match = /^(\d{4})-Q([1-4])$/.exec(dateKey);
    return match ? formatQuarterShort(match[1], match[2], language) : dateKey;
  }
  if (tf === 'yearly') return dateKey;
  return dateKey;
};

export const getCutoffDate = (tf: string, now: Date) => {
  const cutoff = new Date();
  if (tf === 'daily') cutoff.setDate(now.getDate() - 30);
  else if (tf === 'weekly') cutoff.setDate(now.getDate() - (24 * 7)); // Last 24 weeks
  else if (tf === 'monthly') cutoff.setMonth(now.getMonth() - 24); // Last 24 months
  else if (tf === 'quarterly') cutoff.setMonth(now.getMonth() - (12 * 3)); // Last 3 years
  else cutoff.setFullYear(now.getFullYear() - 5);
  return cutoff;
};

export const getAlignedStartDate = (tf: NetWorthTimeFrame, date: Date) => {
  if (tf === 'weekly') return getWeekStart(date);
  if (tf === 'monthly') return new Date(date.getFullYear(), date.getMonth(), 1);
  return getQuarterStart(date);
};

export const getTimeBuckets = (tf: NetWorthTimeFrame, startDate: Date, endDate: Date, language: 'en' | 'sr') => {
  const buckets: { key: string; label: string }[] = [];

  if (tf === 'weekly') {
    const cursor = getWeekStart(startDate);
    const end = getWeekStart(endDate);
    while (cursor <= end) {
      const key = getGroupKey(cursor.toISOString(), 'weekly');
      buckets.push({ key, label: formatLabel(key, 'weekly', language) });
      cursor.setDate(cursor.getDate() + 7);
    }
    return buckets;
  }

  if (tf === 'monthly') {
    const keys = getMonthRange(startDate, endDate);
    keys.forEach(key => buckets.push({ key, label: formatLabel(key, 'monthly', language) }));
    return buckets;
  }

  const cursor = getQuarterStart(startDate);
  const end = getQuarterStart(endDate);
  while (cursor <= end) {
    const key = getGroupKey(cursor.toISOString(), 'quarterly');
    buckets.push({ key, label: formatLabel(key, 'quarterly', language) });
    cursor.setMonth(cursor.getMonth() + 3);
  }
  return buckets;
};

// ─── Shared UI Components ───────────────────────────────────────────────────

const roundedRectPath = (
  x: number,
  y: number,
  width: number,
  height: number,
  tl: number,
  tr: number,
  br: number,
  bl: number
) => {
  const w = Math.abs(width);
  const h = Math.abs(height);
  const x0 = width < 0 ? x + width : x;
  const y0 = height < 0 ? y + height : y;
  const rTL = Math.max(0, Math.min(tl, w / 2, h / 2));
  const rTR = Math.max(0, Math.min(tr, w / 2, h / 2));
  const rBR = Math.max(0, Math.min(br, w / 2, h / 2));
  const rBL = Math.max(0, Math.min(bl, w / 2, h / 2));

  return [
    `M ${x0 + rTL} ${y0}`,
    `H ${x0 + w - rTR}`,
    `A ${rTR} ${rTR} 0 0 1 ${x0 + w} ${y0 + rTR}`,
    `V ${y0 + h - rBR}`,
    `A ${rBR} ${rBR} 0 0 1 ${x0 + w - rBR} ${y0 + h}`,
    `H ${x0 + rBL}`,
    `A ${rBL} ${rBL} 0 0 1 ${x0} ${y0 + h - rBL}`,
    `V ${y0 + rTL}`,
    `A ${rTL} ${rTL} 0 0 1 ${x0 + rTL} ${y0}`,
    'Z'
  ].join(' ');
};

export const CashflowBarShape: React.FC<{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number | number[];
  fill?: string;
}> = ({ x = 0, y = 0, width = 0, height = 0, value = 0, fill = '#000' }) => {
  if (!width || !height) return null;
  const rawValue = Array.isArray(value) ? value[1] : value;
  const isNegative = rawValue < 0;
  const radius = Math.min(12, Math.abs(width) / 2, Math.abs(height) / 2);
  const path = roundedRectPath(
    x,
    y,
    width,
    height,
    isNegative ? 0 : radius,
    isNegative ? 0 : radius,
    isNegative ? radius : 0,
    isNegative ? radius : 0
  );
  return <path d={path} fill={fill} />;
};

/** Paper card used by every chart block. */
export const CHART_CARD = 'paper-tile min-w-0 p-4 sm:p-5';

/** BlockHead-style heading row with an optional subtitle and a control on the right. */
export const ChartHead: React.FC<{ title: string; subtitle?: React.ReactNode; children?: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
    <div className="min-w-0">
      <h3 className="text-[17px] font-bold tracking-[-0.3px]">{title}</h3>
      {subtitle != null && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
    </div>
    {children}
  </div>
);

/** Time-frame switch for chart blocks; full width on a phone, compact beside the title from `sm`. */
export function ChartToggle<T extends string>({ options, value, onChange, ariaLabel }: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <Segmented<T>
      size="sm"
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
      options={[...options]}
      className="scrollbar-none w-full overflow-x-auto sm:w-auto"
    />
  );
}

export const ChartEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex h-full min-h-[120px] items-center justify-center text-center text-[14px] text-muted">{children}</p>
);

export const ChartLegend: React.FC<{ items: Array<{ label: string; color: string; gradient?: string; line?: boolean }> }> = ({ items }) => (
  <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-muted">
    {items.map((item) => (
      <div key={item.label} className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={item.line ? "h-[3px] w-4 rounded-full" : "h-2.5 w-2.5 rounded-full"}
          style={{ background: item.gradient ?? item.color }}
        />
        <span>{item.label}</span>
      </div>
    ))}
  </div>
);
