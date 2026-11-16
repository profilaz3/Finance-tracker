import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Repeat } from 'lucide-react';
import type { AppState, RecurringTransaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { computeBudgetProgress, computeMonthSummary, monthKeyOf } from '../domain/home';
import { daysLeftInMonth, resolveHomeHeader } from '../domain/homeHeader';
import { budgetForWorkspace, withWorkspaceBudget } from '../domain/teams';
import { categoryAverages, raiseSuggestion, unlimitedCategories, withCategoryLimit, type RaiseSuggestion } from '../domain/budgetView';
import { detectSubscriptions, subscriptionTotals } from '../domain/subscriptions';
import { convertCurrency } from '../utils/currencyUtils';
import { getIntlLocale } from '../utils/locale';
import { pluralText } from '../utils/plural';
import { localizeCategoryName } from '../utils/systemText';
import { useBackLayer } from '../hooks/useBackLayer';
import { OPEN_SUBSCRIPTIONS_EVENT, readDismissedSubscriptions, takeSubscriptionsTabRequest } from '../services/subscriptionStore';
import { SubscriptionsPage } from './subscriptions/SubscriptionsPage';
import { BudgetHero } from './budgets/BudgetHero';
import { CategoryTiles } from './budgets/CategoryTiles';
import { BudgetEditSheet, type BudgetEditFocus } from './budgets/BudgetEditSheet';
import { BUDGET_STRINGS } from './budgets/budgetStrings';
import { fill } from './home/parts';
import { plainAmount } from './stats/analyticsStrings';

type BudgetsPage = 'budgets' | 'subscriptions';
type ToastFn = (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;

interface BudgetsViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onBack: () => void;
  onSaved: (message: string) => void;
  /** "Track as recurring" on a detected subscription. */
  onAddRecurring?: (recurring: RecurringTransaction) => void;
  onToast?: ToastFn;
  /** "Calendar" next to the subscriptions' next charges. */
  onOpenCalendar?: () => void;
  /** The workspace on screen: its budget is read from `state` (scoped) and written to its own slot. */
  workspaceId?: string | null;
}

/**
 * This month's budget: the ring and what is left for each day in the header, then the category
 * limits as tiles. Limits are changed in the edit sheet; Subscriptions is a page of its own here.
 */
export const BudgetsView: React.FC<BudgetsViewProps> = ({ state, setState, onBack, onSaved, onAddRecurring, onToast, onOpenCalendar, workspaceId = null }) => {
  const { baseCurrency: currency, language } = state;
  const t = TRANSLATIONS[language];
  const s = BUDGET_STRINGS[language];
  const locale = getIntlLocale(language);
  const tone = resolveHomeHeader(state.homeHeader).tone;

  // A price-increase notification opens straight on Subscriptions; Back then leaves the screen.
  const [page, setPage] = useState<BudgetsPage>(() => (takeSubscriptionsTabRequest() ? 'subscriptions' : 'budgets'));
  const [subsFromBudgets, setSubsFromBudgets] = useState(false);
  useEffect(() => {
    const open = () => {
      takeSubscriptionsTabRequest();
      setSubsFromBudgets(false);
      setPage('subscriptions');
    };
    window.addEventListener(OPEN_SUBSCRIPTIONS_EVENT, open);
    return () => window.removeEventListener(OPEN_SUBSCRIPTIONS_EVENT, open);
  }, []);
  // Subscriptions opens at its top; Back returns to where the budget was scrolled.
  const budgetScroll = useRef(0);
  const firstPage = useRef(true);
  useLayoutEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = page === 'subscriptions' ? 0 : budgetScroll.current;
  }, [page]);
  const openSubscriptions = () => {
    budgetScroll.current = document.getElementById('main-content')?.scrollTop ?? 0;
    setSubsFromBudgets(true);
    setPage('subscriptions');
  };
  const closeSubscriptions = () => {
    setPage('budgets');
    setSubsFromBudgets(false);
  };
  useBackLayer('budgets-subscriptions', page === 'subscriptions' && subsFromBudgets, closeSubscriptions);

  const [editing, setEditing] = useState(false);
  const [editFocus, setEditFocus] = useState<BudgetEditFocus>(undefined);
  const openEdit = (focus?: BudgetEditFocus) => {
    setEditFocus(focus);
    setEditing(true);
  };

  const now = new Date();
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
  const summary = useMemo(
    () => computeMonthSummary(state, monthKeyOf(new Date())),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the summary reads only these
    [state.transactions, state.categories, state.baseCurrency, state.rates],
  );
  const budget = state.budget ?? null;
  const progress = computeBudgetProgress(budget ?? { monthly: 0, categoryLimits: {} }, summary, state.categories);
  const daysLeft = daysLeftInMonth(summary.todayIndex, summary.daysInMonth);
  const categoriesById = useMemo(() => new Map(state.categories.map(category => [category.id, category] as const)), [state.categories]);
  const expenseIds = useMemo(
    () => new Set(state.categories.filter(category => category.type === 'expense').map(category => category.id)),
    [state.categories],
  );
  const rows = progress.categories.filter(row => expenseIds.has(row.categoryId));
  const unlimited = unlimitedCategories(summary.byCategory, budget, expenseIds);

  // "Raise limit" for categories over their limit: what their usual month needs.
  const averages = useMemo(
    () => categoryAverages(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the averages read only these
    [state.transactions, state.categories, state.baseCurrency, state.rates],
  );
  const suggestions = new Map<string, RaiseSuggestion>();
  rows.filter(row => row.over > 0).forEach(row => {
    const average = averages.byCategory.get(row.categoryId);
    const suggestion = raiseSuggestion(row.limit, average === undefined ? undefined : { average, months: averages.months });
    if (suggestion) suggestions.set(row.categoryId, suggestion);
  });

  const subscriptions = useMemo(() => {
    const dismissed = new Set(readDismissedSubscriptions());
    const items = detectSubscriptions(state.transactions, state.recurringTransactions ?? []).filter(item => !dismissed.has(item.id));
    return subscriptionTotals(items, (amount, from) => convertCurrency(amount, from, currency, state.rates.rates));
  }, [state.transactions, state.recurringTransactions, state.rates, currency]);

  const raise = (categoryId: string, limit: number) => {
    const previous = budget;
    setState(prev => withWorkspaceBudget(prev, workspaceId, withCategoryLimit(budgetForWorkspace(prev, workspaceId), categoryId, limit)));
    const category = categoriesById.get(categoryId);
    const message = fill(s.raised, {
      category: category ? localizeCategoryName(category, language) : categoryId,
      amount: `${plainAmount(limit, currency, locale)} ${currency}`,
    });
    if (onToast) onToast(message, 'success', { label: t.undo, onClick: () => setState(prev => withWorkspaceBudget(prev, workspaceId, previous)) });
    else onSaved(message);
  };

  // Removing is one tap, so it can be undone from the toast.
  const remove = () => {
    const previous = budget;
    if (!previous) return;
    setState(prev => withWorkspaceBudget(prev, workspaceId, null));
    onToast?.(t.budgetRemoved, 'info', {
      label: t.undo,
      onClick: () => setState(prev => (budgetForWorkspace(prev, workspaceId) ? prev : withWorkspaceBudget(prev, workspaceId, previous))),
    });
  };

  if (page === 'subscriptions') {
    return (
      <SubscriptionsPage
        state={state}
        tone={tone}
        onBack={subsFromBudgets ? closeSubscriptions : onBack}
        onAddRecurring={onAddRecurring}
        onToast={onToast}
        onOpenCalendar={onOpenCalendar}
      />
    );
  }

  const subsLine = subscriptions.count > 0
    ? pluralText(subscriptions.count, language, {
      one: s.subsOne,
      few: 'subsFew' in s ? s.subsFew : undefined,
      other: s.subsOther,
    }).replace('{amount}', `${plainAmount(subscriptions.monthly, currency, locale)} ${currency}`)
    : s.subsNone;

  const subscriptionsCard = (
    <button type="button" onClick={openSubscriptions} className="paper-tile flex w-full items-center gap-3 p-4 text-left">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
        <Repeat size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">{t.subscriptions}</span>
        <span className="block text-[13px] text-muted">{subsLine}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-faint" />
    </button>
  );

  return (
    <div className="mx-auto max-w-[920px] pb-28 min-[1180px]:flex min-[1180px]:items-start min-[1180px]:gap-6">
      {/* Wide windows: the header (and the Subscriptions card) stay put beside the category limits. */}
      <div className="flex flex-col gap-4 min-[1180px]:sticky min-[1180px]:top-8 min-[1180px]:w-[380px] min-[1180px]:shrink-0">
        <BudgetHero
          tone={tone}
          title={fill(s.title, { month: monthLabel })}
          monthLabel={monthLabel}
          progress={progress}
          daysLeft={daysLeft}
          currency={currency}
          language={language}
          locale={locale}
          backLabel={t.back}
          subscriptionsLabel={t.subscriptions}
          removeLabel={t.removeBudget}
          spendingFast={t.spendingFast}
          onPace={t.onPace}
          hasBudget={!!budget}
          onBack={onBack}
          onEdit={focus => openEdit(focus)}
          onSubscriptions={openSubscriptions}
          onRemove={remove}
          s={s}
        />
        <div className="hidden min-[1180px]:block">{subscriptionsCard}</div>
      </div>

      <div className="screen-sheet flex min-w-0 flex-1 flex-col gap-6 min-[1180px]:mt-0!">
        <CategoryTiles
          rows={rows}
          unlimited={unlimited}
          categories={categoriesById}
          today={progress.monthElapsed}
          daysLeft={daysLeft}
          suggestions={suggestions}
          currency={currency}
          language={language}
          locale={locale}
          onEditLimits={categoryId => openEdit(categoryId ? { categoryId } : undefined)}
          onRaise={raise}
          s={s}
        />

        <div className="min-[1180px]:hidden">{subscriptionsCard}</div>
      </div>

      <BudgetEditSheet
        isOpen={editing}
        focus={editFocus}
        onClose={() => setEditing(false)}
        state={state}
        setState={setState}
        workspaceId={workspaceId}
        onSaved={onSaved}
        onRemove={remove}
        s={s}
      />
    </div>
  );
};
