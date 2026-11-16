import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { TableVirtuoso } from 'react-virtuoso';
import { ArrowDown, ArrowUp, CheckSquare, Square } from 'lucide-react';
import type { AppState, Transaction } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { convertAmount } from '../../services/currencyService';
import { formatMoney, formatNumber, formatShortDate, formatTime } from '../../utils/locale';
import { localizeCategoryName, localizeTransactionNote } from '../../utils/systemText';
import { canTakeCategory } from '../../domain/bulkCategory';
import { isRepaymentTransaction, isTransferTransaction } from '../../domain/money';
import { isSystemCategoryId } from '../../domain/transactions';
import { openTransactionDetails } from '../transaction-details/detailsBus';
import { fill } from '../home/parts';
import { ACTIVITY_STRINGS } from './activityStrings';

export type TableSortKey = 'date' | 'note' | 'category' | 'wallet' | 'amount';
export interface TableSort {
  key: TableSortKey;
  descending: boolean;
}

interface TransactionsTableProps {
  state: AppState;
  /** The list as filtered and searched. */
  transactions: Transaction[];
  isSelectionMode: boolean;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  onChangeCategory: (transaction: Transaction, categoryId: string) => void;
  onChangeWallet: (transaction: Transaction, accountId: string) => void;
}

const ROW = 'border-b border-hair';
const CELL = 'px-3 py-2 align-middle';

// Stable component types: defined inside the render, virtuoso would remount the table on every
// render and a row's <select> would lose focus after a change.
const TABLE_COMPONENTS = {
  Table: (props: React.HTMLAttributes<HTMLTableElement>) => <table {...props} className="w-full table-fixed border-collapse text-left" />,
  TableRow: (props: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props} className={clsx(ROW, 'hover:bg-chip/60')} />,
};

/**
 * Activity as a table on wide windows: sortable columns, and category and wallet changed in the row.
 * A note opens the entry's details. Virtualised against the app's scroller like the list.
 */
