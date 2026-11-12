import React from 'react';
import { Bookmark, RotateCcw } from 'lucide-react';
import type { Account, Category, Transaction, TransactionTemplate } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface DashboardTemplateShortcutsProps {
  language: 'en' | 'sr';
  templates: TransactionTemplate[];
  repeatCandidate?: Transaction;
  categories: Category[];
  accounts: Account[];
  onUseTemplate?: (templateId: string) => void;
  onRepeatTransaction?: (transaction: Transaction) => void;
}

export const DashboardTemplateShortcuts: React.FC<DashboardTemplateShortcutsProps> = ({
  language,
  templates,
  repeatCandidate,
  categories,
  accounts,
  onUseTemplate,
  onRepeatTransaction,
}) => {
  if ((!templates.length || !onUseTemplate) && (!repeatCandidate || !onRepeatTransaction)) {
    return null;
  }

  const labels = language === 'sr'
    ? {
        repeat: 'Ponovi',
        templates: 'Sabloni',
      }
    : {
        repeat: 'Repeat',
        templates: 'Templates',
      };

  const categoryName = (categoryId: string) => categories.find(category => category.id === categoryId)?.name || '';
  const accountName = (accountId: string) => accounts.find(account => account.id === accountId)?.name || '';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant/70">
        <Bookmark size={14} aria-hidden="true" />
        <span>{labels.templates}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {repeatCandidate && onRepeatTransaction && (
          <button
            type="button"
            onClick={() => onRepeatTransaction(repeatCandidate)}
            className="min-w-[150px] max-w-[210px] rounded-xl bg-primary/12 border border-primary/25 px-3 py-2 text-left text-on-surface shrink-0"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <RotateCcw size={15} aria-hidden="true" />
              <span>{labels.repeat}</span>
            </div>
            <div className="mt-1 text-sm font-medium truncate">{repeatCandidate.note || categoryName(repeatCandidate.categoryId)}</div>
            <div className="text-xs text-on-surface-variant truncate">
              {formatCurrency(repeatCandidate.amount, repeatCandidate.currency)} - {accountName(repeatCandidate.accountId)}
            </div>
          </button>
        )}
        {onUseTemplate && templates.map(template => (
          <button
            key={template.id}
            type="button"
            onClick={() => onUseTemplate(template.id)}
            className="min-w-[150px] max-w-[210px] rounded-xl bg-surface-container-high border border-outline-variant/20 px-3 py-2 text-left text-on-surface shrink-0"
          >
            <div className="text-sm font-medium truncate">{template.name}</div>
            <div className="text-xs text-on-surface-variant truncate">
              {typeof template.amount === 'number' ? `${formatCurrency(template.amount, template.currency)} - ` : ''}
              {categoryName(template.categoryId)}
            </div>
            <div className="text-[11px] text-on-surface-variant/60 truncate">{accountName(template.accountId)}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
