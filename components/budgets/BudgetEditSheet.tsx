import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { AppState, Budget } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { computeMonthSummary, monthKeyOf } from '../../domain/home';
import { budgetForWorkspace, withWorkspaceBudget } from '../../domain/teams';
import { formatAmountForInput } from '../../utils/numberInput';
import { mergeBudgetDraft, readBudgetLimit, sameBudget } from '../../utils/budgetLimit';
import { localizeCategoryName } from '../../utils/systemText';
import { useBackLayer } from '../../hooks/useBackLayer';
import { AmountInput } from '../ui/AmountInput';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { GlassSheet } from '../ui/GlassSheet';
import { ConfirmDialog } from '../ConfirmDialog';
import { fill } from '../home/parts';
import { plainAmount } from '../stats/analyticsStrings';
import { getIntlLocale } from '../../utils/locale';
import type { BudgetStrings } from './budgetStrings';

/** A limit as typed: the parsed amount (undefined while empty or unreadable) and the raw text. */
interface LimitField {
  amount: number | undefined;
  text: string;
}

const fieldOf = (value: number | undefined, language: 'en' | 'sr'): LimitField =>
  value && value > 0 ? { amount: value, text: formatAmountForInput(value, language) } : { amount: undefined, text: '' };

const limitsOf = (budget: Budget | null | undefined, language: 'en' | 'sr') =>
  Object.fromEntries(Object.entries(budget?.categoryLimits ?? {}).map(([id, value]) => [id, fieldOf(value, language)]));

/** Where the sheet puts the cursor when it opens: the monthly total or one category's limit. */
export type BudgetEditFocus = 'monthly' | { categoryId: string } | undefined;

const MONTHLY_ID = 'budget-monthly';
const limitId = (categoryId: string) => `budget-limit-${categoryId}`;

interface BudgetEditSheetProps {
  isOpen: boolean;
  focus: BudgetEditFocus;
  onClose: () => void;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  workspaceId: string | null;
  onSaved: (message: string) => void;
  onRemove: () => void;
  s: BudgetStrings;
}

/**
 * The monthly total and every category limit in one form. Closing with changes that were not
 * saved asks first; limits of categories this workspace does not show are kept on save.
 */
