import React, { Suspense, useContext, useMemo, useState } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { m, Variants } from 'motion/react';
import { exportToCSV } from '../services/storageService';
import { AppState, Category, Transaction, TransactionType } from '../types';
import { isAIAvailable, ParsedTransaction } from '../services/aiService';
import { parseWithHabits } from '../services/smartEntry';
import { ConfirmDialog } from './ConfirmDialog';
import { TRANSLATIONS } from '../constants';
import { TransactionsToolbar } from './transactions/TransactionsToolbar';
import { ActivityDetailsPane } from './transactions/ActivityDetailsPane';
import { BulkCategorySheet } from './transactions/BulkCategorySheet';
import { TransactionsTable } from './transactions/TransactionsTable';
import { List, Table2 } from 'lucide-react';
import { CONFIG } from '../config';
import { ACTIVITY_STRINGS } from './transactions/activityStrings';
import { recategorizableKinds, recategorize, undoRecategorize, type PreviousCategory } from '../domain/bulkCategory';
import { commitTransactionChanges } from '../services/transactionCommit';
import { pluralForm } from '../utils/plural';
import { fill } from './home/parts';
import { localizeCategoryName } from '../utils/systemText';
import { DETAILS_PANE_QUERY } from './transaction-details/detailsBus';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { PageActiveContext } from '../hooks/useBackLayer';
import { TransactionsList } from './transactions/TransactionsList';
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
  onOpenCalendar?: () => void;
  /** The entry open in the side pane (wide windows). */
  paneDetailsId?: string | null;
  /** For changing the category of the selected entries (with undo). */
  setState?: React.Dispatch<React.SetStateAction<AppState>>;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info', action?: { label: string; onClick: () => void }) => void;
}

const TABLE_VIEW_KEY = `${CONFIG.STORAGE_KEY}:activity-view`;

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
  onOpenCalendar,
  paneDetailsId = null,
  setState,
  onToast,
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
  const [dismissedDuplicateGroupIds, setDismissedDuplicateGroupIds] = useState<Set<string>>(new Set());
  const aiAvailable = isAIAvailable();

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

  // Change category of the selected entries: one save, a toast with Undo.
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const categoryKinds = useMemo(
    () => (isCategorySheetOpen ? recategorizableKinds(state.transactions, selectedIds) : new Set<TransactionType>()),
    [isCategorySheetOpen, state.transactions, selectedIds],
  );
  const applyCategory = async (category: Category) => {
    if (!setState) return;
    const ids = new Set(selectedIds);
    const s = ACTIVITY_STRINGS[state.language];
    const t = TRANSLATIONS[state.language];
    let skipped = 0;
    let previous = new Map<string, PreviousCategory>();
    setIsCategorySheetOpen(false);
    exitSelectionMode();
    const { rows, synced } = await commitTransactionChanges(setState, current => {
      const result = recategorize(current, ids, category);
      skipped = result.skipped;
      previous = result.previous;
      return result.rows;
    });
    const skippedNote = skipped > 0 ? fill(s.skippedNote, { count: skipped }) : '';
    if (rows.length === 0) {
      onToast?.([s.movedNone, skippedNote].filter(Boolean).join(' · '), 'info');
      return;
    }
    const form = pluralForm(rows.length, state.language);
    const moved = fill(form === 'one' ? s.movedOne : form === 'few' ? s.movedFew : s.movedMany, {
      count: rows.length,
      name: localizeCategoryName(category, state.language),
    });
    // Saved here but not on the server (offline queue or a refusal): say so instead of claiming success.
    onToast?.(synced ? [moved, skippedNote].filter(Boolean).join(' · ') : t.cleanupSyncFailed, synced ? 'success' : 'warning', {
      label: t.undo,
      onClick: () => void commitTransactionChanges(setState, current => undoRecategorize(current, previous, category.id)),
    });
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
  const entryIds = useMemo(() => flatTransactions.map(transaction => transaction.id), [flatTransactions]);
  // Wide windows: the open entry sits beside the list instead of popping up. A parked or peeking
  // copy of this page never takes the pane.
  const pageActive = useContext(PageActiveContext);
  const wide = useMediaQuery(DETAILS_PANE_QUERY) && pageActive;
  // Wide windows can show the list as a table instead (remembered on this device); the table uses
  // the full width, so there is no side pane with it and entries open as the pop-up card.
  const [tableView, setTableView] = useState(() => {
    try {
      return localStorage.getItem(TABLE_VIEW_KEY) === 'table';
    } catch {
      return false;
    }
  });
  const toggleTableView = () => setTableView(current => {
    try {
      localStorage.setItem(TABLE_VIEW_KEY, current ? 'list' : 'table');
    } catch {
      // Private window: the choice lasts until reload.
    }
    return !current;
  });
  const showTable = wide && tableView;
  const twoPane = wide && !tableView;
  const warnIfNotSynced = ({ rows, synced }: { rows: Transaction[]; synced: boolean }) => {
    if (rows.length > 0 && !synced) onToast?.(TRANSLATIONS[state.language].cleanupSyncFailed, 'warning');
  };
  const changeCategory = (transaction: Transaction, categoryId: string) => {
    const category = state.categories.find(item => item.id === categoryId);
    if (!setState || !category) return;
    void commitTransactionChanges(setState, current => recategorize(current, new Set([transaction.id]), category).rows).then(warnIfNotSynced);
  };
  const changeWallet = (transaction: Transaction, accountId: string) => {
    if (!setState) return;
    void commitTransactionChanges(setState, current =>
      current.filter(item => item.id === transaction.id && item.accountId !== accountId).map(item => ({ ...item, accountId }))).then(warnIfNotSynced);
  };

  return (
    <m.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="mx-auto max-w-[920px] pb-6">
      <div className={twoPane ? 'flex items-start gap-4' : undefined}>
        <div className={twoPane ? 'min-w-0 flex-1' : undefined}>
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
              handleBatchCategory={setState ? () => setIsCategorySheetOpen(true) : undefined}
              viewToggle={wide && setState ? (
                <button
                  type="button"
                  onClick={toggleTableView}
                  aria-label={tableView ? ACTIVITY_STRINGS[state.language].showList : ACTIVITY_STRINGS[state.language].showTable}
                  title={tableView ? ACTIVITY_STRINGS[state.language].showList : ACTIVITY_STRINGS[state.language].showTable}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--paper-tile)] shadow-[var(--paper-tile-shadow)]"
                >
                  {tableView ? <List size={19} aria-hidden="true" /> : <Table2 size={19} aria-hidden="true" />}
                </button>
              ) : undefined}
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

            {/* The table needs rows; with none the list shows its empty states. */}
            {showTable && filteredTransactions.length > 0 ? (
              <TransactionsTable
                state={state}
                transactions={filteredTransactions}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedIds}
                toggleSelection={toggleSelection}
                onChangeCategory={changeCategory}
                onChangeWallet={changeWallet}
              />
            ) : (
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
              activeId={twoPane ? paneDetailsId : null}
            />
            )}
          </div>
        </div>
        {twoPane && <ActivityDetailsPane language={state.language} selectedId={paneDetailsId} entryIds={entryIds} />}
      </div>

      <BulkCategorySheet
        isOpen={isCategorySheetOpen}
        onClose={() => setIsCategorySheetOpen(false)}
        categories={state.categories}
        kinds={categoryKinds}
        count={selectedIds.size}
        language={state.language}
        onPick={category => void applyCategory(category)}
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
    </m.div>
  );
};
