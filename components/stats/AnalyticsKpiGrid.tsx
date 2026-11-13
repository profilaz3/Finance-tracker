import React from 'react';
import type { AnalyticsDeltaDirection, AnalyticsStudioSummary } from '../../utils/analyticsSelectors';
import clsx from 'clsx';
import type { Currency } from '../../types';
import { formatPercent, type AppLanguage } from '../../utils/locale';
import { Big, compactMoney } from '../home/parts';

type AnalyticsKpiMetric = 'income' | 'expense' | 'net' | 'savingsRate';
type DeltaTone = 'improved' | 'worsened' | 'neutral';

export interface AnalyticsKpiGridProps {
  summary: AnalyticsStudioSummary;
  baseCurrency: Currency;
  language: AppLanguage;
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

const toneClass = (tone: DeltaTone | null) => (
  tone === 'improved' ? 'text-pos' : tone === 'worsened' ? 'text-neg' : 'text-muted'
);

const deltaTone = (
  metric: AnalyticsKpiMetric,
  delta: AnalyticsStudioSummary['deltas']['income'],
): DeltaTone | null => (delta.percentage === null ? null : getDeltaTone(metric, delta.direction));

const signTone = (amount: number) => (amount > 0 ? 'text-pos' : amount < 0 ? 'text-neg' : undefined);

export const AnalyticsKpiGrid: React.FC<AnalyticsKpiGridProps> = ({ summary, baseCurrency, language, labels }) => {
  const cards = [
    {
      key: 'income',
      label: labels.income,
      value: compactMoney(summary.totals.current.income, baseCurrency, language),
      caption: formatDelta('income', summary.deltas.income, labels),
      captionTone: deltaTone('income', summary.deltas.income),
    },
    {
      key: 'expense',
      label: labels.expense,
      value: compactMoney(summary.totals.current.expense, baseCurrency, language),
      caption: formatDelta('expense', summary.deltas.expense, labels),
      captionTone: deltaTone('expense', summary.deltas.expense),
    },
    {
      key: 'net',
      label: labels.net,
      value: compactMoney(summary.totals.current.net, baseCurrency, language),
      valueTone: signTone(summary.totals.current.net),
      caption: formatDelta('net', summary.deltas.net, labels),
      captionTone: deltaTone('net', summary.deltas.net),
    },
    {
      key: 'savings',
      label: labels.savingsRate,
      value: summary.totals.current.savingsRate === null
        ? '--'
        : formatPercent(summary.totals.current.savingsRate, 1),
      caption: formatDelta('savingsRate', summary.deltas.savingsRate, labels),
      captionTone: deltaTone('savingsRate', summary.deltas.savingsRate),
    },
    {
      key: 'projected',
      label: labels.projectedNet,
      value: compactMoney(summary.forecast.projectedNet, baseCurrency, language),
      valueTone: signTone(summary.forecast.projectedNet),
      caption: formatForecastConfidence(summary.forecast.confidence, labels),
      captionTone: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-2.5 sm:gap-3">
      {cards.map(card => (
        <div
          key={card.key}
          className={clsx(
            'paper-tile flex min-w-0 flex-col gap-1.5 p-4',
            card.key === 'projected' && 'col-span-2 lg:col-span-1',
          )}
        >
          <p className="truncate text-[12px] font-semibold uppercase tracking-wide text-faint">{card.label}</p>
          <Big size={26} className={clsx('tabular-nums', card.valueTone)}>{card.value}</Big>
          <p className={clsx('text-[12px] leading-snug break-words', toneClass(card.captionTone))}>{card.caption}</p>
        </div>
      ))}
    </div>
  );
};
