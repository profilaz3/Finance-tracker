import React, { useMemo } from 'react';
import type { AppLanguage } from '../../utils/locale';
import type { ChartHint, ResultTable } from '../../domain/financeQuery';
import { HorizontalBarChart, LineAreaChart } from '../stats/lightCharts';
import { buildChartColors, formatCompactNumber } from '../stats/types';
import { formatAskRange, formatAskValue, formatGroupLabel } from './askFormat';
import { TRANSLATIONS } from '../../constants';

interface AskChartProps {
  table: ResultTable;
  hint: ChartHint;
  language: AppLanguage;
}

/**
 * Small chart under an answer. The model only suggests a kind; the rows decide whether a
 * chart makes sense (a line needs 3+ periods, bars need 2+ non-negative groups).
 */
export const AskChart: React.FC<AskChartProps> = ({ table, hint, language }) => {
  const t = TRANSLATIONS[language];
  const colors = useMemo(buildChartColors, []);
  const format = (value: number) => formatAskValue(value, table, language);
  const timeSeries = table.groupBy === 'month' || table.groupBy === 'week';

  const twoPeriods = table.rows.length === 0 && table.compareTotal !== undefined && table.total >= 0 && table.compareTotal >= 0;
  if (hint === 'none' && !twoPeriods) return null;

  if (timeSeries && table.rows.length >= 3) {
    // Short axis labels ("Sep" rather than "Sept 26") when the series stays inside one year.
    const oneYear = table.groupBy === 'month' && new Set(table.rows.map((row) => row.label.slice(0, 4))).size === 1;
    const rows = table.rows.map((row) => ({ label: formatGroupLabel(row.label, table.groupBy, language, oneYear), value: row.value }));
    return (
      <div className="h-44 w-full" aria-hidden="true">
        <LineAreaChart
          rows={rows}
          labelKey="label"
          valueKey="value"
          stroke={colors.accent}
          fill={colors.accent}
          valueFormatter={format}
          yTickFormatter={table.metric === 'count' ? undefined : formatCompactNumber}
          includeZero
        />
      </div>
    );
  }

  // Two periods without groups: compare them side by side.
  if (twoPeriods) {
    return (
      <HorizontalBarChart
        valueFormatter={format}
        rows={[
          { id: 'now', label: formatAskRange(table.range, language, t), value: table.total, color: colors.accent },
          { id: 'before', label: formatAskRange(table.compare, language, t), value: table.compareTotal ?? 0, color: colors.accentSoft },
        ]}
      />
    );
  }

  if (!timeSeries && table.rows.length >= 2 && table.rows.every((row) => row.value >= 0)) {
    return (
      <HorizontalBarChart
        valueFormatter={format}
        rows={table.rows.slice(0, 8).map((row, index) => ({
          id: `${index}`,
          label: formatGroupLabel(row.label, table.groupBy, language),
          value: row.value,
          color: index === 0 ? colors.accent : colors.accentSoft,
        }))}
      />
    );
  }

  return null;
};
