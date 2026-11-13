import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Calendar, CheckCircle2, CheckSquare, ChevronDown, Download, FileText, FileSpreadsheet, Loader2, Search, Sparkles, Square, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { AppState, TransactionType } from '../../types';
import { CommonFilterChips } from './CommonFilterChips';
import { TRANSLATIONS } from '../../constants';
import type { CommonFilterId, CommonTransactionFilter } from '../../utils/qolSuggestions';

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
  setIsSelectionMode: (value: boolean) => void;
  selectedCount: number;
  allSelected: boolean;
  hasSelection: boolean;
  toggleSelectAll: () => void;
  exitSelectionMode: () => void;
  handleBatchExport: () => void;
  handleBatchDelete: () => void;
  isExportingPdf: boolean;
  onOpenExportModal: () => void;
  onOpenPrintableReport: () => void;
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
  showDateFilter: boolean;
  setShowDateFilter: (value: boolean) => void;
  hasSearchOrFilters: boolean;
  activeFilterCount: number;
  clearAllFilters: () => void;
  isScrolled: boolean;
}

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
  setIsSelectionMode,
  selectedCount,
  allSelected,
  hasSelection,
  toggleSelectAll,
  exitSelectionMode,
  handleBatchExport,
  handleBatchDelete,
  isExportingPdf,
  onOpenExportModal,
  onOpenPrintableReport,
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
  showDateFilter,
  setShowDateFilter,
  hasSearchOrFilters,
  activeFilterCount,
  clearAllFilters,
  isScrolled,
}) => {
  const t = TRANSLATIONS[state.language];

  const filterAccountName = filterAccount !== 'all'
    ? state.accounts.find(account => account.id === filterAccount)?.name || t.wallet
    : null;

  return (
    <div className={clsx('flex-none transition-all duration-200', isScrolled ? 'pb-2' : 'pb-3')}>
      <AnimatePresence>
        {isSelectionMode && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-2"
          >
            <div className="paper-tile flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-[14px] font-semibold text-accent"
                >
                  {allSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  {allSelected ? t.deselectAll : t.selectAll}
                </button>
                <span className="text-[14px] text-muted">
                  {selectedCount} {t.selected}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasSelection && (
                  <>
                    <button
                      onClick={handleBatchExport}
                      aria-label={t.exportSelected}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-chip"
                      title={t.exportSelected}
                    >
                      <FileSpreadsheet size={18} />
                    </button>
                    <button
                      onClick={handleBatchDelete}
                      aria-label={t.deleteSelected}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-chip text-neg"
                      title={t.deleteSelected}
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
                <button onClick={exitSelectionMode} aria-label={t.close} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-chip">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div className={clsx('flex justify-between items-center transition-all duration-200', isScrolled ? 'mb-2' : 'mb-3')}>
        <h2 className={clsx('font-bold leading-tight transition-all duration-200', isScrolled ? 'text-[20px] tracking-[-0.3px]' : 'text-[28px] tracking-[-0.6px]')}>
          {t.transactions}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={clsx(
              'glass flex h-11 w-11 items-center justify-center rounded-full transition-colors',
              isSelectionMode && 'bg-accent text-on-accent'
            )}
            title={t.selectMultiple}
            aria-label={t.selectMultiple}
            aria-pressed={isSelectionMode}
          >
            <CheckCircle2 size={19} aria-hidden="true" />
          </button>
          <button
            onClick={onOpenExportModal}
            className="glass flex h-11 w-11 items-center justify-center rounded-full"
            title={t.export}
            aria-label={t.openExport}
          >
            <Download size={19} aria-hidden="true" />
          </button>
          <button
            onClick={onOpenPrintableReport}
            disabled={isExportingPdf}
            className="glass flex h-11 w-11 items-center justify-center rounded-full"
            title={t.exportPdf}
            aria-label={t.printableReport}
          >
            {isExportingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="relative mb-3">
        <div className="relative">
          {inputMode === 'search' ? (
            <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          ) : (
            <Sparkles size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" />
          )}
          <input
            type="text"
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
            placeholder={inputMode === 'search' ? t.searchPlaceholder : t.smartAddPlaceholder}
            className={clsx(
              'h-12 w-full rounded-full border-none bg-[var(--paper-tile)] pl-11 pr-24 text-[16px] shadow-[var(--paper-tile-shadow)] placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent',
              inputMode === 'add' && 'ring-2 ring-accent'
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {inputMode === 'add' && (
              <button
                onClick={onSmartParse}
                disabled={!smartInput.trim() || isParsing}
                className="h-9 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-on-accent disabled:opacity-40"
              >
                {isParsing ? <Loader2 size={14} className="animate-spin" /> : t.parse}
              </button>
            )}
            <button
              onClick={() => {
                setInputMode(inputMode === 'search' ? 'add' : 'search');
                setSearchQuery('');
                setSmartInput('');
              }}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                inputMode === 'add' ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-chip'
              )}
              title={inputMode === 'search' ? t.smartAdd : t.search}
              aria-label={inputMode === 'search' ? t.smartAdd : t.search}
            >
              {inputMode === 'search' ? <Sparkles size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {inputMode === 'add' && parseError && (
          <p className="mt-2 px-4 text-[13px] text-neg">{parseError}</p>
        )}
        {inputMode === 'add' && !aiAvailable && (
          <p className="mt-2 px-4 text-[13px] text-neg">
            {t.aiUnavailable}
          </p>
        )}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-0.5 scrollbar-hide">
        <button
          onClick={() => {
            setFilterType('all');
            setFilterCategory('all');
          }}
          className={clsx(
            'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors',
            filterType === 'all' && filterCategory === 'all'
              ? 'bg-accent text-on-accent'
              : 'bg-[var(--paper-tile)] text-muted shadow-[var(--paper-tile-shadow)] hover:text-[var(--paper-text)]'
          )}
        >
          {t.all}
        </button>
        <CommonFilterChips
          filters={commonFilters}
          activeIds={activeCommonFilterIds}
          onApplyFilter={onApplyCommonFilter}
        />
        <select
          value={filterAccount}
          onChange={(event) => setFilterAccount(event.target.value)}
          aria-label={t.wallet}
          className="h-9 shrink-0 appearance-none rounded-full border-none bg-[var(--paper-tile)] px-3.5 text-[13px] font-semibold text-muted shadow-[var(--paper-tile-shadow)]"
        >
          <option value="all">{filterAccountName || t.wallet}</option>
          {state.accounts.map(account => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowDateFilter(!showDateFilter)}
          className={clsx(
            'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors',
            (filterDateFrom || filterDateTo)
              ? 'bg-accent text-on-accent'
              : 'bg-[var(--paper-tile)] text-muted shadow-[var(--paper-tile-shadow)] hover:text-[var(--paper-text)]'
          )}
        >
          <Calendar size={14} aria-hidden="true" />
          {filterDateFrom || filterDateTo ? t.dateRange : t.dates}
          <ChevronDown size={12} aria-hidden="true" className={clsx('opacity-60 transition-transform', showDateFilter && 'rotate-180')} />
        </button>
        {hasSearchOrFilters && (
          <button
            onClick={clearAllFilters}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-neg hover:bg-chip"
          >
            <X size={14} aria-hidden="true" />
            {t.clear}
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-chip px-1.5 py-0.5 text-[11px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showDateFilter && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 items-center pt-2">
              <input
                type="date"
                value={filterDateFrom}
                onChange={(event) => setFilterDateFrom(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-[14px] border-none bg-[var(--paper-tile)] px-3 text-[15px] shadow-[var(--paper-tile-shadow)]"
              />
              <span className="text-[13px] text-faint" aria-hidden="true">&rarr;</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(event) => setFilterDateTo(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-[14px] border-none bg-[var(--paper-tile)] px-3 text-[15px] shadow-[var(--paper-tile-shadow)]"
              />
              {(filterDateFrom || filterDateTo) && (
                <button
                  onClick={() => {
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-chip"
                  aria-label={t.clear}
                >
                  <X size={16} aria-hidden="true" className="text-muted" />
                </button>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
