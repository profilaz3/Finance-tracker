import React from 'react';
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import type { Category, Currency } from '../../types';
import type { AppLanguage } from '../../utils/locale';
import { formatPercent } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import { localizeCategoryName } from '../../utils/systemText';
import type { BudgetCategoryProgress, CategorySpend } from '../../domain/home';
import type { RaiseSuggestion } from '../../domain/budgetView';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { fill, fitFont } from '../home/parts';
import { plainAmount } from '../stats/analyticsStrings';
import type { BudgetStrings } from './budgetStrings';

const HATCH = 'repeating-linear-gradient(-45deg, var(--paper-neg) 0 3px, transparent 3px 6px)';

interface CategoryTilesProps {
  rows: BudgetCategoryProgress[];
  /** Big categories spent on this month that have no limit. */
  unlimited: CategorySpend[];
  categories: Map<string, Category>;
  /** Share of the month gone (0..1): the mark on every bar. */
  today: number;
  daysLeft: number;
  suggestions: Map<string, RaiseSuggestion>;
  currency: Currency;
  language: AppLanguage;
  locale: string;
  onEditLimits: (focusCategoryId?: string) => void;
  onRaise: (categoryId: string, limit: number) => void;
  s: BudgetStrings;
}

/** Category limits as tiles: the ones within their limit two to a row, the ones over it full width. */
export const CategoryTiles: React.FC<CategoryTilesProps> = ({
  rows, unlimited, categories, today, daysLeft, suggestions, currency, language, locale, onEditLimits, onRaise, s,
}) => {
  const amount = (value: number) => plainAmount(value, currency, locale);
  const nameOf = (id: string, fallback: string) => {
    const category = categories.get(id);
    return category ? localizeCategoryName(category, language) : fallback;
  };
  const within = rows.filter(row => row.over <= 0);
  const over = rows.filter(row => row.over > 0);
  const mark = `${(Math.max(0, Math.min(1, today)) * 100).toFixed(1)}%`;

  return (
    // A container: beside the header on wide windows this column is narrower than the window.
    <section aria-labelledby="budget-categories-title" className="@container flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="budget-categories-title" className="text-[19px] font-bold tracking-[-0.3px]">{s.categories}</h2>
        <button type="button" onClick={() => onEditLimits()} className="-mr-2 h-10 rounded-full px-2 text-[14.5px] font-semibold text-accent">
          {s.editLimits}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-6 @xl:gap-3">
        {within.map((row, i) => {
          const category = categories.get(row.categoryId);
          // Tiles are two to a row in a narrow column and three in a wide one (6 columns, 2 each). A
          // short last row fills the width instead of leaving empty cells: one tile spans it, two share it.
          const alone = i === within.length - 1 && within.length % 2 === 1;
          const lastRow = within.length % 3;
          const wideSpan = i < within.length - lastRow ? '@xl:col-span-2' : lastRow === 1 ? '@xl:col-span-6' : '@xl:col-span-3';
          const ratio = row.limit > 0 ? row.spent / row.limit : 0;
          const left = `${amount(row.left)} ${s.left}`;
          return (
            <article key={row.categoryId} className={clsx('paper-tile flex min-w-0 flex-col p-3.5', wideSpan, alone && '@max-xl:col-span-2')} style={{ containerType: 'inline-size' }}>
              <div className="flex items-start justify-between gap-2">
                {category && <CategoryGlyph category={category} size={34} shape="circle" tone="solid" />}
                <span className="text-[12.5px] font-semibold tabular-nums text-muted">{formatPercent(ratio * 100, 0, language)}</span>
              </div>
              <h3 className="mt-2.5 truncate text-[13.5px] font-medium text-muted">{nameOf(row.categoryId, row.name)}</h3>
              <p className="whitespace-nowrap font-bold tabular-nums tracking-[-0.02em]" style={{ fontSize: fitFont(22, left, 0.6) }}>
                {amount(row.left)} <span className="text-[12.5px] font-medium tracking-normal text-muted">{s.left}</span>
              </p>
              <div aria-hidden="true" className="relative mt-2.5 h-2 rounded-full bg-chip">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.min(1, ratio) * 100).toFixed(1)}%`, background: row.color }} />
                <span className="absolute -inset-y-1 w-[2px] -translate-x-1/2 rounded-full bg-on-surface ring-2 ring-[var(--paper-tile)]" style={{ left: mark }} />
              </div>
              <p className="mt-2 text-[12px] leading-snug text-muted">
                {fill(s.perDayOf, { amount: amount(row.left / daysLeft), limit: amount(row.limit) })}
              </p>
            </article>
          );
        })}

        {over.map(row => {
          const category = categories.get(row.categoryId);
          const name = nameOf(row.categoryId, row.name);
          const suggestion = suggestions.get(row.categoryId);
          const average = suggestion
            ? pluralText(suggestion.months, language, {
              one: s.averageOne,
              few: 'averageFew' in s ? s.averageFew : undefined,
              other: s.averageOther,
            })
            : '';
          const [before, after = ''] = average.split('{amount}');
          return (
            <article key={row.categoryId} className="paper-tile col-span-full flex flex-col p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  {category && <CategoryGlyph category={category} size={34} shape="circle" tone="solid" />}
                  <h3 className="truncate text-[16px] font-semibold">{name}</h3>
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-neg/12 px-2.5 py-1 text-[12.5px] font-semibold text-neg">
                  {fill(s.overBadge, { amount: amount(row.over) })}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <p className="whitespace-nowrap">
                  <span className="text-[24px] font-bold tabular-nums tracking-[-0.02em]">{amount(row.spent)}</span>{' '}
                  <span className="text-[13px] font-medium text-muted">{fill(s.ofAmount, { amount: amount(row.limit) })}</span>
                </p>
                <span className="text-[12.5px] font-semibold tabular-nums text-muted">{formatPercent((row.spent / row.limit) * 100, 0, language)}</span>
              </div>
              <div aria-hidden="true" className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-chip">
                <span style={{ width: `${((row.limit / row.spent) * 100).toFixed(1)}%`, background: row.color }} />
                <span className="flex-1 opacity-70" style={{ background: HATCH }} />
              </div>
              {suggestion && (
                <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hair pt-3">
                  <Sparkles size={17} aria-hidden="true" className="shrink-0 text-accent" />
                  <p className="min-w-0 flex-1 basis-[160px] text-[13.5px] leading-snug">
                    {before}<b className="font-semibold">{`${amount(suggestion.average)} ${currency}`}</b>{after}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRaise(row.categoryId, suggestion.limit)}
                    aria-label={`${s.raiseLimit}: ${name}, ${amount(suggestion.limit)} ${currency}`}
                    className="ml-auto h-11 shrink-0 rounded-full bg-accent px-5 text-[14.5px] font-semibold text-on-accent"
                  >
                    {s.raiseLimit}
                  </button>
                </div>
              )}
            </article>
          );
        })}

        <div className={clsx(
          'col-span-full flex items-center gap-3 rounded-[24px] border-[1.5px] border-dashed border-[var(--paper-line)] p-3.5',
          rows.length === 0 && unlimited.length === 0 && 'py-4',
        )}>
          {unlimited.length > 0 && (
            <span className="flex shrink-0 items-center" aria-hidden="true">
              {unlimited.map((entry, i) => {
                const category = categories.get(entry.categoryId);
                return category ? (
                  <span key={entry.categoryId} className={clsx('rounded-full', i > 0 && '-ml-2 ring-[2.5px] ring-[var(--paper-bg)]')}>
                    <CategoryGlyph category={category} size={32} shape="circle" tone="solid" />
                  </span>
                ) : null;
              })}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold leading-snug">
              {unlimited.length === 0
                ? s.watchHint
                : unlimited.length === 1
                  ? nameOf(unlimited[0].categoryId, unlimited[0].name)
                  : fill(s.and, { a: nameOf(unlimited[0].categoryId, unlimited[0].name), b: nameOf(unlimited[1].categoryId, unlimited[1].name) })}
            </p>
            {unlimited.length > 0 && <p className="text-[12.5px] font-medium text-muted">{s.noLimitYet}</p>}
          </div>
          <button
            type="button"
            onClick={() => onEditLimits(unlimited[0]?.categoryId)}
            className="h-11 shrink-0 rounded-full bg-accent-soft px-4 text-[14.5px] font-semibold text-accent"
          >
            {s.setLimit}
          </button>
        </div>
      </div>
    </section>
  );
};
