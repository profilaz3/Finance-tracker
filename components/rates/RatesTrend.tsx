import React, { useMemo } from 'react';
import clsx from 'clsx';
import { TRANSLATIONS } from '../../constants';
import { formatNumber, formatPercent, type AppLanguage } from '../../utils/locale';
import { belgradeToday, type NbsCurrency } from '../../utils/nbsRates';
import { pointsSince, rangeStart, rangeStats } from '../../domain/exchangeRates';
import { RateChart } from './RateChart';
import { useNbsHistory } from './useNbsHistory';

type Strings = (typeof TRANSLATIONS)['en'];

const PAIRS: NbsCurrency[] = ['EUR', 'USD'];

/**
 * Home "Trend" style of the Rates block: EUR/RSD and USD/RSD over the past month with a sparkline.
 * `fallback` (RSD per unit from the app's rate table) shows numbers before any history loads.
 */
export const RatesTrend: React.FC<{ language: AppLanguage; t: Strings; fallback: Record<NbsCurrency, number>; live?: boolean }> = ({
  language,
  t,
  fallback,
  live = true,
}) => {
  const from = rangeStart(belgradeToday(), '1M');
  const { history } = useNbsHistory(from, live);
  const rows = useMemo(
    () => PAIRS.map((currency) => {
      const points = history ? pointsSince(history.series[currency], from) : [];
      return { currency, points, stats: rangeStats(points) };
    }),
    [history, from],
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {rows.map(({ currency, points, stats }) => {
        const value = stats?.current ?? fallback[currency];
        const pct = stats?.rangeChangePct ?? 0;
        return (
          <div key={currency} className="flex min-w-0 flex-col rounded-2xl bg-chip px-3 pb-2 pt-2.5">
            <span className="text-[12px] font-medium text-muted">{currency}/RSD</span>
            <span className="truncate text-[17px] font-bold tabular-nums">
              {value > 0 ? formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language) : '...'}
            </span>
            {stats && (
              <span className={clsx('text-[11px] font-semibold tabular-nums', Math.abs(pct) < 0.005 ? 'text-muted' : 'text-accent')}>
                {Math.abs(pct) < 0.005 ? t.ratesUnchanged : `${pct > 0 ? '+' : '−'}${formatPercent(Math.abs(pct), 2, language)}`}
              </span>
            )}
            <div className="mt-1">
              {points.length > 1 ? (
                <RateChart
                  points={points}
                  height={40}
                  bare
                  formatTick={() => ''}
                  formatDateLabel={() => ''}
                  ariaLabel={`${currency}/RSD, ${t.ratesOver_1M}`}
                />
              ) : (
                <div className="h-10" aria-hidden="true" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