export const TransactionsTable: React.FC<TransactionsTableProps> = ({
  state,
  transactions,
  isSelectionMode,
  selectedIds,
  toggleSelection,
  onChangeCategory,
  onChangeWallet,
}) => {
  const t = TRANSLATIONS[state.language];
  const s = ACTIVITY_STRINGS[state.language];
  const language = state.language;
  const [sort, setSort] = useState<TableSort>({ key: 'date', descending: true });
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  useEffect(() => setScrollParent(document.getElementById('main-content')), []);

  const categories = useMemo(() => new Map(state.categories.map(category => [category.id, category])), [state.categories]);
  const accounts = useMemo(() => new Map(state.accounts.map(account => [account.id, account])), [state.accounts]);
  const categoryName = (id: string) => {
    const category = categories.get(id);
    return category ? localizeCategoryName(category, language) : '';
  };
  const noteOf = (transaction: Transaction) =>
    localizeTransactionNote(transaction.note?.trim(), language) || categoryName(transaction.categoryId) || t.other;
  // Biggest first means size, whatever the sign, compared in the base currency.
  const size = (transaction: Transaction) => convertAmount(transaction.amount, transaction.currency, state.baseCurrency, state.rates);

  const rows = useMemo(() => {
    const text = (value: string) => value.toLocaleLowerCase();
    const compare: Record<TableSortKey, (a: Transaction, b: Transaction) => number> = {
      date: (a, b) => a.date.localeCompare(b.date),
      note: (a, b) => text(noteOf(a)).localeCompare(text(noteOf(b))),
      category: (a, b) => text(categoryName(a.categoryId)).localeCompare(text(categoryName(b.categoryId))),
      wallet: (a, b) => text(accounts.get(a.accountId)?.name ?? '').localeCompare(text(accounts.get(b.accountId)?.name ?? '')),
      amount: (a, b) => size(a) - size(b),
    };
    const sorted = [...transactions].sort((a, b) => compare[sort.key](a, b) || a.date.localeCompare(b.date));
    return sort.descending ? sorted.reverse() : sorted;
    // noteOf / categoryName / size read the same maps and rates listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, sort, categories, accounts, state.rates, state.baseCurrency, language]);

  const columns: Array<[TableSortKey, string, string]> = [
    ['date', t.date, 'w-[92px]'],
    ['note', t.note, ''],
    ['category', t.category, 'w-[170px]'],
    ['wallet', t.wallet, 'w-[130px]'],
    ['amount', t.amount, 'w-[120px] text-right'],
  ];

  const amountText = (transaction: Transaction) => {
    const value = Math.abs(transaction.amount);
    const digits = Math.round(value * 100) % 100 === 0 ? 0 : 2;
    const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
    const text = transaction.currency === state.baseCurrency
      ? formatNumber(value, options, language)
      : formatMoney(value, transaction.currency, language, options);
    return `${transaction.type === 'income' ? '+' : '−'}${text}`;
  };

  const select = 'h-9 w-full min-w-0 cursor-pointer truncate rounded-[10px] border-none bg-transparent px-2 text-[14px] font-medium hover:bg-chip focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <div className="paper-tile mx-1 overflow-hidden">
      <TableVirtuoso
        customScrollParent={scrollParent ?? undefined}
        data={rows}
        computeItemKey={(_, transaction) => transaction.id}
        className="w-full"
        components={TABLE_COMPONENTS}
        fixedHeaderContent={() => (
          <tr className="border-b border-hair bg-[var(--paper-tile)]">
            {isSelectionMode && <th className="w-12" aria-label={t.selected} />}
            {columns.map(([key, label, width]) => {
              const active = sort.key === key;
              return (
                <th key={key} scope="col" aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'} className={clsx('px-1 py-1.5', width)}>
                  <button
                    type="button"
                    onClick={() => setSort(prev => ({ key, descending: prev.key === key ? !prev.descending : key === 'date' || key === 'amount' }))}
                    aria-label={fill(s.sortBy, { column: label })}
                    className={clsx(
                      'flex h-9 w-full items-center gap-1 rounded-[10px] px-2 text-[12.5px] font-semibold uppercase tracking-[0.4px] hover:bg-chip',
                      key === 'amount' && 'justify-end',
                      active ? 'text-on-surface' : 'text-muted',
                    )}
                  >
                    {label}
                    {active && (sort.descending ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        )}
        itemContent={(_, transaction) => {
          const category = categories.get(transaction.categoryId);
          const transfer = isTransferTransaction(transaction);
          const fixedCategory = transfer || isRepaymentTransaction(transaction);
          const options = state.categories.filter(item => item.type === transaction.type && !isSystemCategoryId(item.id));
          const date = new Date(transaction.date);
          const selected = selectedIds.has(transaction.id);
          return (
            <>
              {isSelectionMode && (
                <td className="w-12 pl-2">
                  <button
                    type="button"
                    onClick={() => toggleSelection(transaction.id)}
                    aria-pressed={selected}
                    aria-label={t.selectEntry.replace('{name}', noteOf(transaction))}
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                  >
                    {selected ? <CheckSquare size={20} className="text-accent" aria-hidden="true" /> : <Square size={20} className="text-muted" aria-hidden="true" />}
                  </button>
                </td>
              )}
              <td className={clsx(CELL, 'whitespace-nowrap text-[13.5px] tabular-nums text-muted')}>
                <span className="block font-medium text-on-surface">{formatShortDate(date, language)}</span>
                <span className="block text-[12px]">{formatTime(date, language)}</span>
              </td>
              <td className={CELL}>
                <button
                  type="button"
                  data-details-origin=""
                  onClick={event => openTransactionDetails(transaction.id, event.currentTarget)}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-[12px] py-0.5 text-left focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <CategoryGlyph category={category} size={32} shape="circle" tone="solid" />
                  <span className="min-w-0 truncate text-[14.5px] font-semibold">{noteOf(transaction)}</span>
                </button>
              </td>
              <td className={CELL}>
                {fixedCategory || options.length === 0 ? (
                  <span className="block truncate px-2 text-[14px] text-muted">{categoryName(transaction.categoryId)}</span>
                ) : (
                  <select
                    aria-label={`${t.category}: ${noteOf(transaction)}`}
                    value={transaction.categoryId}
                    onChange={event => {
                      const next = categories.get(event.target.value);
                      if (next && canTakeCategory(transaction, next)) onChangeCategory(transaction, next.id);
                    }}
                    className={select}
                  >
                    {!options.some(item => item.id === transaction.categoryId) && <option value={transaction.categoryId}>{categoryName(transaction.categoryId)}</option>}
                    {options.map(item => (
                      <option key={item.id} value={item.id}>{localizeCategoryName(item, language)}</option>
                    ))}
                  </select>
                )}
              </td>
              <td className={CELL}>
                {transfer || state.accounts.length < 2 ? (
                  <span className="block truncate px-2 text-[14px] text-muted">{accounts.get(transaction.accountId)?.name ?? ''}</span>
                ) : (
                  <select
                    aria-label={`${t.wallet}: ${noteOf(transaction)}`}
                    value={transaction.accountId}
                    onChange={event => onChangeWallet(transaction, event.target.value)}
                    className={select}
                  >
                    {!accounts.has(transaction.accountId) && <option value={transaction.accountId}>{t.other}</option>}
                    {state.accounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                )}
              </td>
              <td className={clsx(CELL, 'whitespace-nowrap text-right text-[15px] font-semibold tabular-nums', transaction.type === 'income' && 'text-pos')}>
                {amountText(transaction)}
              </td>
            </>
          );
        }}
      />
    </div>
  );
};
