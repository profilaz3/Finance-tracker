import React, { useEffect, useMemo, useState } from 'react';
import { CategoryGlyph } from './ui/CategoryGlyph';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import type { AppState, Budget, RecurringTransaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { computeBudgetProgress, computeMonthSummary, monthKeyOf } from '../domain/home';
import { parseOptionalNumberInput } from '../utils/numberInput';
import { fill, money } from './home/parts';
import { Segmented } from './ui/Segmented';
import { SubscriptionsPanel } from './subscriptions';
import { OPEN_SUBSCRIPTIONS_EVENT, takeSubscriptionsTabRequest } from '../services/subscriptionStore';

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
}

const MAX_AMOUNT = 1_000_000_000;

const toText = (value: number | undefined) => (value && value > 0 ? String(value) : '');

/** Parse a typed amount; accepts a decimal comma. Empty, zero or invalid means "no limit". */
const parseAmount = (text: string): number => {
  const value = parseOptionalNumberInput(text.replace(',', '.'));
  if (value === undefined || value <= 0) return 0;
  return Math.min(MAX_AMOUNT, Math.round(value * 100) / 100);
};

export const BudgetsView: React.FC<BudgetsViewProps> = ({ state, setState, onBack, onSaved, onAddRecurring, onToast }) => {
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
  const [monthly, setMonthly] = useState(() => toText(state.budget?.monthly));
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(state.budget?.categoryLimits ?? {}).map(([id, value]) => [id, toText(value)])),
  );

  const expenseCategories = useMemo(() => state.categories.filter(category => category.type === 'expense'), [state.categories]);
  const summary = useMemo(
    () => computeMonthSummary(state, monthKeyOf(new Date())),
    [state.transactions, state.categories, state.baseCurrency, state.rates],
  );

  const draft: Budget = {
    monthly: parseAmount(monthly),
    categoryLimits: Object.fromEntries(
      Object.entries(limits)
        .map(([id, text]) => [id, parseAmount(text)] as const)
        .filter(([id, value]) => value > 0 && expenseCategories.some(category => category.id === id)),
    ),
  };
  const progress = computeBudgetProgress(draft, summary, state.categories);
  const spentByCategory = new Map(summary.byCategory.map(entry => [entry.categoryId, entry.amount] as const));
  const hasBudget = draft.monthly > 0 || Object.keys(draft.categoryLimits).length > 0;

  const save = () => {
    setState(prev => ({ ...prev, budget: hasBudget ? draft : null }));
    onSaved(t.budgetSaved);
    onBack();
  };

  const clear = () => {
    setMonthly('');
    setLimits({});
    setState(prev => ({ ...prev, budget: null }));
  };

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 px-1 pb-8">
      <header className="flex h-[60px] items-center gap-2">
        <button
          type="button"
          onClick={onBack}
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
          <p className="px-1 text-[15px] text-muted">{t.budgetsIntro}</p>

          <section className="paper-tile flex flex-col gap-3 p-4">
            <label htmlFor="budget-monthly" className="text-[17px] font-bold">{t.monthlyTotal}</label>
            <div className="paper-field flex h-14 items-center gap-2 rounded-[18px] px-4">
              <input
                id="budget-monthly"
                inputMode="decimal"
                value={monthly}
                onChange={event => setMonthly(event.target.value)}
                placeholder={t.noLimit}
                className="min-w-0 flex-1 bg-transparent text-[22px] font-bold text-on-surface placeholder:text-[17px] placeholder:font-medium placeholder:text-faint focus:outline-none"
              />
              <span className="text-[15px] font-semibold text-muted">{currency}</span>
            </div>
            {draft.monthly > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="block h-2 rounded-full bg-chip">
                  <span
                    className={clsx('block h-2 rounded-full', progress.left < 0 ? 'bg-neg' : 'bg-accent')}
                    style={{ width: `${Math.min(100, progress.spentRatio * 100).toFixed(1)}%` }}
                  />
                </span>
                <span className="text-[13px] text-muted">
                  {t.thisMonth} · {fill(t.spentOfLimit, { spent: money(progress.spent, currency, language), limit: money(progress.total, currency, language) })}
                </span>
              </div>
            )}
          </section>

          <section className="paper-tile flex flex-col p-4 pb-1">
            <h2 className="mb-1 text-[17px] font-bold">{t.categoryLimits}</h2>
            {expenseCategories.map((category, i) => {
              const spent = spentByCategory.get(category.id) ?? 0;
              const limit = draft.categoryLimits[category.id] ?? 0;
              const over = limit > 0 && spent > limit;
              const inputId = `budget-limit-${category.id}`;
              return (
                <div key={category.id} className={clsx('flex flex-col gap-1.5 py-3', i < expenseCategories.length - 1 && 'border-b border-hair')}>
                  <div className="flex items-center gap-3">
                    <CategoryGlyph category={category} size={36} />
                    <label htmlFor={inputId} className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{category.name}</span>
                      <span className={clsx('block text-[12px]', over ? 'font-semibold text-neg' : 'text-muted')}>
                        {limit > 0
                          ? fill(t.spentOfLimit, { spent: money(spent, currency, language), limit: money(limit, currency, language) })
                          : `${t.spent} · ${money(spent, currency, language)}`}
                      </span>
                    </label>
                    <input
                      id={inputId}
                      inputMode="decimal"
                      value={limits[category.id] ?? ''}
                      onChange={event => setLimits(prev => ({ ...prev, [category.id]: event.target.value }))}
                      placeholder={t.noLimit}
                      className="paper-field h-10 w-[112px] rounded-[14px] px-3 text-right text-[15px] font-semibold text-on-surface placeholder:font-medium placeholder:text-faint focus:outline-none"
                    />
                  </div>
                  {limit > 0 && (
                    <span className="ml-12 block h-1.5 rounded-full bg-chip">
                      <span
                        className="block h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (spent / limit) * 100).toFixed(1)}%`, background: over ? 'var(--paper-neg)' : category.color }}
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </section>

          <div className="flex gap-2">
            {state.budget && (
              <button type="button" onClick={clear} className="h-12 rounded-full bg-chip px-5 text-[15px] font-semibold text-neg">
                {t.removeBudget}
              </button>
            )}
            <button type="button" onClick={save} className="h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent">
              {t.save}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
