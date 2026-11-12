import React from 'react';
import type { AnalyticsStudioSummary } from '../../utils/analyticsSelectors';
import type { Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export interface AnalyticsSummaryPanelProps {
  summary: AnalyticsStudioSummary;
  baseCurrency: Currency;
  label: string;
  labels: {
    income: string;
    expense: string;
    projectedNet: string;
    positiveNetFlow: string;
    negativeNetFlow: string;
    flatNetFlow: string;
  };
}

const getHeadline = (
  status: AnalyticsStudioSummary['localSummary']['status'],
  labels: AnalyticsSummaryPanelProps['labels'],
) => {
  if (status === 'positive') return labels.positiveNetFlow;
  if (status === 'negative') return labels.negativeNetFlow;
  return labels.flatNetFlow;
};

const getFactLabel = (
  key: AnalyticsStudioSummary['localSummary']['facts'][number]['key'],
  labels: AnalyticsSummaryPanelProps['labels'],
) => {
  if (key === 'income') return labels.income;
  if (key === 'expense') return labels.expense;
  return labels.projectedNet;
};

export const AnalyticsSummaryPanel: React.FC<AnalyticsSummaryPanelProps> = ({
  summary,
  baseCurrency,
  label,
  labels,
}) => (
  <div className="rounded-xl bg-surface-container-low border border-outline/10 p-4 sm:p-5 shadow-elevation-1 min-w-0">
    <h3 className="text-lg font-medium text-on-surface break-words">{label}</h3>
    <p className="text-sm text-on-surface mt-3 break-words">{getHeadline(summary.localSummary.status, labels)}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {summary.localSummary.facts.map(fact => (
        <span key={fact.key} className="rounded-full bg-surface-container px-3 py-1 text-xs text-on-surface-variant break-words">
          {getFactLabel(fact.key, labels)}: {formatCurrency(fact.value, baseCurrency)}
        </span>
      ))}
    </div>
  </div>
);
