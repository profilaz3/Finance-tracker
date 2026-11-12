import React from 'react';
import type { AnalyticsDeltaDirection, AnalyticsStudioSummary } from '../../utils/analyticsSelectors';
import type { Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';

type AnalyticsKpiMetric = 'income' | 'expense' | 'net' | 'savingsRate';
type DeltaTone = 'improved' | 'worsened' | 'neutral';

export interface AnalyticsKpiGridProps {
  summary: AnalyticsStudioSummary;
  baseCurrency: Currency;
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
  const toneLabel = tone === 'neutral' ? '' : ` - ${labels[tone]}`;

  return `${delta.absolute >= 0 ? '+' : ''}${delta.percentage.toFixed(1)}% ${labels.vsPreviousPeriod}${toneLabel}`;
};

const formatForecastConfidence = (
  confidence: AnalyticsStudioSummary['forecast']['confidence'],
  labels: AnalyticsKpiGridProps['labels'],
) => (
  confidence === 'low' ? labels.lowConfidenceForecast : labels.normalConfidenceForecast
);

export const AnalyticsKpiGrid: React.FC<AnalyticsKpiGridProps> = ({ summary, baseCurrency, labels }) => {
  const cards = [
    {
      key: 'income',
      label: labels.income,
      value: formatCurrency(summary.totals.current.income, baseCurrency),
      caption: formatDelta('income', summary.deltas.income, labels),
    },
    {
      key: 'expense',
      label: labels.expense,
      value: formatCurrency(summary.totals.current.expense, baseCurrency),
      caption: formatDelta('expense', summary.deltas.expense, labels),
    },
    {
      key: 'net',
      label: labels.net,
      value: formatCurrency(summary.totals.current.net, baseCurrency),
      caption: formatDelta('net', summary.deltas.net, labels),
    },
    {
      key: 'savings',
      label: labels.savingsRate,
      value: summary.totals.current.savingsRate === null
        ? '--'
        : `${summary.totals.current.savingsRate.toFixed(1)}%`,
      caption: formatDelta('savingsRate', summary.deltas.savingsRate, labels),
    },
    {
      key: 'projected',
      label: labels.projectedNet,
      value: formatCurrency(summary.forecast.projectedNet, baseCurrency),
      caption: formatForecastConfidence(summary.forecast.confidence, labels),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
      {cards.map(card => (
        <div key={card.key} className="min-w-0 rounded-xl bg-surface-container-low border border-outline/10 p-4 shadow-elevation-1">
          <p className="text-xs font-medium text-on-surface-variant break-words">{card.label}</p>
          <p className="text-xl font-display font-medium text-on-surface mt-2 break-words">{card.value}</p>
          <p className="text-xs text-on-surface-variant mt-2 break-words">{card.caption}</p>
        </div>
      ))}
    </div>
  );
};
