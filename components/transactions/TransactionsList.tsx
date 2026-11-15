import React, { useEffect, useState } from 'react';
import { m } from 'motion/react';
import clsx from 'clsx';
import { GroupedVirtuoso, type TopItemListProps } from 'react-virtuoso';
import { CheckSquare, FilterX, Square } from 'lucide-react';
import { AppState, Transaction } from '../../types';
import { EmptyState } from '../EmptyState';
import { TransactionItem } from '../TransactionItem';
import { TRANSLATIONS } from '../../constants';
import { getCountedExpenseAmount, getCountedIncomeAmount } from '../../domain/money';
import { formatNumber } from '../../utils/locale';
import { localizeCategoryName, localizeTransactionNote } from '../../utils/systemText';
import type { DayGroup } from '../../utils/transactionFilters';
import { openTransactionDetails } from '../transaction-details/detailsBus';

/** Day totals in the base currency, counted the same way as Home and Insights, without the currency code. */
const groupTotals = (transactions: Transaction[], state: AppState) => {
  let spent = 0;
  let income = 0;
  for (const transaction of transactions) {
    spent += getCountedExpenseAmount(transaction, state.baseCurrency, state.rates);
    income += getCountedIncomeAmount(transaction, state.baseCurrency, state.rates);
  }
  const format = (value: number) => {
    const digits = state.baseCurrency === 'RSD' || value >= 100 ? 0 : 2;
    return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits }, state.language);
  };
  return {
    spent: spent > 0.004 ? `−${format(spent)}` : null,
    income: income > 0.004 ? `+${format(income)}` : null,
  };
};

/** The sticky day header sits below the status bar on phones (the list scrolls with the page). */
const TopItemList = React.forwardRef<HTMLDivElement, TopItemListProps>(({ style, ...props }, ref) => (
  <div ref={ref} {...props} style={{ ...style, top: 'env(safe-area-inset-top)' }} />
));
TopItemList.displayName = 'TopItemList';

const VIRTUOSO_COMPONENTS = { TopItemList };

interface TransactionsListProps {
  state: AppState;
  filteredTransactions: Transaction[];
  hasAnyTransactions: boolean;
  hasSearchOrFilters: string | boolean;
  searchQuery: string;
  clearAllFilters: () => void;
  onAddTransaction?: () => void;
  groupedData: DayGroup[];
  groupCounts: number[];
  flatTransactions: Transaction[];
  isSelectionMode: boolean;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  setIsEditModalOpen: (isOpen: boolean) => void;
  setIsSplitModalOpen: (isOpen: boolean) => void;
  deleteTransaction: (id: string) => void;
  onEditSplitTransaction?: (transaction: Transaction) => void;
  onDuplicateTransaction?: (transaction: Transaction) => void;
  onSaveAsTemplate?: (transaction: Transaction) => void;
}

