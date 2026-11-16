import React from 'react';
import clsx from 'clsx';
import type { QueryExecution } from '../../domain/financeQuery';
import { formatPercent } from '../../utils/locale';
import { formatAskValue } from './askFormat';

/** The answer's single total in large type, with its change when the plan compared periods. */
export const Headline: React.FC<{ execution: QueryExecution; language: 'en' | 'sr'; size?: number }> = ({ execution, language, size = 26 }) => {
  const { table } = execution;
  if (table.dataset === 'balances' || table.rows.length > 0 || table.count === 0) return null;
  const change = table.changePct;
  // More spending reads as bad, more income as good.
  const good = change !== undefined && (change > 0) === (table.dataset === 'transactions' && table.type !== 'expense');
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-bold leading-none tracking-[-0.5px] tabular-nums" style={{ fontSize: size }}>{formatAskValue(table.total, table, language)}</span>
      {change !== undefined && (
        <span className={clsx('rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums', good ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg')}>
          {change > 0 ? '+' : ''}{formatPercent(change, Math.abs(change) < 10 ? 1 : 0, language)}
        </span>
      )}
    </div>
  );
};
