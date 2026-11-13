import React from 'react';
import type { AnalyticsAnomaly } from '../../utils/analyticsSelectors';
import type { Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { formatPercent } from '../../utils/locale';

export interface AnomalyPanelProps {
  anomalies: AnalyticsAnomaly[];
  baseCurrency: Currency;
  labels: {
    observations: string;
    noObservations: string;
    anomalyTitles: Record<AnalyticsAnomaly['kind'], string>;
    categorySpikeDetail: (categoryName: string, amount: string, percentage: string | null) => string;
    largeTransactionDetail: (categoryName: string | null, amount: string, percentage: string | null) => string;
    highFeesDetail: (amount: string, percentage: string | null) => string;
  };
}

const formatPercentage = (percentage: number | undefined): string | null => (
  percentage === undefined ? null : formatPercent(percentage, 1)
);

const getAnomalyDetail = (
  anomaly: AnalyticsAnomaly,
  baseCurrency: Currency,
  labels: AnomalyPanelProps['labels'],
): string => {
  const amount = formatCurrency(anomaly.amount, baseCurrency);
  const percentage = formatPercentage(anomaly.percentage);

  if (anomaly.kind === 'category-spike') {
    return labels.categorySpikeDetail(anomaly.categoryName ?? '', amount, percentage);
  }

  if (anomaly.kind === 'large-transaction') {
    return labels.largeTransactionDetail(anomaly.categoryName ?? null, amount, percentage);
  }

  return labels.highFeesDetail(amount, percentage);
};

export const AnomalyPanel: React.FC<AnomalyPanelProps> = ({ anomalies, baseCurrency, labels }) => {
  return (
    <div className="rounded-xl bg-surface-container-low border border-outline/10 p-4 sm:p-5 shadow-elevation-1 min-w-0">
      <h3 className="text-lg font-medium text-on-surface break-words">{labels.observations}</h3>
      {anomalies.length === 0 ? (
        <p className="text-sm text-on-surface-variant mt-3 break-words">{labels.noObservations}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {anomalies.map(anomaly => (
            <div key={anomaly.id} className="rounded-lg bg-surface-container p-3 min-w-0">
              <div className="flex items-start justify-between gap-3 min-w-0">
                <p className="min-w-0 flex-1 text-sm font-medium text-on-surface break-words">
                  {labels.anomalyTitles[anomaly.kind]}
                </p>
                <span className="min-w-0 text-right text-xs font-medium text-on-surface-variant break-words">
                  {formatCurrency(anomaly.amount, baseCurrency)}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1 break-words">
                {getAnomalyDetail(anomaly, baseCurrency, labels)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