export const TransactionsList: React.FC<TransactionsListProps> = ({
  state,
  filteredTransactions,
  hasAnyTransactions,
  hasSearchOrFilters,
  searchQuery,
  clearAllFilters,
  onAddTransaction,
  groupedData,
  groupCounts,
  flatTransactions,
  isSelectionMode,
  selectedIds,
  toggleSelection,
  setSelectedTransaction,
  setIsEditModalOpen,
  setIsSplitModalOpen,
  deleteTransaction,
  onEditSplitTransaction,
  onDuplicateTransaction,
  onSaveAsTemplate,
}) => {
  // The page scrolls as one (header, search, list), so the list virtualises against the app's main scroller.
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setScrollParent(document.getElementById('main-content'));
  }, []);

  if (filteredTransactions.length === 0) {
    return hasAnyTransactions && hasSearchOrFilters ? (
      <EmptyState
        illustration="search"
        title={TRANSLATIONS[state.language].noMatchesFound}
        description={
          searchQuery
            ? TRANSLATIONS[state.language].noTransactionsMatch.replace('{query}', searchQuery)
            : TRANSLATIONS[state.language].tryAdjustingFilters
        }
        action={{
          label: TRANSLATIONS[state.language].clearAllFilters,
          onClick: clearAllFilters,
          icon: FilterX,
        }}
      />
    ) : (
      <EmptyState
        illustration="transactions"
        title={TRANSLATIONS[state.language].noTransactionsYet}
        description={TRANSLATIONS[state.language].startTracking}
        action={onAddTransaction ? {
          label: TRANSLATIONS[state.language].addTransaction,
          onClick: onAddTransaction,
        } : undefined}
      />
    );
  }

  if (!scrollParent) return null;

  return (
    <GroupedVirtuoso
      customScrollParent={scrollParent}
      components={VIRTUOSO_COMPONENTS}
      groupCounts={groupCounts}
      groupContent={index => {
        const group = groupedData[index];
        const count = group?.transactions.length ?? 0;
        const countLabel = `${count} ${count === 1
          ? TRANSLATIONS[state.language].transactionSingular
          : TRANSLATIONS[state.language].transactionPlural}`;
        const totals = group ? groupTotals(group.transactions, state) : { spent: null, income: null };
        return (
          <div className="z-10 bg-paper/95 px-2 pb-2 pt-4 backdrop-blur-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="min-w-0 truncate text-[16px] tracking-[-0.2px]">
                <span className="font-bold">{group?.label}</span>
                {group?.detail && <span className="font-medium text-muted"> · {group.detail}</span>}
                <span className="sr-only">, {countLabel}</span>
              </h2>
              <span className="flex shrink-0 items-baseline gap-2 text-[14px] font-semibold tabular-nums">
                {totals.income && <span className="text-pos">{totals.income}</span>}
                {totals.spent && <span className="text-muted">{totals.spent}</span>}
              </span>
            </div>
          </div>
        );
      }}
      itemContent={index => {
        const transaction = flatTransactions[index];
        if (!transaction) {
          return null;
        }

        const category = state.categories.find(item => item.id === transaction.categoryId) || state.categories[0];
        const account = state.accounts.find(item => item.id === transaction.accountId) || state.accounts[0];
        const person = transaction.personId ? state.people.find(item => item.id === transaction.personId) : undefined;
        const event = transaction.eventId ? state.events.find(item => item.id === transaction.eventId) : undefined;

        let consumed = 0;
        let positionInGroup = 0;
        let groupSize = 1;
        for (let groupIndex = 0; groupIndex < groupCounts.length; groupIndex += 1) {
          if (index < consumed + groupCounts[groupIndex]) {
            positionInGroup = index - consumed;
            groupSize = groupCounts[groupIndex];
            break;
          }
          consumed += groupCounts[groupIndex];
        }

        const isFirst = positionInGroup === 0;
        const isLast = positionInGroup === groupSize - 1;

        return (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
            className={clsx('px-1', isLast && 'pb-2')}
          >
            <div
              className={clsx(
                'overflow-hidden bg-[var(--paper-tile)]',
                isFirst && 'rounded-t-[22px]',
                isLast && 'rounded-b-[22px] shadow-[var(--paper-tile-shadow)]',
              )}
            >
              <div className="flex items-center gap-2">
                {isSelectionMode && (
                  <button
                    onClick={() => toggleSelection(transaction.id)}
                    className="ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                    aria-pressed={selectedIds.has(transaction.id)}
                    aria-label={TRANSLATIONS[state.language].selectEntry.replace(
                      '{name}',
                      localizeTransactionNote(transaction.note, state.language) || (category ? localizeCategoryName(category, state.language) : '')
                    )}
                  >
                    {selectedIds.has(transaction.id) ? (
                      <CheckSquare size={22} className="text-accent" aria-hidden="true" />
                    ) : (
                      <Square size={22} className="text-muted" aria-hidden="true" />
                    )}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <TransactionItem
                    transaction={transaction}
                    category={category}
                    account={account}
                    person={person}
                    event={event}
                    state={state}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleSelection(transaction.id);
                        return;
                      }

                      openTransactionDetails(transaction.id);
                    }}
                    onSplit={() => {
                      setSelectedTransaction(transaction);
                      setIsSplitModalOpen(true);
                    }}
                    onEdit={() => {
                      setSelectedTransaction(transaction);
                      setIsEditModalOpen(true);
                    }}
                    onEditSplit={onEditSplitTransaction ? () => onEditSplitTransaction(transaction) : undefined}
                    onDelete={() => deleteTransaction(transaction.id)}
                    onDuplicate={onDuplicateTransaction ? () => onDuplicateTransaction(transaction) : undefined}
                    onSaveAsTemplate={onSaveAsTemplate ? () => onSaveAsTemplate(transaction) : undefined}
                    isLastInGroup={isLast}
                  />
                </div>
              </div>
            </div>
          </m.div>
        );
      }}
    />
  );
};
