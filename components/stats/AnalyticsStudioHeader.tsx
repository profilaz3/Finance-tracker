import React from 'react';
import type { AnalyticsPeriod, AnalyticsPeriodRange } from '../../utils/analyticsSelectors';
import { getIntlLocale, type AppLanguage } from '../../utils/locale';
import { Segmented } from '../ui/Segmented';

export interface AnalyticsStudioHeaderProps {
  period: AnalyticsPeriod;
  periodRange: AnalyticsPeriodRange;
  labels: Record<AnalyticsPeriod, string>;
  ariaLabel: string;
  language: AppLanguage;
  onPeriodChange: (period: AnalyticsPeriod) => void;
}

/** "November 2026", "Q4 2026" ("4. kvartal 2026") or "2026" for the selected analytics period. */
export const formatPeriodLabel = (range: AnalyticsPeriodRange, language: AppLanguage): string => {
  const start = range.currentStart;
  const locale = getIntlLocale(language);
  if (range.period === 'year') return String(start.getFullYear());
  if (range.period === 'quarter') {
    const quarter = Math.floor(start.getMonth() / 3) + 1;
    return language === 'sr' ? `${quarter}. kvartal ${start.getFullYear()}` : `Q${quarter} ${start.getFullYear()}`;
  }
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(start);
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
};

/** Period row under the page title: the human period on the left, Month / Quarter / Year on the right. */
export const AnalyticsStudioHeader: React.FC<AnalyticsStudioHeaderProps> = ({
  period,
  periodRange,
  labels,
  ariaLabel,
  language,
  onPeriodChange,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-w-0">
    <p className="min-w-0 truncate text-[17px] font-bold tracking-[-0.3px]" aria-live="polite">
      {formatPeriodLabel(periodRange, language)}
    </p>
    <Segmented<AnalyticsPeriod>
      size="sm"
      ariaLabel={ariaLabel}
      value={period}
      onChange={onPeriodChange}
      options={(['month', 'quarter', 'year'] as const).map(option => ({ value: option, label: labels[option] }))}
    />
  </div>
);
