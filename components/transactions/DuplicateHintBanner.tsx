import React from 'react';
import { Copy, X } from 'lucide-react';
import type { DuplicateTransactionGroup } from '../../utils/qolSuggestions';
import { TRANSLATIONS } from '../../constants';
import { pluralForm } from '../../utils/plural';
import { fill } from '../home/parts';
import { ACTIVITY_STRINGS } from './activityStrings';

interface DuplicateHintBannerProps {
  language: 'en' | 'sr';
  groups: DuplicateTransactionGroup[];
  onReviewGroup: (group: DuplicateTransactionGroup) => void;
  onDismissGroup: (groupId: string) => void;
}

/** One quiet line: how many sets of entries look alike, Review selects the first set, X hides it. */
export const DuplicateHintBanner: React.FC<DuplicateHintBannerProps> = ({
  language,
  groups,
  onReviewGroup,
  onDismissGroup,
}) => {
  const group = groups[0];
  if (!group) {
    return null;
  }

  const t = TRANSLATIONS[language];
  const s = ACTIVITY_STRINGS[language];
  const form = pluralForm(groups.length, language);
  const title = fill(form === 'one' ? s.dupOne : form === 'few' ? s.dupFew : s.dupMany, { count: groups.length });
  const detail = t.similarTransactionsFound.replace('{count}', String(group.transactions.length));

  return (
    <div className="mt-3 flex min-h-12 items-center gap-2 rounded-[18px] bg-chip pl-3.5 pr-1">
      <Copy size={18} className="shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" title={detail}>{title}</span>
      <button
        type="button"
        onClick={() => onReviewGroup(group)}
        className="h-10 shrink-0 rounded-full px-3 text-[15px] font-semibold text-accent"
      >
        {t.review}
      </button>
      <button
        type="button"
        onClick={() => onDismissGroup(group.id)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted"
        aria-label={`${s.hide}: ${detail}`}
        title={s.hide}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};
