import React, { useState } from 'react';
import { CheckSquare, FileSpreadsheet, Loader2, Search, Shapes, SlidersHorizontal, Sparkles, Square, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { AppState, TransactionType } from '../../types';
import { CommonFilterChips } from './CommonFilterChips';
import { TRANSLATIONS } from '../../constants';
import { UNCATEGORIZED_FILTER, type CommonFilterId, type CommonTransactionFilter } from '../../utils/qolSuggestions';
import { formatShortDate, getIntlLocale } from '../../utils/locale';
import { pluralForm } from '../../utils/plural';
import { localizeCategoryName } from '../../utils/systemText';
import { useBackLayer } from '../../hooks/useBackLayer';
import { GlassSheet } from '../ui/GlassSheet';
import { fill } from '../home/parts';
import { ACTIVITY_STRINGS } from './activityStrings';

interface TransactionsToolbarProps {
  state: AppState;
  filterType: 'all' | TransactionType;
  setFilterType: (value: 'all' | TransactionType) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  smartInput: string;
  setSmartInput: (value: string) => void;
  isParsing: boolean;
  parseError: string | null;
  aiAvailable: boolean;
  inputMode: 'search' | 'add';
  setInputMode: (value: 'search' | 'add') => void;
  isSelectionMode: boolean;
  selectedCount: number;
  allSelected: boolean;
  hasSelection: boolean;
  toggleSelectAll: () => void;
  exitSelectionMode: () => void;
  handleBatchExport: () => void;
  handleBatchDelete: () => void;
  /** Opens the category picker for the selected entries. */
  handleBatchCategory?: () => void;
  /** List or table (wide windows only); left out, there is no switch. */
  viewToggle?: React.ReactNode;
  onSmartParse: () => void;
  filterAccount: string;
  setFilterAccount: (value: string) => void;
  filterCategory: string;
  setFilterCategory: (value: string) => void;
  commonFilters: CommonTransactionFilter[];
  activeCommonFilterIds: Set<CommonFilterId>;
  onApplyCommonFilter: (filter: CommonTransactionFilter) => void;
  filterDateFrom: string;
  setFilterDateFrom: (value: string) => void;
  filterDateTo: string;
  setFilterDateTo: (value: string) => void;
  activeFilterCount: number;
  clearAllFilters: () => void;
  /** Entries the current search and filters show. */
  resultCount: number;
}

const chip = (active: boolean) => clsx(
  'flex h-10 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-semibold transition-colors',
  active ? 'bg-accent text-on-accent' : 'bg-[var(--paper-tile)] shadow-[var(--paper-tile-shadow)]',
);

const sectionTitle = 'text-[13px] font-semibold uppercase tracking-[0.06em] text-muted';

export const TransactionsToolbar: React.FC<TransactionsToolbarProps> = ({
  state,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
  smartInput,
  setSmartInput,
  isParsing,
  parseError,
  aiAvailable,
  inputMode,
  setInputMode,
  isSelectionMode,
  selectedCount,
  allSelected,
  hasSelection,
  toggleSelectAll,
  exitSelectionMode,
  handleBatchExport,
  handleBatchDelete,
  handleBatchCategory,
  viewToggle,
  onSmartParse,
  filterAccount,
  setFilterAccount,
  filterCategory,
  setFilterCategory,
  commonFilters,
  activeCommonFilterIds,
  onApplyCommonFilter,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  activeFilterCount,
  clearAllFilters,
  resultCount,
}) => {
  const t = TRANSLATIONS[state.language];
  const s = ACTIVITY_STRINGS[state.language];
  const [filtersOpen, setFiltersOpen] = useState(false);
  useBackLayer('activity-filters', filtersOpen, () => setFiltersOpen(false));

  const quickLabel = (id: CommonFilterId) => commonFilters.find(filter => filter.id === id)?.label ?? '';
  const categories = state.categories.filter(category => filterType === 'all' || category.type === filterType);
  const thisMonth = commonFilters.find(filter => filter.id === 'thisMonth');
  const isThisMonth = !!thisMonth && thisMonth.patch.filterDateFrom === filterDateFrom && thisMonth.patch.filterDateTo === filterDateTo;
  const day = (value: string) => new Date(`${value}T12:00:00`);
  const dateText = filterDateFrom && filterDateTo
    ? new Intl.DateTimeFormat(getIntlLocale(state.language), { day: 'numeric', month: 'short' }).formatRange(day(filterDateFrom), day(filterDateTo))
    : filterDateFrom
      ? `${t.dateFrom} ${formatShortDate(day(filterDateFrom), state.language)}`
      : `${t.dateTo} ${formatShortDate(day(filterDateTo), state.language)}`;

  // What is on, as chips under the search: tap one to drop that filter.
  const active: Array<{ id: string; label: string; clear: () => void }> = [];
  if (filterType !== 'all') {
    active.push({ id: 'type', label: quickLabel(filterType === 'income' ? 'income' : 'expenses'), clear: () => setFilterType('all') });
  }
  if (filterAccount !== 'all') {
    active.push({ id: 'wallet', label: state.accounts.find(account => account.id === filterAccount)?.name ?? t.wallet, clear: () => setFilterAccount('all') });
  }
  if (filterCategory !== 'all') {
    const category = state.categories.find(item => item.id === filterCategory);
    active.push({
      id: 'category',
      label: filterCategory === UNCATEGORIZED_FILTER ? quickLabel('uncategorized') : category ? localizeCategoryName(category, state.language) : s.category,
      clear: () => setFilterCategory('all'),
    });
  }
  if (filterDateFrom || filterDateTo) {
    active.push({
      id: 'dates',
      label: isThisMonth ? quickLabel('thisMonth') : dateText,
      clear: () => {
        setFilterDateFrom('');
        setFilterDateTo('');
      },
    });
  }

  const showForm = pluralForm(resultCount, state.language);
  const showLabel = fill(showForm === 'one' ? s.showOne : showForm === 'few' ? s.showFew : s.showMany, { count: resultCount });

  return (
    <div className="flex-none pb-1">
      {isSelectionMode ? (
        <div className="paper-tile flex min-h-12 items-center justify-between gap-2 px-3 py-1">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex h-10 items-center gap-2 whitespace-nowrap text-[14px] font-semibold text-accent"
            >
              {allSelected ? <CheckSquare size={18} aria-hidden="true" /> : <Square size={18} aria-hidden="true" />}
              {allSelected ? t.deselectAll : t.selectAll}
            </button>
            <span className="truncate text-[14px] text-muted">
              {selectedCount} {t.selected}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasSelection && (
              <>
                {handleBatchCategory && (
                  <button
                    type="button"
                    onClick={handleBatchCategory}
                    aria-label={s.changeCategory}
                    title={s.changeCategory}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-chip"
                  >
                    <Shapes size={18} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBatchExport}
                  aria-label={t.exportSelected}
                  title={t.exportSelected}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-chip"
                >
                  <FileSpreadsheet size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  aria-label={t.deleteSelected}
                  title={t.deleteSelected}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-chip text-neg"
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </>
            )}
            <button type="button" onClick={exitSelectionMode} aria-label={t.close} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-chip">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            {inputMode === 'search' ? (
              <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            ) : (
              <Sparkles size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
            )}
            <input
              type="text"
              data-shortcut-search=""
              value={inputMode === 'search' ? searchQuery : smartInput}
              onChange={(event) => {
                if (inputMode === 'search') {
                  setSearchQuery(event.target.value);
                  return;
                }
                setSmartInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && inputMode === 'add' && smartInput.trim() && !isParsing) {
                  onSmartParse();
                }
              }}
              placeholder={inputMode === 'search' ? s.search : t.smartAddPlaceholder}
              aria-label={inputMode === 'search' ? t.search : t.smartAdd}
              className={clsx(
                'h-12 w-full rounded-full border-none bg-[var(--paper-tile)] pl-11 text-[16px] shadow-[var(--paper-tile-shadow)] placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent',
                inputMode === 'add' ? 'pr-32 ring-2 ring-accent' : searchQuery ? 'pr-[92px]' : 'pr-14',
              )}
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
              {inputMode === 'search' && searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t.clear}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-chip"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              )}
              {inputMode === 'add' && (
                <button
                  type="button"
                  onClick={onSmartParse}
                  disabled={!smartInput.trim() || isParsing}
                  className="h-10 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-on-accent disabled:opacity-40"
                >
                  {isParsing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : t.parse}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setInputMode(inputMode === 'search' ? 'add' : 'search');
                  setSearchQuery('');
                  setSmartInput('');
                }}
                className={clsx(
                  'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                  inputMode === 'add' ? 'bg-accent-soft text-accent' : 'text-accent hover:bg-chip',
                )}
                title={inputMode === 'search' ? t.smartAdd : t.search}
                aria-label={inputMode === 'search' ? t.smartAdd : t.search}
              >
                {inputMode === 'search' ? <Sparkles size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label={activeFilterCount > 0 ? fill(s.filtersOn, { count: activeFilterCount }) : s.filters}
            aria-haspopup="dialog"
            className={clsx(
              'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-visible rounded-full shadow-[var(--paper-tile-shadow)]',
              activeFilterCount > 0 ? 'bg-accent text-on-accent' : 'bg-[var(--paper-tile)]',
            )}
          >
            <SlidersHorizontal size={19} aria-hidden="true" />
            {activeFilterCount > 0 && (
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--paper-text)] px-1 text-[11px] font-bold text-[var(--paper-bg)]">
                {activeFilterCount}
              </span>
            )}
          </button>
          {viewToggle}
        </div>
      )}

      {inputMode === 'add' && parseError && <p className="mt-2 px-4 text-[13px] text-neg">{parseError}</p>}
      {inputMode === 'add' && !aiAvailable && <p className="mt-2 px-4 text-[13px] text-neg">{t.aiUnavailable}</p>}

      {!isSelectionMode && active.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {active.map(filter => (
            <button
              key={filter.id}
              type="button"
              onClick={filter.clear}
              aria-label={fill(s.removeFilter, { name: filter.label })}
              className="flex h-10 max-w-full items-center gap-1.5 rounded-full bg-accent-soft pl-3.5 pr-2.5 text-[14px] font-semibold text-accent"
            >
              <span className="truncate">{filter.label}</span>
              <X size={15} aria-hidden="true" className="shrink-0" />
            </button>
          ))}
          {active.length > 1 && (
            <button type="button" onClick={clearAllFilters} className="flex h-10 items-center rounded-full px-3 text-[14px] font-semibold text-muted">
              {s.clearAll}
            </button>
          )}
        </div>
      )}

      <GlassSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={s.filters}
        closeLabel={t.close}
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={activeFilterCount === 0 && !searchQuery}
              className="h-12 shrink-0 rounded-full px-4 text-[15px] font-semibold text-muted disabled:opacity-40"
            >
              {s.clearAll}
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="h-12 min-w-0 flex-1 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent"
            >
              {showLabel}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-6 pb-1">
          <section className="flex flex-col gap-2.5">
            <h3 className={sectionTitle}>{s.quickPicks}</h3>
            <div className="flex flex-wrap gap-2">
              <CommonFilterChips filters={commonFilters} activeIds={activeCommonFilterIds} onApplyFilter={onApplyCommonFilter} />
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <h3 className={sectionTitle}>{t.wallet}</h3>
            <div role="radiogroup" aria-label={t.wallet} className="flex flex-wrap gap-2">
              {[{ id: 'all', name: s.anyWallet }, ...state.accounts].map(account => (
                <button
                  key={account.id}
                  type="button"
                  role="radio"
                  aria-checked={filterAccount === account.id}
                  onClick={() => setFilterAccount(account.id)}
                  className={chip(filterAccount === account.id)}
                >
                  <span className="truncate">{account.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <h3 className={sectionTitle}>{s.category}</h3>
            <div role="radiogroup" aria-label={s.category} className="flex flex-wrap gap-2">
              <button type="button" role="radio" aria-checked={filterCategory === 'all'} onClick={() => setFilterCategory('all')} className={chip(filterCategory === 'all')}>
                {s.anyCategory}
              </button>
              {categories.map(category => (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={filterCategory === category.id}
                  onClick={() => setFilterCategory(category.id)}
                  className={chip(filterCategory === category.id)}
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: category.color }} />
                  <span className="truncate">{localizeCategoryName(category, state.language)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <h3 className={sectionTitle}>{s.dates}</h3>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="transactions-date-from" className="mb-1 block px-1 text-[12px] font-semibold text-muted">{t.dateFrom}</label>
                <input
                  id="transactions-date-from"
                  type="date"
                  value={filterDateFrom}
                  max={filterDateTo || undefined}
                  onChange={(event) => setFilterDateFrom(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-[14px] border-none bg-[var(--paper-tile)] px-3 text-[15px] shadow-[var(--paper-tile-shadow)]"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="transactions-date-to" className="mb-1 block px-1 text-[12px] font-semibold text-muted">{t.dateTo}</label>
                <input
                  id="transactions-date-to"
                  type="date"
                  value={filterDateTo}
                  min={filterDateFrom || undefined}
                  onChange={(event) => setFilterDateTo(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-[14px] border-none bg-[var(--paper-tile)] px-3 text-[15px] shadow-[var(--paper-tile-shadow)]"
                />
              </div>
            </div>
          </section>
        </div>
      </GlassSheet>
    </div>
  );
};
