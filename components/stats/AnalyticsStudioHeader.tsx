import React from 'react';
import clsx from 'clsx';
import type { AnalyticsPeriod, AnalyticsPeriodRange } from '../../utils/analyticsSelectors';

export interface AnalyticsStudioHeaderProps {
  title: string;
  description: string;
  period: AnalyticsPeriod;
  periodRange: AnalyticsPeriodRange;
  labels: Record<AnalyticsPeriod, string>;
  onPeriodChange: (period: AnalyticsPeriod) => void;
}

export const AnalyticsStudioHeader: React.FC<AnalyticsStudioHeaderProps> = ({
  title,
  description,
  period,
  periodRange,
  labels,
  onPeriodChange,
}) => (
  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 min-w-0">
    <div className="min-w-0">
      <h2 className="text-2xl font-display font-medium text-on-surface break-words">{title}</h2>
      <p className="text-sm text-on-surface-variant mt-1 break-words">{description}</p>
      <p className="text-xs text-on-surface-variant mt-2 break-words">{periodRange.currentKey}</p>
    </div>
    <div className="bg-surface-container rounded-full p-1 flex gap-1 overflow-x-auto custom-scrollbar max-w-full">
      {(['month', 'quarter', 'year'] as const).map(option => (
        <button
          type="button"
          key={option}
          onClick={() => onPeriodChange(option)}
          aria-pressed={period === option}
          className={clsx(
            'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
            period === option
              ? 'bg-secondary-container text-on-secondary-container'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  </div>
);
