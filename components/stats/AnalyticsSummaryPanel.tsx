import React from 'react';
import type { AnalyticsStudioSummary } from '../../utils/analyticsSelectors';
import type { Currency } from '../../types';
import type { AppLanguage } from '../../utils/locale';
import { money } from '../home/parts';

export interface AnalyticsSummaryPanelProps {
  summary: AnalyticsStudioSummary;
  baseCurrency: Currency;
  language: AppLanguage;
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
  language,
  label,
  labels,
}) => (
  <section className="paper-tile min-w-0 p-4 sm:p-5">
    <h3 className="mb-2 text-[17px] font-bold tracking-[-0.3px]">{label}</h3>
    <p className="text-[15px] leading-snug break-words">{getHeadline(summary.localSummary.status, labels)}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {summary.localSummary.facts.map(fact => (
        <span key={fact.key} className="rounded-full bg-chip px-3 py-1.5 text-[13px] text-muted break-words">
          {getFactLabel(fact.key, labels)}: <span className="font-semibold tabular-nums text-on-surface">{money(fact.value, baseCurrency, language)}</span>
        </span>
      ))}
    </div>
  </section>
);
