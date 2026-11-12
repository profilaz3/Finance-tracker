import React from 'react';
import clsx from 'clsx';
import type { CommonFilterId, CommonTransactionFilter } from '../../utils/qolSuggestions';

interface CommonFilterChipsProps {
  filters: CommonTransactionFilter[];
  activeIds: Set<CommonFilterId>;
  onApplyFilter: (filter: CommonTransactionFilter) => void;
}

export const CommonFilterChips: React.FC<CommonFilterChipsProps> = ({
  filters,
  activeIds,
  onApplyFilter,
}) => (
  <>
    {filters.map(filter => {
      const isActive = activeIds.has(filter.id);

      return (
        <button
          key={filter.id}
          type="button"
          aria-pressed={isActive}
          onClick={() => onApplyFilter(filter)}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 min-h-[32px]',
            isActive
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-surface-container text-on-surface-variant border border-transparent hover:bg-surface-container-high'
          )}
        >
          {filter.label}
        </button>
      );
    })}
  </>
);
