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
            'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors',
            isActive
              ? 'bg-accent text-on-accent'
              : 'bg-[var(--paper-tile)] text-muted shadow-[var(--paper-tile-shadow)] hover:text-[var(--paper-text)]'
          )}
        >
          {filter.label}
        </button>
      );
    })}
  </>
);