export const BudgetEditSheet: React.FC<BudgetEditSheetProps> = ({ isOpen, focus, onClose, state, setState, workspaceId, onSaved, onRemove, s }) => {
  const { language, baseCurrency: currency } = state;
  const t = TRANSLATIONS[language];
  const locale = getIntlLocale(language);
  // Amounts in the rows wrap rather than cut off; the currency is beside the monthly total.
  const plain = (value: number) => plainAmount(value, currency, locale);
  const [monthly, setMonthly] = useState<LimitField>(() => fieldOf(state.budget?.monthly, language));
  const [limits, setLimits] = useState<Record<string, LimitField>>(() => limitsOf(state.budget, language));
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Every opening starts from the saved budget.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setMonthly(fieldOf(state.budget?.monthly, language));
      setLimits(limitsOf(state.budget, language));
      setConfirmingDiscard(false);
    }
  }

  const expenseCategories = useMemo(() => state.categories.filter(category => category.type === 'expense'), [state.categories]);
  const summary = useMemo(
    () => computeMonthSummary(state, monthKeyOf(new Date())),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the summary reads only these
    [state.transactions, state.categories, state.baseCurrency, state.rates],
  );
  const spentByCategory = useMemo(() => new Map(summary.byCategory.map(entry => [entry.categoryId, entry.amount] as const)), [summary]);

  // Categories with a saved limit first, then by spend; fixed while typing so rows do not jump.
  const orderedCategories = useMemo(() => {
    const saved = state.budget?.categoryLimits ?? {};
    return [...expenseCategories].sort((a, b) =>
      Number(Boolean(saved[b.id])) - Number(Boolean(saved[a.id]))
      || (spentByCategory.get(b.id) ?? 0) - (spentByCategory.get(a.id) ?? 0));
  }, [expenseCategories, state.budget, spentByCategory]);

  const monthlyRead = readBudgetLimit(monthly.text, language);
  const limitReads = Object.fromEntries(Object.entries(limits).map(([id, field]) => [id, readBudgetLimit(field.text, language)] as const));
  const invalidCount = Number(monthlyRead.invalid) + expenseCategories.filter(category => limitReads[category.id]?.invalid).length;
  const draft: Budget = {
    monthly: monthlyRead.value,
    categoryLimits: Object.fromEntries(
      Object.entries(limitReads)
        .map(([id, read]) => [id, read.value] as const)
        .filter(([id, value]) => value > 0 && expenseCategories.some(category => category.id === id)),
    ),
  };
  // Compared like the draft is built: limits of categories not shown here do not count.
  const savedShown: Budget = {
    monthly: state.budget?.monthly ?? 0,
    categoryLimits: Object.fromEntries(Object.entries(state.budget?.categoryLimits ?? {})
      .filter(([id]) => expenseCategories.some(category => category.id === id))),
  };
  const isDirty = invalidCount > 0 || !sameBudget(draft, savedShown);

  const requestClose = () => {
    if (isDirty) setConfirmingDiscard(true);
    else onClose();
  };
  useBackLayer('budget-edit', isOpen && !confirmingDiscard, requestClose);
  useBackLayer('budget-discard-confirm', isOpen && confirmingDiscard, () => setConfirmingDiscard(false));

  // Put the cursor where the user tapped once the sheet has slid in.
  const focusId = focus === 'monthly' ? MONTHLY_ID : focus ? limitId(focus.categoryId) : null;
  useEffect(() => {
    if (!isOpen || !focusId) return;
    const timer = window.setTimeout(() => {
      const field = document.getElementById(focusId);
      field?.scrollIntoView({ block: 'center' });
      field?.focus({ preventScroll: true });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [isOpen, focusId]);

  const save = () => {
    if (invalidCount > 0) return;
    const shownIds = new Set(expenseCategories.map(category => category.id));
    setState(prev => withWorkspaceBudget(prev, workspaceId, mergeBudgetDraft(budgetForWorkspace(prev, workspaceId), draft, shownIds)));
    onSaved(t.budgetSaved);
    onClose();
  };

  return (
    <>
      <GlassSheet
        isOpen={isOpen}
        onClose={requestClose}
        title={s.editTitle}
        closeLabel={t.close}
        footer={
          <div className="flex flex-col gap-2">
            {invalidCount > 0 && <p id="budget-save-hint" className="px-1 text-[13px] font-medium text-neg">{t.budgetFixAmounts}</p>}
            <div className="flex gap-2">
              {state.budget && (
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    onClose();
                  }}
                  className="h-12 rounded-full bg-chip px-5 text-[15px] font-semibold text-neg"
                >
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
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor={MONTHLY_ID} className="px-1 text-[15px] font-bold">{t.monthlyTotal}</label>
            <div className={clsx(
              'flex h-12 items-center gap-2 rounded-[16px] bg-chip px-4 focus-within:ring-2 focus-within:ring-accent/40',
              monthlyRead.invalid && 'ring-2 ring-neg focus-within:ring-neg',
            )}>
              <AmountInput
                id={MONTHLY_ID}
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

          <div className="flex flex-col">
            <h3 className="px-1 text-[15px] font-bold">{t.categoryLimits}</h3>
            {orderedCategories.map((category, i) => {
              const spent = spentByCategory.get(category.id) ?? 0;
              const limit = draft.categoryLimits[category.id] ?? 0;
              const inputId = limitId(category.id);
              const invalid = limitReads[category.id]?.invalid ?? false;
              return (
                <div key={category.id} className={clsx('flex items-center gap-3 py-2.5', i < orderedCategories.length - 1 && 'border-b border-hair')}>
                  <CategoryGlyph category={category} size={36} />
                  <label htmlFor={inputId} className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{localizeCategoryName(category, language)}</span>
                    {invalid ? (
                      <span id={`${inputId}-error`} role="alert" className="block text-[12px] font-medium text-neg">{t.amountUnreadable}</span>
                    ) : (
                      <span className="block text-[12.5px] leading-snug text-muted">
                        {limit > 0
                          ? fill(t.spentOfLimit, { spent: plain(spent), limit: plain(limit) })
                          : `${t.spent} · ${plain(spent)}`}
                      </span>
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
          </div>
        </div>
      </GlassSheet>
      <ConfirmDialog
        isOpen={confirmingDiscard}
        type="warning"
        title={t.discardBudgetTitle}
        message={t.discardBudgetMessage}
        confirmLabel={t.discard}
        cancelLabel={t.keepEditing}
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={() => {
          setConfirmingDiscard(false);
          onClose();
        }}
      />
    </>
  );
};
