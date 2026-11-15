import React, { useId, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import type { AppLanguage } from '../../utils/locale';
import type { QueryExecution, QueryPlan } from '../../domain/financeQuery';
import { TRANSLATIONS } from '../../constants';
import { formatMediumDate } from '../../utils/locale';
import { formatAskRange, formatAskValue, formatGroupLabel, groupName } from './askFormat';

interface AskExplainProps {
  plan: QueryPlan;
  execution: QueryExecution;
  language: AppLanguage;
}

/** "How I got this": the plan in words, what matched, and the exact numbers behind the answer. */
export const AskExplain: React.FC<AskExplainProps> = ({ plan, execution, language }) => {
  const t = TRANSLATIONS[language];
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { table, explain } = execution;

  const source = plan.dataset === 'eventExpenses'
    ? `${t.askSrcEvents}, ${plan.share === 'total' ? t.askShareTotal : t.askShareMine}`
    : plan.dataset === 'balances' ? t.askSrcBalances : t.askSrcTransactions;
  const typeLabel = plan.dataset === 'transactions'
    ? plan.type === 'income' ? t.income : plan.type === 'net' ? `${t.income} - ${t.expense}` : t.expense
    : null;
  const filters = [
    typeLabel,
    ...explain.resolved.categories,
    ...explain.resolved.accounts,
    ...explain.resolved.people,
    ...explain.resolved.events,
    explain.resolved.team,
    plan.merchant ? t.askShop.replace('{name}', plan.merchant) : null,
    plan.recurring ? t.askRepeatingOnly : null,
  ].filter((item): item is string => Boolean(item));
  const metric = plan.metric === 'count' ? t.askMetricCount : plan.metric === 'avg' ? t.askMetricAvg : t.askMetricSum;
  const group = groupName(table.groupBy, t);
  const matched = explain.compareMatched !== undefined
    ? t.askMatchedCompare.replace('{count}', String(explain.matched)).replace('{compare}', String(explain.compareMatched))
    : t.askMatched.replace('{count}', String(explain.matched));
  const ratesDate = /^\d{4}-\d{2}-\d{2}/.test(explain.ratesDate)
    ? formatMediumDate(new Date(`${explain.ratesDate.slice(0, 10)}T12:00:00`), language)
    : explain.ratesDate;

  const maxRowValue = Math.max(0, ...table.rows.map(row => row.value));
  const facts: Array<[string, string]> = [
    [t.askHowSource, source],
    [t.askHowPeriod, plan.dataset === 'balances' && plan.range
      ? t.askUpTo.replace('{date}', formatAskRange({ from: plan.range.to, to: plan.range.to }, language, t))
      : formatAskRange(plan.range, language, t)],
    ...(plan.compare ? [[t.askHowCompare, formatAskRange(plan.compare, language, t)] as [string, string]] : []),
    ...(filters.length > 0 ? [[t.askHowFilters, filters.join(', ')] as [string, string]] : []),
    [t.askHowMetric, metric],
    ...(group ? [[t.askHowGroup, group] as [string, string]] : []),
    [t.askHowMatched, matched],
    [t.askHowCurrency, t.askRates.replace('{currency}', explain.currency).replace('{date}', ratesDate)],
    ...(table.unresolved.length > 0 ? [[t.askHowNotFound, table.unresolved.join(', ')] as [string, string]] : []),
  ];

  return (
    <div className="rounded-[18px] bg-chip/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-10 w-full items-center gap-2 px-3.5 text-left text-[13px] font-semibold text-muted"
      >
        <span className="flex-1">{t.askHow}</span>
        <ChevronDown size={16} aria-hidden="true" className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 px-3.5 pb-3.5 text-[13px]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            {facts.map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 break-words font-medium">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
          {table.rows.length > 0 && (
            <div>
              <p className="mb-1 text-muted">{t.askHowRows}</p>
              <table className="w-full text-[13px]">
                <tbody>
                  {table.rows.map((row, index) => (
                    <tr key={`${row.label}-${index}`} className="border-t border-hair first:border-t-0">
                      <td className="w-full max-w-0 py-1.5 pr-2">
                        <span className="block truncate">{formatGroupLabel(row.label, table.groupBy, language)}</span>
                        {maxRowValue > 0 && row.value > 0 && (
                          <span className="mt-1 block h-1 rounded-full bg-accent" style={{ width: `${Math.max(4, (row.value / maxRowValue) * 100).toFixed(1)}%`, opacity: index === 0 ? 1 : 0.45 }} aria-hidden="true" />
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1.5 align-top text-right font-semibold tabular-nums">{formatAskValue(row.value, table, language)}</td>
                      {row.compareValue !== undefined && (
                        <td className="whitespace-nowrap py-1.5 pl-2 align-top text-right tabular-nums text-muted">{formatAskValue(row.compareValue, table, language)}</td>
                      )}
                    </tr>
                  ))}
                  {table.other && (
                    <tr className="border-t border-hair text-muted">
                      <td className="py-1 pr-2">{t.askMoreGroups.replace('{count}', String(table.other.groups))}</td>
                      <td className="whitespace-nowrap py-1 text-right tabular-nums">{formatAskValue(table.other.value, table, language)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
