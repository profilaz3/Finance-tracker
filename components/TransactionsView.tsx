import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { m, Variants } from 'motion/react';
import { exportToCSV } from '../services/storageService';
import { AppState, Transaction, TransactionType } from '../types';
import { isAIAvailable, ParsedTransaction } from '../services/aiService';
import { parseWithHabits } from '../services/smartEntry';
import { ConfirmDialog } from './ConfirmDialog';
import { TRANSLATIONS } from '../constants';
import { TransactionsToolbar } from './transactions/TransactionsToolbar';
import { TransactionsList } from './transactions/TransactionsList';
import { TransactionsFab } from './transactions/TransactionsFab';
import { DuplicateHintBanner } from './transactions/DuplicateHintBanner';
import { ActivityHero } from './transactions/ActivityHero';
import { filterTransactions, groupTransactionsByDay } from '../utils/transactionFilters';
import {
  CommonFilterId,
  CommonTransactionFilter,
  detectDuplicateTransactionGroups,
  getBatchDeleteSafetySummary,
  getCommonTransactionFilters,
  UNCATEGORIZED_FILTER,
} from '../utils/qolSuggestions';

const ExportModal = lazyWithReload(() => import('./ExportModal').then(m => ({ default: m.ExportModal })));

interface TransactionsViewProps {
  state: AppState;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  setIsEditModalOpen: (isOpen: boolean) => void;
  setIsSplitModalOpen: (isOpen: boolean) => void;
  deleteTransaction: (id: string) => void;
  onEditSplitTransaction?: (transaction: Transaction) => void;
  onDuplicateTransaction?: (transaction: Transaction) => void;
  onParsedTransaction?: (parsed: ParsedTransaction) => void;
  onSaveAsTemplate?: (transaction: Transaction) => void;
  onBatchDelete?: (ids: string[]) => void;
  onAddTransaction?: () => void;
  onOpenSplit?: () => void;
  onOpenCalendar?: () => void;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  state,
  setSelectedTransaction,
  setIsEditModalOpen,
  setIsSplitModalOpen,
  deleteTransaction,
  onEditSplitTransaction,
  onDuplicateTransaction,
  onParsedTransaction,
  onSaveAsTemplate,
  onBatchDelete,
  onAddTransaction,
  onOpenSplit,
  onOpenCalendar,
}) => {
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [smartInput, setSmartInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'search' | 'add'>('search');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabVisible, setIsFabVisible] = useState(true);
  const [dismissedDuplicateGroupIds, setDismissedDuplicateGroupIds] = useState<Set<string>>(new Set());
  const lastScrollTop = useRef(0);
  const aiAvailable = isAIAvailable();

  // The page scrolls as one; the desktop add button hides while scrolling down.
  useEffect(() => {
    const scroller = document.getElementById('main-content');
    if (!scroller) return;
    const onScroll = () => {
      const scrollTop = scroller.scrollTop;
      const scrollDelta = scrollTop - lastScrollTop.current;
      if (Math.abs(scrollDelta) > 5) {
        if (scrollDelta > 0 && scrollTop > 50) {
          setIsFabVisible(false);
          setIsFabOpen(false);
        } else {
          setIsFabVisible(true);
        }
      }
      lastScrollTop.current = scrollTop;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleSmartParse = async () => {
    if (!smartInput.trim() || !onParsedTransaction) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const result = await parseWithHabits(smartInput, state);
      if (result) {
        onParsedTransaction(result);
        setSmartInput('');
      } else {
        setParseError(TRANSLATIONS[state.language].couldNotParseInput);
      }
    } catch {
      setParseError(TRANSLATIONS[state.language].couldNotParseInput);
    } finally {
      setIsParsing(false);
    }
  };

  const filteredTransactions = useMemo(() => filterTransactions({
    transactions: state.transactions,
    categories: state.categories,
    accounts: state.accounts,
    people: state.people,
    filterType,
    filterAccount,
    filterCategory,
    filterDateFrom,
    filterDateTo,
    searchQuery,
  }), [state.transactions, state.categories, state.accounts, state.people, filterType, filterAccount, filterCategory, filterDateFrom, filterDateTo, searchQuery]);

  const commonFilters = useMemo(
    () => getCommonTransactionFilters(state.language),
    [state.language],
  );

  const activeCommonFilterIds = useMemo(() => {
    const ids = new Set<CommonFilterId>();
    const thisMonth = commonFilters.find(filter => filter.id === 'thisMonth');

    if (thisMonth?.patch.filterDateFrom === filterDateFrom && thisMonth.patch.filterDateTo === filterDateTo) {
      ids.add('thisMonth');
    }
    if (filterType === 'expense') {
      ids.add('expenses');
    }
    if (filterType === 'income') {
      ids.add('income');
    }
    if (filterCategory === UNCATEGORIZED_FILTER) {
      ids.add('uncategorized');
    }

    return ids;
  }, [commonFilters, filterCategory, filterDateFrom, filterDateTo, filterType]);

  const applyCommonFilter = (filter: CommonTransactionFilter) => {
    const isActive = activeCommonFilterIds.has(filter.id);

    if (filter.patch.filterType) {
      setFilterType(isActive ? 'all' : filter.patch.filterType);
    }
    if (filter.patch.filterCategory) {
      setFilterCategory(isActive ? 'all' : filter.patch.filterCategory);
    }
    if (filter.patch.filterDateFrom || filter.patch.filterDateTo) {
      setFilterDateFrom(isActive ? '' : filter.patch.filterDateFrom || '');
      setFilterDateTo(isActive ? '' : filter.patch.filterDateTo || '');
    }
    if (typeof filter.patch.searchQuery === 'string') {
      setSearchQuery(isActive ? '' : filter.patch.searchQuery);
    }
  };

  const duplicateGroups = useMemo(
    () => detectDuplicateTransactionGroups(state.transactions, state.categories)
      .filter(group => !dismissedDuplicateGroupIds.has(group.id)),
    [dismissedDuplicateGroupIds, state.categories, state.transactions],
  );

  const batchDeleteSafetySummary = useMemo(
    () => getBatchDeleteSafetySummary(state.transactions, Array.from(selectedIds)),
    [selectedIds, state.transactions],
  );
  const batchDeleteDialogKey = `${batchDeleteSafetySummary.safeToUndoCount}:${batchDeleteSafetySummary.unsafeCount}`;

  const hasActiveFilters = filterType !== 'all' || filterAccount !== 'all' || filterCategory !== 'all' || Boolean(filterDateFrom || filterDateTo);
  const hasSearchOrFilters = hasActiveFilters || Boolean(searchQuery.trim());
  const activeFilterCount = (filterType !== 'all' ? 1 : 0) + (filterAccount !== 'all' ? 1 : 0) + (filterCategory !== 'all' ? 1 : 0) + (filterDateFrom || filterDateTo ? 1 : 0);
  const hasAnyTransactions = state.transactions.length > 0;

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map(transaction => transaction.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setIsDeleteDialogOpen(true);
  };

  const confirmBatchDelete = () => {
    if (onBatchDelete) {
      onBatchDelete(Array.from(selectedIds));
    } else {
      selectedIds.forEach(id => deleteTransaction(id));
    }
    setIsDeleteDialogOpen(false);
    exitSelectionMode();
  };

  const handleBatchExport = () => {
    const selectedTransactions = filteredTransactions.filter(transaction => selectedIds.has(transaction.id));
    exportToCSV(selectedTransactions, state.categories, state.accounts, state.people);
    exitSelectionMode();
  };

  const handlePdfExport = async () => {
    setIsExportingPdf(true);
    try {
      const { exportToPDF } = await import('../utils/pdfExport');
      await exportToPDF(state.transactions, state.categories, state.accounts, state.baseCurrency);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const clearAllFilters = () => {
    setFilterType('all');
    setFilterAccount('all');
    setFilterCategory('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  };

  const reviewDuplicateGroup = (group: (typeof duplicateGroups)[number]) => {
    clearAllFilters();
    setIsSelectionMode(true);
    setSelectedIds(new Set(group.transactions.map(transaction => transaction.id)));
  };

  const groupedData = useMemo(() => groupTransactionsByDay(filteredTransactions, state.language), [filteredTransactions, state.language]);
  const groupCounts = useMemo(() => groupedData.map(group => group.transactions.length), [groupedData]);
  const flatTransactions = useMemo(() => groupedData.flatMap(group => group.transactions), [groupedData]);

  return (
    <m.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="mx-auto max-w-[920px] pb-6">
      <ActivityHero
        state={state}
        onOpenCalendar={() => onOpenCalendar?.()}
        onSelect={() => setIsSelectionMode(true)}
        onExport={() => setIsExportModalOpen(true)}
        onPrintableReport={handlePdfExport}
        isExportingPdf={isExportingPdf}
      />

      <div className="screen-sheet">
        <TransactionsToolbar
          state={state}
          filterType={filterType}
          setFilterType={setFilterType}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          smartInput={smartInput}
          setSmartInput={(value) => {
            setSmartInput(value);
            setParseError(null);
          }}
          isParsing={isParsing}
          parseError={parseError}
          aiAvailable={aiAvailable}
          inputMode={inputMode}
          setInputMode={setInputMode}
          isSelectionMode={isSelectionMode}
          selectedCount={selectedIds.size}
          allSelected={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
          hasSelection={selectedIds.size > 0}
          toggleSelectAll={toggleSelectAll}
          exitSelectionMode={exitSelectionMode}
          handleBatchExport={handleBatchExport}
          handleBatchDelete={handleBatchDelete}
          onSmartParse={handleSmartParse}
          filterAccount={filterAccount}
          setFilterAccount={setFilterAccount}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          commonFilters={commonFilters}
          activeCommonFilterIds={activeCommonFilterIds}
          onApplyCommonFilter={applyCommonFilter}
          filterDateFrom={filterDateFrom}
          setFilterDateFrom={setFilterDateFrom}
          filterDateTo={filterDateTo}
          setFilterDateTo={setFilterDateTo}
          activeFilterCount={activeFilterCount}
          clearAllFilters={clearAllFilters}
          resultCount={filteredTransactions.length}
        />

        {!isSelectionMode && !hasSearchOrFilters && duplicateGroups.length > 0 && (
          <DuplicateHintBanner
            language={state.language}
            groups={duplicateGroups}
            onReviewGroup={reviewDuplicateGroup}
            onDismissGroup={(groupId) => {
              setDismissedDuplicateGroupIds(prev => new Set(prev).add(groupId));
            }}
          />
        )}

        <TransactionsList
          state={state}
          filteredTransactions={filteredTransactions}
          hasAnyTransactions={hasAnyTransactions}
          hasSearchOrFilters={hasSearchOrFilters}
          searchQuery={searchQuery}
          clearAllFilters={clearAllFilters}
          onAddTransaction={onAddTransaction}
          groupedData={groupedData}
          groupCounts={groupCounts}
          flatTransactions={flatTransactions}
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          toggleSelection={toggleSelection}
          setSelectedTransaction={setSelectedTransaction}
          setIsEditModalOpen={setIsEditModalOpen}
          setIsSplitModalOpen={setIsSplitModalOpen}
          deleteTransaction={deleteTransaction}
          onEditSplitTransaction={onEditSplitTransaction}
          onDuplicateTransaction={onDuplicateTransaction}
          onSaveAsTemplate={onSaveAsTemplate}
        />
      </div>

      <Suspense fallback={null}>
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          state={state}
        />
      </Suspense>

      <ConfirmDialog
        key={batchDeleteDialogKey}
        isOpen={isDeleteDialogOpen}
        onConfirm={confirmBatchDelete}
        onCancel={() => setIsDeleteDialogOpen(false)}
        title={TRANSLATIONS[state.language].deleteTransactions}
        message={batchDeleteSafetySummary.unsafeCount > 0
          ? TRANSLATIONS[state.language].batchDeleteUnsafeMessage
            .replace('{count}', String(batchDeleteSafetySummary.count))
            .replace('{unsafeCount}', String(batchDeleteSafetySummary.unsafeCount))
          : TRANSLATIONS[state.language].batchDeleteUndoableMessage
            .replace('{count}', String(batchDeleteSafetySummary.count))}
        confirmLabel={TRANSLATIONS[state.language].delete}
        cancelLabel={TRANSLATIONS[state.language].cancel}
        type="danger"
      />

      <TransactionsFab
        isVisible={isFabVisible}
        isOpen={isFabOpen}
        setIsOpen={setIsFabOpen}
        language={state.language}
        onAddTransaction={onAddTransaction}
        onOpenSplit={onOpenSplit}
      />
    </m.div>
  );
};
