import React, { Suspense, useState, useMemo, useRef, useCallback } from 'react';
import { motion, Variants } from 'motion/react';
import { exportToCSV } from '../services/storageService';
import { AppState, Transaction, TransactionType } from '../types';
import { parseTransaction, isAIAvailable, ParsedTransaction } from '../services/aiService';
import { ConfirmDialog } from './ConfirmDialog';
import { TransactionsToolbar } from './transactions/TransactionsToolbar';
import { TransactionsList } from './transactions/TransactionsList';
import { TransactionsFab } from './transactions/TransactionsFab';
import { DuplicateHintBanner } from './transactions/DuplicateHintBanner';
import { filterTransactions, groupTransactionsByDate } from '../utils/transactionFilters';
import {
  CommonFilterId,
  CommonTransactionFilter,
  detectDuplicateTransactionGroups,
  getBatchDeleteSafetySummary,
  getCommonTransactionFilters,
  UNCATEGORIZED_FILTER,
} from '../utils/qolSuggestions';

const ExportModal = React.lazy(() => import('./ExportModal').then(m => ({ default: m.ExportModal })));

interface TransactionsViewProps {
  state: AppState;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  setIsEditModalOpen: (isOpen: boolean) => void;
  setIsReceiptModalOpen: (isOpen: boolean) => void;
  setIsSplitModalOpen: (isOpen: boolean) => void;
  deleteTransaction: (id: string) => void;
  onEditSplitTransaction?: (transaction: Transaction) => void;
  onDuplicateTransaction?: (transaction: Transaction) => void;
  onParsedTransaction?: (parsed: ParsedTransaction) => void;
  onSaveAsTemplate?: (transaction: Transaction) => void;
  onBatchDelete?: (ids: string[]) => void;
  onAddTransaction?: () => void;
  onOpenSplit?: () => void;
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
  setIsReceiptModalOpen,
  setIsSplitModalOpen,
  deleteTransaction,
  onEditSplitTransaction,
  onDuplicateTransaction,
  onParsedTransaction,
  onSaveAsTemplate,
  onBatchDelete,
  onAddTransaction,
  onOpenSplit,
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
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dismissedDuplicateGroupIds, setDismissedDuplicateGroupIds] = useState<Set<string>>(new Set());
  const [isScrolled, setIsScrolled] = useState(false);
  const lastScrollTop = useRef(0);
  const aiAvailable = isAIAvailable();

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = (event.target as HTMLDivElement).scrollTop;
    const scrollDelta = scrollTop - lastScrollTop.current;

    setIsScrolled(scrollTop > 20);

    if (Math.abs(scrollDelta) > 5) {
      if (scrollDelta > 0 && scrollTop > 50) {
        setIsFabVisible(false);
        setIsFabOpen(false);
      } else {
        setIsFabVisible(true);
      }
    }

    lastScrollTop.current = scrollTop;
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
      const result = await parseTransaction(smartInput, state.categories, state.accounts, state.people);
      if (result) {
        onParsedTransaction(result);
        setSmartInput('');
      } else {
        setParseError(state.language === 'sr' ? 'Nisam uspeo da protumacim unos.' : 'Could not parse that input.');
      }
    } catch {
      setParseError(state.language === 'sr' ? 'Nisam uspeo da protumacim unos.' : 'Could not parse that input.');
    } finally {
      setIsParsing(false);
    }
  };

  const filteredTransactions = useMemo(() => filterTransactions({
    transactions: state.transactions,
    categories: state.categories,
    accounts: state.accounts,
    filterType,
    filterAccount,
    filterCategory,
    filterDateFrom,
    filterDateTo,
    searchQuery,
  }), [state.transactions, state.categories, state.accounts, filterType, filterAccount, filterCategory, filterDateFrom, filterDateTo, searchQuery]);

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
    if (typeof filter.patch.showDateFilter === 'boolean') {
      setShowDateFilter(isActive ? false : filter.patch.showDateFilter);
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
    setShowDateFilter(false);
  };

  const reviewDuplicateGroup = (group: (typeof duplicateGroups)[number]) => {
    clearAllFilters();
    setIsSelectionMode(true);
    setSelectedIds(new Set(group.transactions.map(transaction => transaction.id)));
  };

  const groupedData = useMemo(() => groupTransactionsByDate(filteredTransactions, state.language), [filteredTransactions, state.language]);
  const groupCounts = useMemo(() => groupedData.map(group => group.transactions.length), [groupedData]);
  const flatTransactions = useMemo(() => groupedData.flatMap(group => group.transactions), [groupedData]);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="h-[calc(100vh-140px)] flex flex-col">
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
        setIsSelectionMode={setIsSelectionMode}
        selectedCount={selectedIds.size}
        allSelected={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
        hasSelection={selectedIds.size > 0}
        toggleSelectAll={toggleSelectAll}
        exitSelectionMode={exitSelectionMode}
        handleBatchExport={handleBatchExport}
        handleBatchDelete={handleBatchDelete}
        isExportingPdf={isExportingPdf}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenPrintableReport={handlePdfExport}
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
        showDateFilter={showDateFilter}
        setShowDateFilter={setShowDateFilter}
        hasSearchOrFilters={hasSearchOrFilters}
        activeFilterCount={activeFilterCount}
        clearAllFilters={clearAllFilters}
        isScrolled={isScrolled}
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
        handleScroll={handleScroll}
        groupedData={groupedData}
        groupCounts={groupCounts}
        flatTransactions={flatTransactions}
        isSelectionMode={isSelectionMode}
        selectedIds={selectedIds}
        toggleSelection={toggleSelection}
        setSelectedTransaction={setSelectedTransaction}
        setIsEditModalOpen={setIsEditModalOpen}
        setIsSplitModalOpen={setIsSplitModalOpen}
        setIsReceiptModalOpen={setIsReceiptModalOpen}
        deleteTransaction={deleteTransaction}
        onEditSplitTransaction={onEditSplitTransaction}
        onDuplicateTransaction={onDuplicateTransaction}
        onSaveAsTemplate={onSaveAsTemplate}
      />

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
        title={state.language === 'sr' ? 'Obrisi transakcije' : 'Delete Transactions'}
        message={state.language === 'sr'
          ? batchDeleteSafetySummary.unsafeCount > 0
            ? `Obrisacete ${batchDeleteSafetySummary.count} transakcija. ${batchDeleteSafetySummary.unsafeCount} utice na dugove ili podele i ne moze se bezbedno vratiti.`
            : `Obrisacete ${batchDeleteSafetySummary.count} transakcija. Mozete ih vratiti odmah nakon brisanja.`
          : batchDeleteSafetySummary.unsafeCount > 0
            ? `You are deleting ${batchDeleteSafetySummary.count} transactions. ${batchDeleteSafetySummary.unsafeCount} affect people or split balances and cannot be safely undone.`
            : `You are deleting ${batchDeleteSafetySummary.count} transactions. You can undo this immediately after deletion.`}
        confirmLabel={state.language === 'sr' ? 'Obrisi' : 'Delete'}
        cancelLabel={state.language === 'sr' ? 'Otkazi' : 'Cancel'}
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
    </motion.div>
  );
};
