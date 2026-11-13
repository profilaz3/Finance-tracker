import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { DuplicateTransactionGroup } from '../../utils/qolSuggestions';
import { TRANSLATIONS } from '../../constants';

interface DuplicateHintBannerProps {
  language: 'en' | 'sr';
  groups: DuplicateTransactionGroup[];
  onReviewGroup: (group: DuplicateTransactionGroup) => void;
  onDismissGroup: (groupId: string) => void;
}

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

  const extraCount = groups.length - 1;
  const t = TRANSLATIONS[language];
  const labels = {
    title: t.possibleDuplicates,
    description: `${t.similarTransactionsFound.replace('{count}', String(group.transactions.length))}${extraCount > 0 ? (extraCount === 1 ? t.plusMoreGroup : t.plusMoreGroups).replace('{count}', String(extraCount)) : ''}.`,
    review: t.review,
    dismiss: t.dismiss,
  };

  return (
    <div className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 flex items-center gap-3">
      <AlertCircle size={18} className="text-warning shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-on-surface">{labels.title}</p>
        <p className="text-xs text-on-surface-variant">{labels.description}</p>
      </div>
      <button
        type="button"
        onClick={() => onReviewGroup(group)}
        className="px-3 py-1.5 rounded-lg bg-warning text-on-warning text-xs font-medium"
      >
        {labels.review}
      </button>
      <button
        type="button"
        onClick={() => onDismissGroup(group.id)}
        className="p-2 rounded-lg hover:bg-warning/15 text-on-surface-variant"
        aria-label={labels.dismiss}
        title={labels.dismiss}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
};
