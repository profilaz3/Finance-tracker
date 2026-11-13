import React from 'react';
import type { AnalyticsCategorySummary } from '../../utils/analyticsSelectors';
import type { Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { formatPercent } from '../../utils/locale';

export interface CategoryDrilldownPanelProps {
  categories: AnalyticsCategorySummary[];
  selectedCategoryId: string | null;
  baseCurrency: Currency;
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
    : ` - ${selected.delta.direction === 'down' ? labels.improved : labels.worsened}`;

  return `${selected.delta.absolute >= 0 ? '+' : ''}${formatPercent(selected.delta.percentage, 1)} ${labels.previousPeriod}${toneLabel}`;
};

export const CategoryDrilldownPanel: React.FC<CategoryDrilldownPanelProps> = ({
  categories,
  selectedCategoryId,
  baseCurrency,
  labels,
  onSelectCategory,
}) => {
  const selected = categories.find(category => category.categoryId === selectedCategoryId) ?? categories[0];

  return (
    <div className="rounded-xl bg-surface-container-low border border-outline/10 p-4 sm:p-5 shadow-elevation-1 min-w-0">
      <h3 className="text-lg font-medium text-on-surface break-words">{labels.topCategories}</h3>
      {categories.length === 0 ? (
        <p className="text-sm text-on-surface-variant mt-3 break-words">{labels.noData}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {categories.map(category => (
            <button
              type="button"
              key={category.categoryId}
              onClick={() => onSelectCategory(category.categoryId)}
              aria-pressed={category.categoryId === selected?.categoryId}
              className="min-h-[44px] min-w-0 rounded-lg bg-surface-container p-3 text-left flex items-start sm:items-center justify-between gap-3 hover:bg-surface-container-high transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-on-surface break-words">{category.name}</span>
                <span className="block text-xs text-on-surface-variant break-words">
                  {category.transactionCount} {labels.transactionsCount}
                </span>
              </span>
              <span className="min-w-0 text-sm font-medium text-on-surface text-right break-words">
                {formatCurrency(category.amount, baseCurrency)}
              </span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="mt-4 rounded-lg bg-surface-container p-3 min-w-0">
          <p className="text-xs text-on-surface-variant break-words">{labels.selectedCategory}</p>
          <p className="text-base font-medium text-on-surface break-words">{selected.name}</p>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm min-w-0">
            <div className="min-w-0">
              <dt className="text-xs text-on-surface-variant break-words">{labels.periodSpend}</dt>
              <dd className="font-medium text-on-surface break-words">{formatCurrency(selected.amount, baseCurrency)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-on-surface-variant break-words">{labels.previousPeriod}</dt>
              <dd className="font-medium text-on-surface break-words">{formatCategoryDelta(selected, labels)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-on-surface-variant break-words">{labels.transactionsCount}</dt>
              <dd className="font-medium text-on-surface break-words">{selected.transactionCount}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-on-surface-variant break-words">{labels.shareOfExpenses}</dt>
              <dd className="font-medium text-on-surface break-words">{formatPercent(selected.shareOfExpense, 1)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
};
