import React from 'react';
import type { AnalyticsCategorySummary } from '../../utils/analyticsSelectors';
import clsx from 'clsx';
import type { Category, Currency } from '../../types';
import type { AppLanguage } from '../../utils/locale';
import { money } from '../home/parts';
import { formatCurrency } from '../../utils/formatters';
import { formatPercent } from '../../utils/locale';
import { CategoryGlyph } from '../ui/CategoryGlyph';

export interface CategoryDrilldownPanelProps {
  categories: AnalyticsCategorySummary[];
  selectedCategoryId: string | null;
  baseCurrency: Currency;
  language: AppLanguage;
  /** Full categories for icons; rows fall back to a neutral glyph when missing. */
  categoryLookup?: ReadonlyMap<string, Pick<Category, 'name' | 'color' | 'icon'>>;
  labels: {
    topCategories: string;
    selectedCategory: string;
    periodSpend: string;
    previousPeriod: string;
    shareOfExpenses: string;
    transactionsCount: string;
    noData: string;
    noComparison: string;
    improved: string;
    worsened: string;
  };
  onSelectCategory: (categoryId: string) => void;
}

const formatCategoryDelta = (
  selected: AnalyticsCategorySummary,
  labels: CategoryDrilldownPanelProps['labels'],
): string => {
  if (selected.delta.percentage === null) return labels.noComparison;

  const toneLabel = selected.delta.direction === 'flat'
    ? ''
    : ` · ${selected.delta.direction === 'down' ? labels.improved : labels.worsened}`;

  return `${selected.delta.absolute >= 0 ? '+' : ''}${formatPercent(selected.delta.percentage, 1)} ${labels.previousPeriod}${toneLabel}`;
};

export const CategoryDrilldownPanel: React.FC<CategoryDrilldownPanelProps> = ({
  categories,
  selectedCategoryId,
  baseCurrency,
  language,
  categoryLookup,
  labels,
  onSelectCategory,
}) => {
  const selected = categories.find(category => category.categoryId === selectedCategoryId) ?? categories[0];

  const deltaClass = selected && selected.delta.percentage !== null && selected.delta.direction !== 'flat'
    ? (selected.delta.direction === 'down' ? 'text-pos' : 'text-neg')
    : undefined;

  return (
    <section className="paper-tile min-w-0 p-4 sm:p-5">
      <h3 className="mb-3 text-[17px] font-bold tracking-[-0.3px]">{labels.topCategories}</h3>
      {categories.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-muted">{labels.noData}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {categories.map(category => {
            const isSelected = category.categoryId === selected?.categoryId;
            return (
              <li key={category.categoryId}>
                <button
                  type="button"
                  onClick={() => onSelectCategory(category.categoryId)}
                  aria-pressed={isSelected}
                  className={clsx(
                    'flex min-h-[44px] w-full min-w-0 items-center gap-3 rounded-[16px] px-2 py-2 text-left transition-colors',
                    isSelected ? 'bg-chip' : 'hover:bg-chip',
                  )}
                >
                  <CategoryGlyph
                    category={categoryLookup?.get(category.categoryId) ?? { name: category.name, color: category.color }}
                    size={38}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{category.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {category.transactionCount} {labels.transactionsCount}
                    </span>
                  </span>
                  <span className="flex-none text-right text-[15px] font-semibold tabular-nums">
                    {money(category.amount, baseCurrency, language)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && (
        <div className="mt-3 min-w-0 rounded-[18px] bg-chip p-3.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">{labels.selectedCategory}</p>
          <p className="truncate text-[16px] font-bold">{selected.name}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 min-w-0">
            <div className="min-w-0">
              <dt className="text-[12px] text-muted">{labels.periodSpend}</dt>
              <dd className="text-[15px] font-semibold tabular-nums break-words">{formatCurrency(selected.amount, baseCurrency)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] text-muted">{labels.shareOfExpenses}</dt>
              <dd className="text-[15px] font-semibold tabular-nums break-words">{formatPercent(selected.shareOfExpense, 1)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] text-muted">{labels.transactionsCount}</dt>
              <dd className="text-[15px] font-semibold tabular-nums break-words">{selected.transactionCount}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] text-muted">{labels.previousPeriod}</dt>
              <dd className={clsx('text-[13px] font-semibold leading-snug break-words', deltaClass)}>{formatCategoryDelta(selected, labels)}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
};
