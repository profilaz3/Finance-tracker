import { useMemo } from 'react';
import type { Account, AppState, Currency, Event, Person, Transaction, TransactionTemplate } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { convertAmount } from '../../services/currencyService';
import { spendingExpenses } from '../../domain/settle';
import {
  computeBudgetProgress,
  computeMonthSummary,
  getRatePairs,
  getRecentTransactions,
  getUpcomingRecurring,
  isSameMonth,
  monthKeyOf,
  type BudgetProgress,
  type MonthKey,
  type MonthSummary,
  type UpcomingItem,
} from '../../domain/home';
import { calculateDashboardDebtSummary, getActiveDashboardPeople, getDashboardWalletSummaries } from '../../utils/dashboardSummarySelectors';
import { selectDashboardTemplates } from '../../utils/qolSuggestions';

export type HomeStrings = (typeof TRANSLATIONS)['en'];

export interface WalletSummary {
  account: Account;
  /** In the wallet's own currency. */
  balance: number;
  /** In the base currency. */
  baseBalance: number;
}

export interface PersonSummary {
  person: Person;
  /** Positive: they owe you. In the base currency. */
  net: number;
}

export interface EventSummary {
  event: Event;
  total: number;
  expenseCount: number;
}

export interface HomeData {
  t: HomeStrings;
  language: AppState['language'];
  currency: Currency;
  month: MonthKey;
  isCurrentMonth: boolean;
  summary: MonthSummary;
  netWorth: number;
  budget: AppState['budget'];
  budgetProgress: BudgetProgress | null;
  wallets: WalletSummary[];
  people: PersonSummary[];
  owedToMe: number;
  iOwe: number;
  event: EventSummary | null;
  upcoming: UpcomingItem[];
  recent: Transaction[];
  rates: ReturnType<typeof getRatePairs>;
  templates: TransactionTemplate[];
  categoryName: (id: string) => string;
  categoryColor: (id: string) => string;
  accountName: (id: string) => string;
}

export interface HomeActions {
  openBudgets: () => void;
  openActivity: () => void;
  openInsights: () => void;
  openEvents: () => void;
  openEvent: (event: Event) => void;
  createEvent: () => void;
  openPeople: () => void;
  openPerson: (person: Person) => void;
  openWallets: () => void;
  openTransaction: (transaction: Transaction) => void;
  openRecurring: () => void;
  useTemplate: (templateId: string) => void;
  addEntry: () => void;
}

interface UseHomeDataOptions {
  state: AppState;
  month: MonthKey;
  netWorth: number;
  getAccountBalance: (account: Account) => number;
  activeEvent?: Event;
}

export function useHomeData({ state, month, netWorth, getAccountBalance, activeEvent }: UseHomeDataOptions): HomeData {
  const { transactions, categories, baseCurrency, rates, accounts, people, budget, recurringTransactions, templates, sharedExpenses, language } = state;

  const summary = useMemo(
    () => computeMonthSummary({ transactions, categories, baseCurrency, rates }, month),
    [transactions, categories, baseCurrency, rates, month],
  );

  const budgetProgress = useMemo(
    () => (budget && (budget.monthly > 0 || Object.keys(budget.categoryLimits).length > 0) ? computeBudgetProgress(budget, summary, categories) : null),
    [budget, summary, categories],
  );

  const wallets = useMemo(
    () => getDashboardWalletSummaries(accounts, getAccountBalance).map(({ account, balance }) => ({
      account,
      balance,
      baseBalance: convertAmount(balance, account.currency, baseCurrency, rates),
    })),
    // getAccountBalance is recreated each render; the balances only depend on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, transactions, baseCurrency, rates],
  );

  const peopleSummary = useMemo(() => {
    const active = getActiveDashboardPeople(people);
    const list = active
      .map(person => ({
        person,
        net: Object.entries(person.balances).reduce(
          (sum, [currency, amount]) => sum + convertAmount(amount, currency as Currency, baseCurrency, rates),
          0,
        ),
      }))
      .filter(entry => Math.abs(entry.net) >= 0.005)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const debt = calculateDashboardDebtSummary({ people: active, baseCurrency, rates: rates.rates });
    return { list, owedToMe: debt.totalOwedToMe, iOwe: debt.totalIOwe };
  }, [people, baseCurrency, rates]);

  const event = useMemo<EventSummary | null>(() => {
    if (!activeEvent) return null;
    const expenses = spendingExpenses(sharedExpenses).filter(expense => expense.eventId === activeEvent.id);
    const total = expenses.reduce((sum, expense) => sum + convertAmount(expense.amount, expense.currency, baseCurrency, rates), 0);
    return { event: activeEvent, total, expenseCount: expenses.length };
  }, [activeEvent, sharedExpenses, baseCurrency, rates]);

  const upcoming = useMemo(() => getUpcomingRecurring(recurringTransactions), [recurringTransactions]);
  const recent = useMemo(() => getRecentTransactions(transactions, 5), [transactions]);
  const ratePairs = useMemo(() => getRatePairs(baseCurrency, rates.rates), [baseCurrency, rates]);
  const quickTemplates = useMemo(() => selectDashboardTemplates(templates, 6), [templates]);

  const lookups = useMemo(() => {
    const categoriesById = new Map(categories.map(category => [category.id, category] as const));
    const accountsById = new Map(accounts.map(account => [account.id, account] as const));
    return {
      categoryName: (id: string) => categoriesById.get(id)?.name ?? '',
      categoryColor: (id: string) => categoriesById.get(id)?.color ?? '#8A8984',
      accountName: (id: string) => accountsById.get(id)?.name ?? '',
    };
  }, [categories, accounts]);

  return {
    t: TRANSLATIONS[language],
    language,
    currency: baseCurrency,
    month,
    isCurrentMonth: isSameMonth(month, monthKeyOf(new Date())),
    summary,
    netWorth,
    budget,
    budgetProgress,
    wallets,
    people: peopleSummary.list,
    owedToMe: peopleSummary.owedToMe,
    iOwe: peopleSummary.iOwe,
    event,
    upcoming,
    recent,
    rates: ratePairs,
    templates: quickTemplates,
    ...lookups,
  };
}
