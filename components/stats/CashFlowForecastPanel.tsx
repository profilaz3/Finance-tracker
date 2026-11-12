import React from 'react';
import type { AnalyticsForecast } from '../../utils/analyticsSelectors';
import type { Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export interface CashFlowForecastPanelProps {
  forecast: AnalyticsForecast;
  baseCurrency: Currency;
  labels: {
    cashFlowForecast: string;
    forecastEstimate: string;
    recurringImpact: string;
    lowConfidenceForecast: string;
    normalConfidenceForecast: string;
    lowConfidenceReason: string;
    normalConfidenceReason: string;
  };
}

const getForecastReason = (
  confidence: AnalyticsForecast['confidence'],
  labels: CashFlowForecastPanelProps['labels'],
) => (
  confidence === 'low' ? labels.lowConfidenceReason : labels.normalConfidenceReason
);

export const CashFlowForecastPanel: React.FC<CashFlowForecastPanelProps> = ({ forecast, baseCurrency, labels }) => (
  <div className="rounded-xl bg-surface-container-low border border-outline/10 p-4 sm:p-5 shadow-elevation-1 min-w-0">
    <h3 className="text-lg font-medium text-on-surface break-words">{labels.cashFlowForecast}</h3>
    <p className="text-xs text-on-surface-variant mt-1 break-words">
      {forecast.confidence === 'low' ? labels.lowConfidenceForecast : labels.normalConfidenceForecast}
    </p>
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg bg-surface-container p-3 min-w-0">
        <p className="text-xs text-on-surface-variant break-words">{labels.forecastEstimate}</p>
        <p className="text-xl font-display font-medium text-on-surface break-words">
          {formatCurrency(forecast.projectedNet, baseCurrency)}
        </p>
      </div>
      <div className="rounded-lg bg-surface-container p-3 min-w-0">
        <p className="text-xs text-on-surface-variant break-words">{labels.recurringImpact}</p>
        <p className="text-xl font-display font-medium text-on-surface break-words">
          {formatCurrency(forecast.recurringImpact, baseCurrency)}
        </p>
      </div>
    </div>
    <p className="text-xs text-on-surface-variant mt-3 break-words">{getForecastReason(forecast.confidence, labels)}</p>
  </div>
);
