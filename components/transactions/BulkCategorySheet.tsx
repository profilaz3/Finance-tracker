import React from 'react';
import type { Category, TransactionType } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { GlassSheet } from '../ui/GlassSheet';
import { CategoryChips } from '../transaction-modal/Pickers';
import { isSystemCategoryId } from '../../domain/transactions';
import { ACTIVITY_STRINGS } from './activityStrings';

interface BulkCategorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The workspace's categories. */
  categories: Category[];
  /** Kinds among the selected entries that can change (see recategorizableKinds). */
  kinds: ReadonlySet<TransactionType>;
  count: number;
  language: 'en' | 'sr';
  onPick: (category: Category) => void;
}

/** Picks one category for all selected entries (expense categories for expenses, income for income). */
export const BulkCategorySheet: React.FC<BulkCategorySheetProps> = ({ isOpen, onClose, categories, kinds, count, language, onPick }) => {
  const t = TRANSLATIONS[language];
  const s = ACTIVITY_STRINGS[language];
  const groups = (['expense', 'income'] as const)
    .filter(kind => kinds.has(kind))
    .map(kind => [kind, categories.filter(category => category.type === kind && !isSystemCategoryId(category.id))] as const)
    .filter(([, list]) => list.length > 0);

  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title={s.changeCategory} closeLabel={t.close}>
      <p className="px-1 pb-3 text-[14px] text-muted">
        {count} {t.selected} · {s.changeCategoryHint}
      </p>
      <div className="flex flex-col gap-4 pb-2">
        {groups.map(([kind, list]) => (
          <section key={kind} aria-label={kind === 'expense' ? t.expense : t.income}>
            {groups.length > 1 && (
              <h3 className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.6px] text-muted">{kind === 'expense' ? t.expense : t.income}</h3>
            )}
            <CategoryChips categories={list} value="" onPick={onPick} language={language} t={t} />
          </section>
        ))}
      </div>
    </GlassSheet>
  );
};
