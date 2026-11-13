import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Calendar, CheckCircle2, CheckSquare, ChevronDown, Download, FileText, FileSpreadsheet, Loader2, Search, Sparkles, Square, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { AppState, TransactionType } from '../../types';
import { CommonFilterChips } from './CommonFilterChips';
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
  const t = state.language === 'sr'
    ? {
        deselectAll: 'Ponisti izbor',
        selectAll: 'Izaberi sve',
        selected: 'izabrano',
        exportSelected: 'Izvezi izabrano',
        deleteSelected: 'Obrisi izabrano',
        selectMultiple: 'Izaberi vise',
        openExport: 'Otvori opcije izvoza',
        printableReport: 'Otvori stampani izvestaj',
        searchPlaceholder: 'Pretrazi transakcije...',
        smartAddPlaceholder: 'npr. Rucak 1200 RSD iz Kesa',
        parse: 'Protumaci',
        all: 'Sve',
        expense: 'Trosak',
        income: 'Prihod',
        wallet: 'Novcanik',
        dates: 'Datum',
        dateRange: 'Period',
        clear: 'Obrisi',
      }
    : {
        deselectAll: 'Deselect all',
        selectAll: 'Select all',
        selected: 'selected',
        exportSelected: 'Export selected',
        deleteSelected: 'Delete selected',
        selectMultiple: 'Select multiple',
        openExport: 'Open export options',
        printableReport: 'Open printable report',
        searchPlaceholder: 'Search transactions...',
        smartAddPlaceholder: 'e.g. Lunch 20 EUR from Cash',
        parse: 'Parse',
        all: 'All',
        expense: 'Expense',
        income: 'Income',
        wallet: 'Wallet',
        dates: 'Dates',
        dateRange: 'Date range',
        clear: 'Clear',
      };

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
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  {allSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  {allSelected ? t.deselectAll : t.selectAll}
                </button>
                <span className="text-sm text-on-surface-variant">
                  {selectedCount} {t.selected}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasSelection && (
                  <>
                    <button
                      onClick={handleBatchExport}
                      className="p-2 bg-tertiary/20 text-tertiary hover:bg-tertiary/30 rounded-lg transition-colors"
                      title={t.exportSelected}
                    >
                      <FileSpreadsheet size={18} />
                    </button>
                    <button
                      onClick={handleBatchDelete}
                      className="p-2 bg-error/20 text-error hover:bg-error/30 rounded-lg transition-colors"
                      title={t.deleteSelected}
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
                <button onClick={exitSelectionMode} className="p-2 hover:bg-surface-container rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div className={clsx('flex justify-between items-center transition-all duration-200', isScrolled ? 'mb-2' : 'mb-3')}>
        <h2 className={clsx('font-display font-medium text-on-surface transition-all duration-200', isScrolled ? 'text-lg' : 'text-2xl')}>
          {state.language === 'sr' ? 'Transakcije' : 'Transactions'}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={clsx(
              'p-2 rounded-full transition-colors',
              isSelectionMode ? 'bg-primary text-on-primary' : 'hover:bg-surface-container-high text-on-surface-variant'
            )}
            title={t.selectMultiple}
          >
            <CheckCircle2 size={18} />
          </button>
          <button
            onClick={onOpenExportModal}
            className="p-2 hover:bg-surface-container-high text-on-surface-variant rounded-full transition-colors"
            title={state.language === 'sr' ? 'Izvoz' : 'Export'}
            aria-label={t.openExport}
          >
            <Download size={18} />
          </button>
          <button
            onClick={onOpenPrintableReport}
            disabled={isExportingPdf}
            className="p-2 hover:bg-surface-container-high text-on-surface-variant rounded-full transition-colors"
            title="Export PDF"
            aria-label={t.printableReport}
          >
            {isExportingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
          </button>
        </div>
      </div>

      <div className="relative mb-2">
        <div className="relative">
          {inputMode === 'search' ? (
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
          ) : (
            <Sparkles size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/60" />
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
              'w-full bg-surface-container border border-outline-variant/30 rounded-2xl pl-10 pr-20 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all',
              inputMode === 'add' && 'border-primary/30 bg-primary/5'
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {inputMode === 'add' && (
              <button
                onClick={onSmartParse}
                disabled={!smartInput.trim() || isParsing}
                className="px-2.5 py-1.5 bg-primary text-on-primary rounded-xl text-xs font-medium disabled:opacity-50 transition-colors"
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
                'p-2 rounded-xl transition-colors',
                inputMode === 'add' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
              )}
              title={inputMode === 'search' ? 'Smart add' : 'Search'}
            >
              {inputMode === 'search' ? <Sparkles size={16} /> : <Search size={16} />}
            </button>
          </div>
        </div>
        {inputMode === 'add' && parseError && (
          <p className="text-xs text-error mt-2 px-1">{parseError}</p>
        )}
        {inputMode === 'add' && !aiAvailable && (
          <p className="text-xs text-error mt-2 px-1">
            {state.language === 'sr' ? 'AI nije dostupan.' : 'AI is not available.'}
          </p>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => {
            setFilterType('all');
            setFilterCategory('all');
          }}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 min-h-[32px]',
            filterType === 'all' && filterCategory === 'all'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-surface-container text-on-surface-variant border border-transparent hover:bg-surface-container-high'
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
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container text-on-surface-variant border border-transparent hover:bg-surface-container-high transition-colors shrink-0 min-h-[32px]"
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
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 min-h-[32px]',
            (filterDateFrom || filterDateTo)
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-surface-container text-on-surface-variant border border-transparent hover:bg-surface-container-high'
          )}
        >
          <Calendar size={12} />
          {filterDateFrom || filterDateTo ? t.dateRange : t.dates}
          <ChevronDown size={10} className={clsx('opacity-50 transition-transform', showDateFilter && 'rotate-180')} />
        </button>
        {hasSearchOrFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-error/80 hover:text-error hover:bg-error/10 transition-colors shrink-0 min-h-[32px]"
          >
            <X size={12} />
            {t.clear}
            {activeFilterCount > 0 && (
              <span className="bg-error/15 text-error px-1.5 py-0.5 rounded-full text-[10px] font-bold">
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
                className="flex-1 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface"
              />
              <span className="text-xs text-on-surface-variant">-&gt;</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(event) => setFilterDateTo(event.target.value)}
                className="flex-1 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface"
              />
              {(filterDateFrom || filterDateTo) && (
                <button
                  onClick={() => {
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                  className="p-2 hover:bg-surface-container rounded-lg"
                >
                  <X size={14} className="text-on-surface-variant" />
                </button>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
