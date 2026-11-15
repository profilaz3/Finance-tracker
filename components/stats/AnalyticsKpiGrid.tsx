import React from 'react';
import type { AnalyticsDeltaDirection, AnalyticsStudioSummary } from '../../utils/analyticsSelectors';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, Banknote, PiggyBank, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Currency } from '../../types';
import { formatPercent, type AppLanguage } from '../../utils/locale';
import { Big, compactMoney } from '../home/parts';
import { DeltaPill } from '../ui/primitives';
import { IconTile } from '../ui/IconTile';
import { Sparkline } from '../ui/Sparkline';

type AnalyticsKpiMetric = 'income' | 'expense' | 'net' | 'savingsRate';
type DeltaTone = 'improved' | 'worsened' | 'neutral';

/** Values of each metric for the last few periods, oldest first, current period last. */
export interface AnalyticsKpiHistory {
  income: number[];
  expense: number[];
  net: number[];
  savingsRate: number[];
}

export interface AnalyticsKpiGridProps {
  summary: AnalyticsStudioSummary;
  baseCurrency: Currency;
  language: AppLanguage;
  history?: AnalyticsKpiHistory;
  labels: {
    income: string;
    expense: string;
    net: string;
    savingsRate: string;
    projectedNet: string;
    vsPreviousPeriod: string;
    noComparison: string;
    lowConfidenceForecast: string;
    normalConfidenceForecast: string;
    improved: string;
    worsened: string;
    /** One line under the grid when no metric has a previous period yet. */
    firstPeriod?: string;
  };
}

const getDeltaTone = (metric: AnalyticsKpiMetric, direction: AnalyticsDeltaDirection): DeltaTone => {
  if (direction === 'flat') return 'neutral';

  const decreaseIsImproved = metric === 'expense';
  if (decreaseIsImproved) {
    return direction === 'down' ? 'improved' : 'worsened';
  }

  return direction === 'up' ? 'improved' : 'worsened';
};

const formatDelta = (
  metric: AnalyticsKpiMetric,
  delta: AnalyticsStudioSummary['deltas']['income'],
  labels: AnalyticsKpiGridProps['labels'],
) => {
  if (delta.percentage === null) return labels.noComparison;

  const tone = getDeltaTone(metric, delta.direction);
  const toneLabel = tone === 'neutral' ? '' : ` · ${labels[tone]}`;

  return `${delta.absolute >= 0 ? '+' : ''}${formatPercent(delta.percentage, 1)} ${labels.vsPreviousPeriod}${toneLabel}`;
};

const formatForecastConfidence = (
  confidence: AnalyticsStudioSummary['forecast']['confidence'],
  labels: AnalyticsKpiGridProps['labels'],
) => (
  confidence === 'low' ? labels.lowConfidenceForecast : labels.normalConfidenceForecast
);

/** Pill for a comparable delta; null when there is nothing to compare with. */
const deltaPill = (
  metric: AnalyticsKpiMetric,
  delta: AnalyticsStudioSummary['deltas']['income'],
  labels: AnalyticsKpiGridProps['labels'],
) => {
  if (delta.percentage === null) return null;
  const tone = getDeltaTone(metric, delta.direction);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1" aria-label={formatDelta(metric, delta, labels)}>
      <DeltaPill direction={delta.direction} tone={tone === 'improved' ? 'pos' : tone === 'worsened' ? 'neg' : 'neutral'}>
        {formatPercent(Math.abs(delta.percentage), 1)}
      </DeltaPill>
      <span aria-hidden="true" className="truncate text-[12px] text-muted">{labels.vsPreviousPeriod}</span>
    </span>
  );
};

const signTone = (amount: number) => (amount > 0 ? 'text-pos' : amount < 0 ? 'text-neg' : undefined);

const POS = 'var(--paper-pos)';
const NEG = 'var(--paper-neg)';
const ACCENT = 'rgb(var(--accent-rgb))';

interface KpiCard {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  value: string;
  valueTone?: string;
  caption: string;
  pill: React.ReactNode;
  trend?: number[];
  comparable: boolean;
}

