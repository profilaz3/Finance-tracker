import { Account, Category, Person, Transaction, TransactionType } from '../types';
import { UNCATEGORIZED_FILTER } from './qolSuggestions';
import { TRANSLATIONS } from '../constants';
import { formatDate } from './locale';
import { parseAmountInput } from './numberInput';
import { localizeCategoryName, localizeSubcategory, localizeTransactionNote } from './systemText';

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
  /** When given, search also finds entries by the person they are with (debts, splits). */
  people?: Person[];
}

const LANGUAGES = ['en', 'sr'] as const;

/**
 * Lower case, no diacritics, single spaces, trimmed: "Čačak" -> "cacak". The letter dj becomes "d"
 * ("dorde"), or "dj" with `djAsDj` ("djordje"), since people type it both ways.
 */
export const normalizeSearchText = (value: string, djAsDj = false): string =>
  value
    .toLowerCase()
    .replace(/\u0111/g, djAsDj ? 'dj' : 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const NUMERIC_TERM = /^[-+]?[\d.,]*\d[\d.,]*$/;

const groupThousands = (integer: string, mark: string): string => integer.replace(/\B(?=(\d{3})+(?!\d))/g, mark);

/**
 * An amount the way people read it on screen, in both number formats: "1450", "1,450", "1.450",
 * "1,450.00", "1.450,00", "32.4", "32,40".
 */
export const amountSearchForms = (amount: number): string[] => {
  const absolute = Math.abs(amount);
  const fixed = absolute.toFixed(2);
  const [integer, decimals] = fixed.split('.');
  const trimmedDecimals = decimals.replace(/0+$/, '');
  const forms = new Set<string>();
  for (const [group, decimal] of [[',', '.'], ['.', ','], ['', '.'], ['', ',']] as const) {
    const whole = groupThousands(integer, group);
    forms.add(trimmedDecimals ? `${whole}${decimal}${trimmedDecimals}` : whole);
    forms.add(`${whole}${decimal}${decimals}`);
  }
  return [...forms];
};

const matchesAmount = (term: string, amount: number, forms: string[]): boolean => {
  if (forms.some(form => form.includes(term))) return true;
  // "1.450" typed in either format reads as the same amount.
  return LANGUAGES.some(language => {
    const parsed = parseAmountInput(term, language);
    return parsed !== undefined && Math.abs(Math.abs(parsed) - Math.abs(amount)) < 0.005;
  });
};

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

export interface DayGroup {
  /** Local calendar day, "2026-11-14". */
  key: string;
  /** "Today", "Yesterday" or the weekday ("Friday"). */
  label: string;
  /** The date beside it: "Sat 14 Nov" after Today and Yesterday, else "13 Nov" (with the year when it is not this year's). */
  detail: string;
  transactions: Transaction[];
}

/** Date-only values ("2026-11-14") are local days; anything else is parsed as a timestamp. */
const toLocalDay = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** One group per calendar day, newest day first; entries keep their order within a day. */
export const groupTransactionsByDay = (
  transactions: Transaction[],
  language: 'en' | 'sr',
  now: Date = new Date(),
): DayGroup[] => {
  const t = TRANSLATIONS[language];
  const today = getLocalCalendarDayTime(now);
  const dated = transactions.map(transaction => {
    const date = toLocalDay(transaction.date);
    const time = getLocalCalendarDayTime(date);
    return { transaction, date, time: Number.isNaN(time) ? -Infinity : time };
  });
  // Array.prototype.sort is stable, so entries of one day stay in the order they came in.
  dated.sort((a, b) => (b.time === a.time ? 0 : b.time > a.time ? 1 : -1));

  const groups: Array<DayGroup & { time: number }> = [];
  for (const { transaction, date, time } of dated) {
    const last = groups[groups.length - 1];
    if (last && last.time === time) {
      last.transactions.push(transaction);
      continue;
    }
    const valid = Number.isFinite(time);
    const diffDays = valid ? Math.round((today - time) / MS_PER_DAY) : NaN;
    const weekday = valid ? formatDate(date, { weekday: 'long' }, language) : '';
    const label = diffDays === 0 ? t.today : diffDays === 1 ? t.yesterday : weekday.charAt(0).toLocaleUpperCase() + weekday.slice(1);
    const detail = !valid
      ? ''
      : diffDays === 0 || diffDays === 1
        ? formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' }, language)
        : formatDate(date, { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }, language);
    groups.push({
      key: valid ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` : 'unknown',
      label,
      detail,
      transactions: [transaction],
      time,
    });
  }
  return groups.map(({ time: _time, ...group }) => group);
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
  people = [],
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

  // Every word of the query has to match somewhere: the note, category, wallet, subcategory,
  // person, receipt merchant (in either app language, without diacritics) or the amount as shown.
  const terms = normalizeSearchText(searchQuery).split(' ').filter(Boolean);
  if (terms.length > 0) {
    const categoryById = new Map(categories.map(category => [category.id, category]));
    const accountById = new Map(accounts.map(account => [account.id, account]));
    const personById = new Map(people.map(person => [person.id, person]));
    filteredTransactions = filteredTransactions.filter(transaction => {
      const category = categoryById.get(transaction.categoryId);
      const personIds = [transaction.personId, ...(transaction.splitDetails?.shares.map(share => share.personId) ?? [])];
      const texts = [
        transaction.note,
        category?.name,
        accountById.get(transaction.accountId)?.name,
        transaction.subcategory,
        transaction.receiptData?.merchant,
        ...personIds.map(id => (id ? personById.get(id)?.name : undefined)),
        ...LANGUAGES.flatMap(language => [
          localizeTransactionNote(transaction.note, language),
          category ? localizeCategoryName(category, language) : undefined,
          localizeSubcategory(transaction.subcategory, language),
        ]),
      ];
      const raw = texts.filter(Boolean).join('\n');
      const haystack = /\u0111/i.test(raw)
        ? `${normalizeSearchText(raw)}\n${normalizeSearchText(raw, true)}`
        : normalizeSearchText(raw);
      let forms: string[] | null = null;
      return terms.every(term => {
        if (haystack.includes(term)) return true;
        if (!NUMERIC_TERM.test(term)) return false;
        forms ??= amountSearchForms(transaction.amount);
        return matchesAmount(term, transaction.amount, forms);
      });
    });
  }

  return filteredTransactions.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
};
