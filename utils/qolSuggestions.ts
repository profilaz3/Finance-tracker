import type { Category, Transaction, TransactionTemplate, TransactionType } from '../types';

export const UNCATEGORIZED_FILTER = '__uncategorized__';

export type CommonFilterId = 'thisMonth' | 'expenses' | 'income' | 'uncategorized';

export interface TransactionFilterPatch {
  filterType?: 'all' | TransactionType;
  filterAccount?: string;
  filterCategory?: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  searchQuery?: string;
  showDateFilter?: boolean;
}

export interface CommonTransactionFilter {
  id: CommonFilterId;
  label: string;
  patch: TransactionFilterPatch;
}

export interface DuplicateTransactionGroup {
  id: string;
  transactions: Transaction[];
}

export interface BatchDeleteSafetySummary {
  count: number;
  safeToUndoCount: number;
  unsafeCount: number;
  canUndoAll: boolean;
  selectedTransactions: Transaction[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const localDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const monthRange = (now: Date): { from: string; to: string } => {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    from: localDateInputValue(start),
    to: localDateInputValue(end),
  };
};

const parseTime = (value?: string): number => {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const selectDashboardTemplates = (
  templates: TransactionTemplate[],
  limit = 4,
): TransactionTemplate[] => (
  [...templates]
    .sort((left, right) => {
      if (right.usageCount !== left.usageCount) {
        return right.usageCount - left.usageCount;
      }

      const lastUsedDiff = parseTime(right.lastUsed) - parseTime(left.lastUsed);
      if (lastUsedDiff !== 0) {
        return lastUsedDiff;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, limit)
);

export const isRepeatableTransaction = (transaction: Transaction): boolean => (
  transaction.categoryId !== 'internal-transfer'
  && !transaction.personId
  && !transaction.splitDetails
);

export const getRepeatLastCandidate = (transactions: Transaction[]): Transaction | undefined => (
  [...transactions]
    .filter(isRepeatableTransaction)
    .sort((left, right) => parseTime(right.date) - parseTime(left.date))[0]
);

export const getCommonTransactionFilters = (
  language: 'en' | 'sr',
  now = new Date(),
): CommonTransactionFilter[] => {
  const range = monthRange(now);
  const labels = language === 'sr'
    ? {
        thisMonth: 'Ovaj mesec',
        expenses: 'Rashodi',
        income: 'Prihodi',
        uncategorized: 'Bez kategorije',
      }
    : {
        thisMonth: 'This month',
        expenses: 'Expenses',
        income: 'Income',
        uncategorized: 'Uncategorized',
      };

  return [
    {
      id: 'thisMonth',
      label: labels.thisMonth,
      patch: {
        filterDateFrom: range.from,
        filterDateTo: range.to,
        showDateFilter: true,
      },
    },
    {
      id: 'expenses',
      label: labels.expenses,
      patch: { filterType: 'expense' },
    },
    {
      id: 'income',
      label: labels.income,
      patch: { filterType: 'income' },
    },
    {
      id: 'uncategorized',
      label: labels.uncategorized,
      patch: { filterCategory: UNCATEGORIZED_FILTER },
    },
  ];
};

const categoryMatches = (
  left: Transaction,
  right: Transaction,
): boolean => {
  if (!left.categoryId || !right.categoryId) {
    return true;
  }

  return left.categoryId === right.categoryId;
};

const isPossibleDuplicate = (
  left: Transaction,
  right: Transaction,
): boolean => (
  left.id !== right.id
  && left.accountId === right.accountId
  && left.currency === right.currency
  && left.type === right.type
  && Math.abs(left.amount) === Math.abs(right.amount)
  && Math.abs(parseTime(left.date) - parseTime(right.date)) <= DAY_MS
  && categoryMatches(left, right)
);

export const detectDuplicateTransactionGroups = (
  transactions: Transaction[],
  // Category matching uses transaction.categoryId directly; keep this for caller symmetry and forward compatibility.
  _categories: Category[],
  limit = 5,
): DuplicateTransactionGroup[] => {
  const visited = new Set<string>();
  const groups: DuplicateTransactionGroup[] = [];
  const sorted = [...transactions].sort((left, right) => parseTime(left.date) - parseTime(right.date));

  sorted.forEach(transaction => {
    if (visited.has(transaction.id)) {
      return;
    }

    const matches = [
      transaction,
      ...sorted.filter(candidate => !visited.has(candidate.id) && isPossibleDuplicate(transaction, candidate)),
    ];

    if (matches.length < 2) {
      return;
    }

    matches.forEach(match => visited.add(match.id));
    groups.push({
      id: matches.map(match => match.id).sort().join(':'),
      transactions: matches,
    });
  });

  return groups.slice(0, limit);
};

// Person balances are derived from transactions (domain/balances.ts), so
// restoring a deleted debt or split transaction restores its balance effect too.
const canUndoAfterBatchDelete = (_transaction: Transaction): boolean => true;

export const getBatchDeleteSafetySummary = (
  transactions: Transaction[],
  selectedIds: string[],
): BatchDeleteSafetySummary => {
  const selectedIdSet = new Set(selectedIds);
  const selectedTransactions = transactions.filter(transaction => selectedIdSet.has(transaction.id));
  const safeToUndoCount = selectedTransactions.filter(canUndoAfterBatchDelete).length;

  return {
    count: selectedTransactions.length,
    safeToUndoCount,
    unsafeCount: selectedTransactions.length - safeToUndoCount,
    canUndoAll: selectedTransactions.length > 0 && safeToUndoCount === selectedTransactions.length,
    selectedTransactions,
  };
};
