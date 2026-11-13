import { Account, Category, Transaction, TransactionType } from '../types';
import { UNCATEGORIZED_FILTER } from './qolSuggestions';
import { TRANSLATIONS } from '../constants';
import { formatDate } from './locale';

const MS_PER_DAY = 86400000;

interface FilterTransactionsInput {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  filterType: 'all' | TransactionType;
  filterAccount: string;
  filterCategory?: string;
  filterDateFrom: string;
  filterDateTo: string;
  searchQuery: string;
}

const hasExplicitTime = (value: string): boolean => value.includes('T');

const parseFilterStartTime = (value: string): number => {
  const date = hasExplicitTime(value) ? new Date(value) : new Date(`${value}T00:00:00`);
  return date.getTime();
};

const parseFilterEndTime = (value: string): number => {
  const date = hasExplicitTime(value) ? new Date(value) : new Date(`${value}T23:59:59.999`);
  return date.getTime();
};

const getLocalCalendarDayTime = (date: Date): number => (
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
);

export const getDateGroupLabel = (
  date: Date,
  language: 'en' | 'sr',
  now: Date = new Date()
): string => {
  const diffDays = Math.floor((getLocalCalendarDayTime(now) - getLocalCalendarDayTime(date)) / MS_PER_DAY);

  if (diffDays === 0) {
    return TRANSLATIONS[language].today;
  }

  if (diffDays === 1) {
    return TRANSLATIONS[language].yesterday;
  }

  if (diffDays < 7) {
    return TRANSLATIONS[language].thisWeek;
  }

  if (diffDays < 14) {
    return TRANSLATIONS[language].lastWeek;
  }

  const label = date.getFullYear() === now.getFullYear()
    ? formatDate(date, { month: 'long' }, language)
    : formatDate(date, { month: 'long', year: 'numeric' }, language);

  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
};

export const groupTransactionsByDate = (
  transactions: Transaction[],
  language: 'en' | 'sr',
  now: Date = new Date()
) => {
  const groups: { label: string; transactions: Transaction[] }[] = [];
  let currentLabel = '';

  transactions.forEach(transaction => {
    const label = getDateGroupLabel(new Date(transaction.date), language, now);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, transactions: [transaction] });
      return;
    }

    groups[groups.length - 1].transactions.push(transaction);
  });

  return groups;
};

export const filterTransactions = ({
  transactions,
  categories,
  accounts,
  filterType,
  filterAccount,
  filterCategory = 'all',
  filterDateFrom,
  filterDateTo,
  searchQuery,
}: FilterTransactionsInput): Transaction[] => {
  let filteredTransactions = [...transactions];

  if (filterType !== 'all') {
    filteredTransactions = filteredTransactions.filter(transaction => transaction.type === filterType);
  }

  if (filterAccount !== 'all') {
    filteredTransactions = filteredTransactions.filter(transaction => transaction.accountId === filterAccount);
  }

  if (filterCategory === UNCATEGORIZED_FILTER) {
    const knownCategoryIds = new Set(categories.map(category => category.id));
    filteredTransactions = filteredTransactions.filter(transaction => (
      !transaction.categoryId || !knownCategoryIds.has(transaction.categoryId)
    ));
  } else if (filterCategory !== 'all') {
    filteredTransactions = filteredTransactions.filter(transaction => transaction.categoryId === filterCategory);
  }

  if (filterDateFrom) {
    const fromTime = parseFilterStartTime(filterDateFrom);
    filteredTransactions = filteredTransactions.filter(transaction => new Date(transaction.date).getTime() >= fromTime);
  }

  if (filterDateTo) {
    const toTime = parseFilterEndTime(filterDateTo);
    filteredTransactions = filteredTransactions.filter(transaction => new Date(transaction.date).getTime() <= toTime);
  }

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredTransactions = filteredTransactions.filter(transaction => {
      const category = categories.find(item => item.id === transaction.categoryId);
      const account = accounts.find(item => item.id === transaction.accountId);

      return (
        transaction.note?.toLowerCase().includes(query) ||
        category?.name.toLowerCase().includes(query) ||
        account?.name.toLowerCase().includes(query) ||
        transaction.subcategory?.toLowerCase().includes(query) ||
        transaction.amount.toString().includes(query)
      );
    });
  }

  return filteredTransactions.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
};