export const AnalyticsKpiGrid: React.FC<AnalyticsKpiGridProps> = ({ summary, baseCurrency, language, labels, history }) => {
  const net = summary.totals.current.net;
  const cards: KpiCard[] = [
    {
      key: 'income',
      label: labels.income,
      icon: ArrowDownLeft,
      color: POS,
      value: compactMoney(summary.totals.current.income, baseCurrency, language),
      caption: formatDelta('income', summary.deltas.income, labels),
      pill: deltaPill('income', summary.deltas.income, labels),
      trend: history?.income,
      comparable: summary.deltas.income.percentage !== null,
    },
    {
      key: 'expense',
      label: labels.expense,
      icon: ArrowUpRight,
      color: NEG,
      value: compactMoney(summary.totals.current.expense, baseCurrency, language),
      caption: formatDelta('expense', summary.deltas.expense, labels),
      pill: deltaPill('expense', summary.deltas.expense, labels),
      trend: history?.expense,
      comparable: summary.deltas.expense.percentage !== null,
    },
    {
      key: 'net',
      label: labels.net,
      icon: Banknote,
      color: net < 0 ? NEG : ACCENT,
      value: compactMoney(net, baseCurrency, language),
      valueTone: signTone(net),
      caption: formatDelta('net', summary.deltas.net, labels),
      pill: deltaPill('net', summary.deltas.net, labels),
      trend: history?.net,
      comparable: summary.deltas.net.percentage !== null,
    },
    {
      key: 'savings',
      label: labels.savingsRate,
      icon: PiggyBank,
      color: ACCENT,
      value: summary.totals.current.savingsRate === null
        ? '--'
        : formatPercent(summary.totals.current.savingsRate, 1),
      caption: formatDelta('savingsRate', summary.deltas.savingsRate, labels),
      pill: deltaPill('savingsRate', summary.deltas.savingsRate, labels),
      trend: history?.savingsRate,
      comparable: summary.deltas.savingsRate.percentage !== null,
    },
  ];

  // First period with data: one note under the grid instead of "No comparison yet" four times.
  const noneComparable = cards.every(card => !card.comparable);
  const projected = summary.forecast.projectedNet;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-2.5 sm:gap-3">
        {cards.map(card => {
          const trend = card.trend && card.trend.length >= 2 && card.trend.some(value => value !== 0) ? card.trend : null;
          return (
            <div key={card.key} className="paper-tile flex min-w-0 flex-col gap-2 overflow-hidden p-3.5 pb-0">
              <div className="flex min-w-0 items-center gap-2">
                <IconTile icon={card.icon} color={card.color} size={26} shape="circle" />
                <p className="min-w-0 truncate text-[12px] font-semibold uppercase tracking-wide text-faint">{card.label}</p>
              </div>
              <Big size={24} className={clsx('tabular-nums', card.valueTone)}>{card.value}</Big>
              <div className="min-h-5">
                {card.pill ?? (!noneComparable && <p className="truncate text-[12px] text-muted">{card.caption}</p>)}
              </div>
              {trend ? (
                <Sparkline values={trend} height={30} color={card.color} dot className="-mx-3.5 mt-auto w-[calc(100%+1.75rem)]" />
              ) : (
                <span className="mt-auto block h-3" aria-hidden="true" />
              )}
            </div>
          );
        })}
        <div className="paper-tile col-span-2 lg:col-span-1 flex min-w-0 flex-col gap-2 p-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <IconTile icon={TrendingUp} color={projected < 0 ? NEG : POS} size={26} shape="circle" />
            <p className="min-w-0 truncate text-[12px] font-semibold uppercase tracking-wide text-faint">{labels.projectedNet}</p>
          </div>
          <Big size={24} className={clsx('tabular-nums', signTone(projected))}>{compactMoney(projected, baseCurrency, language)}</Big>
          <p className="text-[12px] leading-snug text-muted">{formatForecastConfidence(summary.forecast.confidence, labels)}</p>
        </div>
      </div>
      {noneComparable && (
        <p className="px-1 text-[12px] text-muted">{labels.firstPeriod ?? labels.noComparison}</p>
      )}
    </div>
  );
};
