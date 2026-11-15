import React from 'react';
import type { AnalyticsForecast } from '../../utils/analyticsSelectors';
import type { Currency } from '../../types';
import type { AppLanguage } from '../../utils/locale';
import { compactMoney } from '../home/parts';

export interface CashFlowForecastPanelProps {
  forecast: AnalyticsForecast;
  baseCurrency: Currency;
  language: AppLanguage;
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

const signClass = (amount: number) => (amount > 0 ? 'text-pos' : amount < 0 ? 'text-neg' : undefined);

export const CashFlowForecastPanel: React.FC<CashFlowForecastPanelProps> = ({ forecast, baseCurrency, language, labels }) => (
  <section className="paper-tile min-w-0 p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="text-[17px] font-bold tracking-[-0.3px]">{labels.cashFlowForecast}</h3>
      <span className="text-[13px] text-muted">
        {forecast.confidence === 'low' ? labels.lowConfidenceForecast : labels.normalConfidenceForecast}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2.5">
      <div className="min-w-0 rounded-[18px] bg-chip p-3">
        <p className="text-[12px] font-semibold uppercase leading-tight tracking-wide text-faint [overflow-wrap:anywhere]">{labels.forecastEstimate}</p>
        <p className={`mt-1 text-[19px] font-bold tabular-nums tracking-[-0.4px] break-words ${signClass(forecast.projectedNet) ?? ''}`}>
          {compactMoney(forecast.projectedNet, baseCurrency, language)}
        </p>
      </div>
      <div className="min-w-0 rounded-[18px] bg-chip p-3">
        <p className="text-[12px] font-semibold uppercase leading-tight tracking-wide text-faint [overflow-wrap:anywhere]">{labels.recurringImpact}</p>
        <p className={`mt-1 text-[19px] font-bold tabular-nums tracking-[-0.4px] break-words ${signClass(forecast.recurringImpact) ?? ''}`}>
          {compactMoney(forecast.recurringImpact, baseCurrency, language)}
        </p>
      </div>
    </div>
    <p className="mt-3 text-[13px] leading-snug text-muted">{getForecastReason(forecast.confidence, labels)}</p>
  </section>
);
