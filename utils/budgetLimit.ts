import type { Budget } from '../types';
import { parseAmountInput } from './numberInput';

/** Largest budget the form accepts. */
export const BUDGET_MAX_AMOUNT = 1_000_000_000;

/**
 * A budget limit as typed, read in the app language ("50.000" is fifty thousand in Serbian,
 * "1.500,50" is 1500.5). Empty or 0 means "no limit". Text that cannot be read, a negative or an
 * absurd amount is invalid: it must never silently turn into "no limit".
 */
export const readBudgetLimit = (text: string, language: 'en' | 'sr'): { value: number; invalid: boolean } => {
  if (!text.trim()) return { value: 0, invalid: false };
  const parsed = parseAmountInput(text, language);
  if (parsed === undefined || parsed < 0 || parsed > BUDGET_MAX_AMOUNT) return { value: 0, invalid: true };
  return { value: Math.round(parsed * 100) / 100, invalid: false };
};

/** Whether two budgets set the same limits (a missing budget sets none). */
export const sameBudget = (a: Budget | null | undefined, b: Budget | null | undefined): boolean => {
  const limitsOf = (budget: Budget | null | undefined) =>
    Object.entries(budget?.categoryLimits ?? {}).filter(([, value]) => value > 0);
  const aLimits = limitsOf(a);
  const bLimits = new Map(limitsOf(b));
  return (a?.monthly ?? 0) === (b?.monthly ?? 0)
    && aLimits.length === bLimits.size
    && aLimits.every(([id, value]) => bLimits.get(id) === value);
};

/**
 * The budget to store after editing: the edited limits, plus the saved limits of categories the
 * form did not show (another workspace's categories), so saving in one workspace never erases
 * them. Returns null when nothing is left.
 */
export const mergeBudgetDraft = (
  saved: Budget | null | undefined,
  draft: Budget,
  shownCategoryIds: ReadonlySet<string>,
): Budget | null => {
  const hidden = Object.entries(saved?.categoryLimits ?? {})
    .filter(([id, value]) => !shownCategoryIds.has(id) && value > 0);
  const merged: Budget = {
    monthly: draft.monthly,
    categoryLimits: { ...Object.fromEntries(hidden), ...draft.categoryLimits },
  };
  return merged.monthly > 0 || Object.keys(merged.categoryLimits).length > 0 ? merged : null;
};
