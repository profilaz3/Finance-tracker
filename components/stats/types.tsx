import React from 'react';
import { Transaction, Category, Currency, ExchangeRates, Account, RecurringTransaction } from '../../types';
import clsx from 'clsx';
import { isTransferTransaction } from '../../domain/money';

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

export const buildChartColors = () => ({
  income: cssColor('--md-sys-color-primary'),
  incomeSoft: cssColor('--md-sys-color-primary', 0.55),
  expense: cssColor('--md-sys-color-secondary'),
  expenseSoft: cssColor('--md-sys-color-secondary', 0.55),
  accent: cssColor('--md-sys-color-tertiary'),
  accentSoft: cssColor('--md-sys-color-tertiary', 0.55),
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

export const formatCompactNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
};

export const getMonthKey = (date: Date) => date.toISOString().slice(0, 7);

export const getMonthRange = (start: Date, end: Date) => {
  const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months: string[] = [];
  const cursor = new Date(startMonth);

  while (cursor <= endMonth) {
    months.push(getMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
};

export const getWeekStart = (date: Date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dayNum - 1));
  return d;
};

export const getQuarterStart = (date: Date) => {
  const month = date.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
};

export const getGroupKey = (dateStr: string, tf: string): string => {
  const date = new Date(dateStr);
  if (tf === 'daily') {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } else if (tf === 'weekly') {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  } else if (tf === 'monthly') {
    return date.toISOString().slice(0, 7); // YYYY-MM
  } else if (tf === 'quarterly') {
    const month = date.getMonth();
    const quarter = Math.floor(month / 3) + 1;
    return `${date.getFullYear()}-Q${quarter}`;
  } else {
    return `${date.getFullYear()}`; // YYYY
  }
};

export const formatLabel = (dateKey: string, tf: string, language: 'en' | 'sr') => {
  if (tf === 'daily') return new Date(dateKey).toLocaleDateString(language === 'sr' ? 'sr-RS' : 'en-US', { month: 'short', day: 'numeric' });
  if (tf === 'weekly') return dateKey; // Keep Wxx format or improve
  if (tf === 'monthly') return new Date(dateKey + '-01').toLocaleDateString(language === 'sr' ? 'sr-RS' : 'en-US', { month: 'short', year: '2-digit' });
  if (tf === 'quarterly') return dateKey;
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
  if (tf === 'monthly') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
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
      cursor.setUTCDate(cursor.getUTCDate() + 7);
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
    cursor.setUTCMonth(cursor.getUTCMonth() + 3);
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

export const ToggleButton: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button
    onClick={onClick}
    className={clsx(
      "px-3 py-1 rounded-full text-xs font-medium transition-all",
      active
        ? "bg-secondary-container text-on-secondary-container shadow-sm"
        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
    )}
  >
    {label}
  </button>
);

export const ChartLegend: React.FC<{ items: Array<{ label: string; color: string; gradient?: string; line?: boolean }> }> = ({ items }) => (
  <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-on-surface-variant">
    {items.map((item) => (
      <div key={item.label} className="flex items-center gap-2">
        <span
          className={item.line ? "h-[3px] w-4 rounded-full" : "h-2.5 w-2.5 rounded-full"}
          style={{ background: item.gradient ?? item.color }}
        />
        <span>{item.label}</span>
      </div>
    ))}
  </div>
);
