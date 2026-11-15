import React, { useEffect, useMemo, useState } from 'react';
import { CategoryGlyph } from './ui/CategoryGlyph';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import type { AppState, Budget, RecurringTransaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { computeBudgetProgress, computeMonthSummary, monthKeyOf } from '../domain/home';
import { formatAmountForInput } from '../utils/numberInput';
import { mergeBudgetDraft, readBudgetLimit, sameBudget } from '../utils/budgetLimit';
import { AmountInput } from './ui/AmountInput';
import { localizeCategoryName } from '../utils/systemText';
import { Big, fill, money } from './home/parts';
import { DeltaPill } from './ui/primitives';
import { IconTile } from './ui/IconTile';
import { iconForCategory } from '../utils/categoryIcons';
import { Ring } from './ui/Ring';
import { Illustration } from './ui/Illustration';
import { formatPercent } from '../utils/locale';
import { Segmented } from './ui/Segmented';
import { SubscriptionsPanel } from './subscriptions';
import { OPEN_SUBSCRIPTIONS_EVENT, takeSubscriptionsTabRequest } from '../services/subscriptionStore';
import { ConfirmDialog } from './ConfirmDialog';
import { budgetForWorkspace, withWorkspaceBudget } from '../domain/teams';
import { useBackLayer } from '../hooks/useBackLayer';

type BudgetsTab = 'budgets' | 'subscriptions';
type ToastFn = (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;

interface BudgetsViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onBack: () => void;
  onSaved: (message: string) => void;
  /** "Track as recurring" on a detected subscription. */
  onAddRecurring?: (recurring: RecurringTransaction) => void;
  onToast?: ToastFn;
  /** The workspace on screen: its budget is read from `state` (scoped) and written to its own slot. */
  workspaceId?: string | null;
}

const ACCENT = 'rgb(var(--accent-rgb))';
const WARN = 'rgb(var(--md-sys-color-warning))';
const NEG = 'var(--paper-neg)';

/** Accent (or the category colour) while comfortable, amber from 80%, red once over. */
const limitColor = (ratio: number, base = ACCENT) => (ratio > 1 ? NEG : ratio >= 0.8 ? WARN : base);
const limitTextClass = (ratio: number) => (ratio > 1 ? 'text-neg' : ratio >= 0.8 ? 'text-[rgb(var(--md-sys-color-warning))]' : 'text-pos');

/** A limit as typed: the parsed amount (undefined while empty or unreadable) and the raw text. */
interface LimitField {
  amount: number | undefined;
  text: string;
}

const fieldOf = (value: number | undefined, language: 'en' | 'sr'): LimitField =>
  value && value > 0 ? { amount: value, text: formatAmountForInput(value, language) } : { amount: undefined, text: '' };

export const BudgetsView: React.FC<BudgetsViewProps> = ({ state, setState, onBack, onSaved, onAddRecurring, onToast, workspaceId = null }) => {
  const t = TRANSLATIONS[state.language];
  // A price-increase notification opens straight on Subscriptions.
  const [tab, setTab] = useState<BudgetsTab>(() => (takeSubscriptionsTabRequest() ? 'subscriptions' : 'budgets'));
  useEffect(() => {
    const open = () => {
      takeSubscriptionsTabRequest();
      setTab('subscriptions');
    };
    window.addEventListener(OPEN_SUBSCRIPTIONS_EVENT, open);
    return () => window.removeEventListener(OPEN_SUBSCRIPTIONS_EVENT, open);
  }, []);
  const { baseCurrency: currency, language } = state;
  const [monthly, setMonthly] = useState<LimitField>(() => fieldOf(state.budget?.monthly, state.language));
  const [limits, setLimits] = useState<Record<string, LimitField>>(() =>
    Object.fromEntries(Object.entries(state.budget?.categoryLimits ?? {}).map(([id, value]) => [id, fieldOf(value, state.language)])),
  );

  const expenseCategories = useMemo(() => state.categories.filter(category => category.type === 'expense'), [state.categories]);
  const summary = useMemo(
    () => computeMonthSummary(state, monthKeyOf(new Date())),
    [state.transactions, state.categories, state.baseCurrency, state.rates],
  );

  const monthlyRead = readBudgetLimit(monthly.text, language);
  const limitReads = Object.fromEntries(Object.entries(limits).map(([id, field]) => [id, readBudgetLimit(field.text, language)] as const));
  const invalidCount = Number(monthlyRead.invalid)
    + expenseCategories.filter(category => limitReads[category.id]?.invalid).length;
  const draft: Budget = {
    monthly: monthlyRead.value,
    categoryLimits: Object.fromEntries(
      Object.entries(limitReads)
        .map(([id, read]) => [id, read.value] as const)
        .filter(([id, value]) => value > 0 && expenseCategories.some(category => category.id === id)),
    ),
  };
  const progress = computeBudgetProgress(draft, summary, state.categories);
  const spentByCategory = new Map(summary.byCategory.map(entry => [entry.categoryId, entry.amount] as const));
  const hasBudget = draft.monthly > 0 || Object.keys(draft.categoryLimits).length > 0;

  // Categories with a saved limit first, then by spend; fixed while typing so rows do not jump.
  const orderedCategories = useMemo(() => {
    const saved = state.budget?.categoryLimits ?? {};
    const spend = new Map(summary.byCategory.map(entry => [entry.categoryId, entry.amount] as const));
    return [...expenseCategories].sort((a, b) =>
      Number(Boolean(saved[b.id])) - Number(Boolean(saved[a.id]))
      || (spend.get(b.id) ?? 0) - (spend.get(a.id) ?? 0));
  }, [expenseCategories, state.budget, summary.byCategory]);

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - today.getDate() + 1);
  const monthElapsed = today.getDate() / daysInMonth;
  const fast = progress.spentRatio > monthElapsed + 0.05;

  // Leaving with edits that were not saved asks first (the header arrow and Android/browser Back).
  // Compared like the draft is built: limits of categories not shown here do not count.
  const savedShown: Budget = {
    monthly: state.budget?.monthly ?? 0,
    categoryLimits: Object.fromEntries(Object.entries(state.budget?.categoryLimits ?? {})
      .filter(([id]) => expenseCategories.some(category => category.id === id))),
  };
  const isDirty = invalidCount > 0 || !sameBudget(draft, savedShown);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useBackLayer('budgets-unsaved', isDirty && !confirmingDiscard && !leaving, () => setConfirmingDiscard(true));
  useBackLayer('budgets-discard-confirm', confirmingDiscard, () => setConfirmingDiscard(false));
  const requestBack = () => {
    if (isDirty) setConfirmingDiscard(true);
    else onBack();
  };
  const discardAndLeave = () => {
    setLeaving(true);
    setConfirmingDiscard(false);
    onBack();
  };

  const save = () => {
    if (invalidCount > 0) return;
    setLeaving(true);
    const shownIds = new Set(expenseCategories.map(category => category.id));
    setState(prev => withWorkspaceBudget(prev, workspaceId, mergeBudgetDraft(budgetForWorkspace(prev, workspaceId), draft, shownIds)));
    onSaved(t.budgetSaved);
    onBack();
  };

  // Removing is one tap, so it can be undone from the toast.
  const clear = () => {
    const previous = state.budget ?? null;
    const previousMonthly = monthly;
    const previousLimits = limits;
    setMonthly(fieldOf(undefined, language));
    setLimits({});
    setState(prev => withWorkspaceBudget(prev, workspaceId, null));
    if (previous && onToast) {
      onToast(t.budgetRemoved, 'info', {
        label: t.undo,
        onClick: () => {
          setState(prev => (budgetForWorkspace(prev, workspaceId) ? prev : withWorkspaceBudget(prev, workspaceId, previous)));
          setMonthly(previousMonthly);
          setLimits(previousLimits);
        },
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-1 pb-8">
      <header className="flex h-[60px] items-center gap-2">
        <button
          type="button"
          onClick={requestBack}
          aria-label={t.back}
          className="glass flex h-11 w-11 items-center justify-center rounded-full"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <h1 className="flex-1 text-[28px] font-bold tracking-[-0.6px]">{tab === 'budgets' ? t.budgets : t.subscriptions}</h1>
      </header>

      <Segmented<BudgetsTab>
        ariaLabel={`${t.budgets} / ${t.subscriptions}`}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'budgets', label: t.budgets },
          { value: 'subscriptions', label: t.subscriptions },
        ]}
      />

      {tab === 'subscriptions' ? (
        <SubscriptionsPanel state={state} onAddRecurring={onAddRecurring} onToast={onToast} />
      ) : (
        <>
          {hasBudget ? (
            <p className="px-1 text-[15px] text-muted">{t.budgetsIntro}</p>
          ) : (
            <section className="paper-tile flex items-center gap-3 p-3 pr-4">
              <span className="h-[80px] w-[100px] shrink-0" aria-hidden="true">
                <Illustration name="budgets" />
              </span>
              <p className="text-[14px] text-muted">{t.budgetsIntro}</p>
            </section>
          )}

          <section className="paper-tile flex flex-col gap-4 p-4">
            {draft.monthly > 0 && (
              <div className="flex items-center gap-4">
                <Ring ratio={progress.spentRatio} radius={50} stroke={11} color={limitColor(progress.spentRatio)}>
                  <span className="flex flex-col items-center leading-none">
                    <span className={clsx('text-[22px] font-bold tabular-nums tracking-[-0.5px]', limitTextClass(progress.spentRatio) === 'text-pos' ? 'text-on-surface' : limitTextClass(progress.spentRatio))}>
                      {formatPercent(progress.spentRatio * 100, 0, language)}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{t.spent}</span>
                  </span>
                </Ring>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={clsx('text-[12px] font-semibold uppercase tracking-wide', progress.left < 0 ? 'text-neg' : 'text-faint')}>
                    {progress.left < 0 ? fill(t.amountOver, { amount: '' }).trim() : fill(t.amountLeft, { amount: '' }).trim()}
                  </span>
                  <Big size={26} className={clsx('tabular-nums', progress.left < 0 ? 'text-neg' : undefined)}>
                    {money(Math.abs(progress.left), currency, language)}
                  </Big>
                  <span className="text-[13px] text-muted">{fill(t.daysLeftCount, { days: String(daysLeft) })}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <DeltaPill direction={fast ? 'up' : 'flat'} tone={progress.left < 0 || fast ? 'neg' : 'pos'}>
                      {fast ? t.spendingFast : t.onPace}
                    </DeltaPill>
                    {progress.left > 0 && (
                      <span className="text-[12px] text-muted">{fill(t.perDay, { amount: money(progress.left / daysLeft, currency, language) })}</span>
                    )}
                  </span>
                </div>
              </div>
            )}
            {draft.monthly > 0 && (
              <p className="-mt-1 text-[12px] text-muted">
                {t.thisMonth} · {fill(t.spentOfLimit, { spent: money(progress.spent, currency, language), limit: money(progress.total, currency, language) })}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor="budget-monthly" className="text-[15px] font-bold">{t.monthlyTotal}</label>
              <div className={clsx(
                'flex h-12 items-center gap-2 rounded-[16px] bg-chip px-4 focus-within:ring-2 focus-within:ring-accent/40',
                monthlyRead.invalid && 'ring-2 ring-neg focus-within:ring-neg',
              )}>
                <AmountInput
                  id="budget-monthly"
                  value={monthly.amount}
                  onValueChange={(amount, text) => setMonthly({ amount, text })}
                  language={language}
                  emptyWhenZero
                  placeholder={t.noLimit}
                  aria-invalid={monthlyRead.invalid}
                  aria-describedby={monthlyRead.invalid ? 'budget-monthly-error' : undefined}
                  className="min-w-0 flex-1 bg-transparent text-[18px] font-bold tabular-nums text-on-surface placeholder:text-[16px] placeholder:font-medium placeholder:text-faint focus:outline-none"
                />
                <span className="text-[14px] font-semibold text-muted">{currency}</span>
              </div>
              {monthlyRead.invalid && (
                <p id="budget-monthly-error" role="alert" className="px-1 text-[12px] font-medium text-neg">{t.amountUnreadable}</p>
              )}
            </div>
          </section>

          <section className="paper-tile flex flex-col p-4 pb-1">
            <h2 className="mb-1 text-[17px] font-bold">{t.categoryLimits}</h2>
            {orderedCategories.map((category, i) => {
              const spent = spentByCategory.get(category.id) ?? 0;
              const limit = draft.categoryLimits[category.id] ?? 0;
              const ratio = limit > 0 ? spent / limit : 0;
              const inputId = `budget-limit-${category.id}`;
              const invalid = limitReads[category.id]?.invalid ?? false;
              const name = localizeCategoryName(category, language);
              return (
                <div key={category.id} className={clsx('flex items-center gap-3 py-3', i < orderedCategories.length - 1 && 'border-b border-hair')}>
                  {limit > 0 ? (
                    <Ring ratio={ratio} radius={21} stroke={4} color={limitColor(ratio, category.color)}>
                      <IconTile icon={iconForCategory(category)} color={category.color} size={32} shape="circle" />
                    </Ring>
                  ) : (
                    <span className="flex h-[46px] w-[46px] flex-none items-center justify-center">
                      <CategoryGlyph category={category} size={38} />
                    </span>
                  )}
                  <label htmlFor={inputId} className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{name}</span>
                    {invalid ? (
                      <span id={`${inputId}-error`} role="alert" className="block text-[12px] font-medium text-neg">{t.amountUnreadable}</span>
                    ) : limit > 0 ? (
                      <>
                        <span className="block truncate text-[12px] text-muted">
                          {fill(t.spentOfLimit, { spent: money(spent, currency, language), limit: money(limit, currency, language) })}
                        </span>
                        <span className={clsx('block truncate text-[12px] font-semibold', limitTextClass(ratio))}>
                          {ratio > 1
                            ? fill(t.amountOver, { amount: money(spent - limit, currency, language) })
                            : fill(t.amountLeft, { amount: money(limit - spent, currency, language) })}
                        </span>
                      </>
                    ) : (
                      <span className="block truncate text-[12px] text-muted">{`${t.spent} · ${money(spent, currency, language)}`}</span>
                    )}
                  </label>
                  <AmountInput
                    id={inputId}
                    value={limits[category.id]?.amount}
                    onValueChange={(amount, text) => setLimits(prev => ({ ...prev, [category.id]: { amount, text } }))}
                    language={language}
                    emptyWhenZero
                    placeholder={t.noLimit}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${inputId}-error` : undefined}
                    className={clsx(
                      'h-11 w-[132px] shrink-0 rounded-[14px] bg-chip px-3 text-right text-[15px] font-semibold tabular-nums text-on-surface placeholder:font-medium placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40',
                      invalid && 'ring-2 ring-neg focus:ring-neg',
                    )}
                  />
                </div>
              );
            })}
          </section>

          {invalidCount > 0 && (
            <p id="budget-save-hint" className="px-1 text-[13px] font-medium text-neg">{t.budgetFixAmounts}</p>
          )}
          <div className="flex gap-2">
            {state.budget && (
              <button type="button" onClick={clear} className="h-12 rounded-full bg-chip px-5 text-[15px] font-semibold text-neg">
                {t.removeBudget}
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={invalidCount > 0}
              aria-describedby={invalidCount > 0 ? 'budget-save-hint' : undefined}
              className="h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-40"
            >
              {t.save}
            </button>
          </div>
        </>
      )}
      <ConfirmDialog
        isOpen={confirmingDiscard}
        type="warning"
        title={t.discardBudgetTitle}
        message={t.discardBudgetMessage}
        confirmLabel={t.discard}
        cancelLabel={t.keepEditing}
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={discardAndLeave}
      />
    </div>
  );
};
