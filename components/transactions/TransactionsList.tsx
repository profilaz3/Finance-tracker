import React from 'react';
import { m } from 'motion/react';
import clsx from 'clsx';
import { GroupedVirtuoso } from 'react-virtuoso';
import { CheckSquare, Receipt, SearchX, Square } from 'lucide-react';
import { AppState, Transaction } from '../../types';
import { EmptyState } from '../EmptyState';
import { TransactionItem } from '../TransactionItem';
import { TRANSLATIONS } from '../../constants';

interface TransactionGroup {
  label: string;
  transactions: Transaction[];
}

interface TransactionsListProps {
  state: AppState;
  filteredTransactions: Transaction[];
  hasAnyTransactions: boolean;
  hasSearchOrFilters: string | boolean;
  searchQuery: string;
  clearAllFilters: () => void;
  onAddTransaction?: () => void;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  groupedData: TransactionGroup[];
  groupCounts: number[];
  flatTransactions: Transaction[];
  isSelectionMode: boolean;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  setIsEditModalOpen: (isOpen: boolean) => void;
  setIsSplitModalOpen: (isOpen: boolean) => void;
  setIsReceiptModalOpen: (isOpen: boolean) => void;
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
  handleScroll,
  groupedData,
  groupCounts,
  flatTransactions,
  isSelectionMode,
  selectedIds,
  toggleSelection,
  setSelectedTransaction,
  setIsEditModalOpen,
  setIsSplitModalOpen,
  setIsReceiptModalOpen,
  deleteTransaction,
  onEditSplitTransaction,
  onDuplicateTransaction,
  onSaveAsTemplate,
}) => (
  <div className="flex-1 min-h-0">
    {filteredTransactions.length === 0 ? (
      hasAnyTransactions && hasSearchOrFilters ? (
        <EmptyState
          icon={SearchX}
          title={TRANSLATIONS[state.language].noMatchesFound}
          description={
            searchQuery
              ? TRANSLATIONS[state.language].noTransactionsMatch.replace('{query}', searchQuery)
              : TRANSLATIONS[state.language].tryAdjustingFilters
          }
          action={{
            label: TRANSLATIONS[state.language].clearAllFilters,
            onClick: clearAllFilters,
          }}
        />
      ) : (
        <EmptyState
          icon={Receipt}
          title={TRANSLATIONS[state.language].noTransactionsYet}
          description={TRANSLATIONS[state.language].startTracking}
          action={onAddTransaction ? {
            label: TRANSLATIONS[state.language].addTransaction,
            onClick: onAddTransaction,
          } : undefined}
        />
      )
    ) : (
      <GroupedVirtuoso
        style={{ height: '100%' }}
        onScroll={handleScroll}
        groupCounts={groupCounts}
        groupContent={index => (
          <div className="sticky top-[env(safe-area-inset-top)] md:top-0 z-10 px-1 py-2 bg-surface/95 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-primary">{groupedData[index]?.label}</span>
              <div className="flex-1 h-px bg-gradient-to-r from-outline-variant/30 to-transparent" />
              <span className="text-xs text-on-surface-variant/60 bg-surface-container px-2 py-0.5 rounded-full">
                {groupedData[index]?.transactions.length} {groupedData[index]?.transactions.length === 1
                  ? TRANSLATIONS[state.language].transactionSingular
                  : TRANSLATIONS[state.language].transactionPlural}
              </span>
            </div>
          </div>
        )}
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
                  'bg-surface-container overflow-hidden',
                  isFirst && 'rounded-t-2xl shadow-elevation-1',
                  isLast && 'rounded-b-2xl shadow-elevation-1',
                  !isFirst && !isLast && 'shadow-none'
                )}
              >
                <div className="flex items-center gap-2">
                  {isSelectionMode && (
                    <button onClick={() => toggleSelection(transaction.id)} className="flex-shrink-0 p-1">
                      {selectedIds.has(transaction.id) ? (
                        <CheckSquare size={22} className="text-primary" />
                      ) : (
                        <Square size={22} className="text-on-surface-variant" />
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

                        if (transaction.splitDetails && onEditSplitTransaction) {
                          onEditSplitTransaction(transaction);
                          return;
                        }

                        setSelectedTransaction(transaction);
                        setIsEditModalOpen(true);
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
                      onViewReceipt={() => {
                        setSelectedTransaction(transaction);
                        setIsReceiptModalOpen(true);
                      }}
                      isLastInGroup={isLast}
                    />
                  </div>
                </div>
              </div>
            </m.div>
          );
        }}
      />
    )}
  </div>
);
