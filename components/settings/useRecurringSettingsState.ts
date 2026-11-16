import { useState } from 'react';
import type { Account, Category, Currency, RecurringTransaction } from '../../types';
import {
  amountError,
  buildRecurring,
  draftFromRecurring,
  emptyRecurringDraft,
  recurringUpdates,
  validateRecurringDraft,
  withAccount,
  withType,
  type RecurringDraft,
  type RecurringErrors,
} from './recurringDraft';

interface UseRecurringSettingsStateOptions {
  baseCurrency: Currency;
  categories: Category[];
  accounts: Account[];
  recurringTransactions: RecurringTransaction[];
  language: 'en' | 'sr';
  onAddRecurring?: (recurring: RecurringTransaction) => void;
  onUpdateRecurring?: (id: string, updates: Partial<RecurringTransaction>) => void;
  onUpdated?: () => void;
}

/** null: closed; 'new': the add form at the top; otherwise the id of the rule edited in place. */
export type RecurringFormTarget = null | 'new' | string;

export function useRecurringSettingsState({
  baseCurrency,
  categories,
  accounts,
  recurringTransactions,
  language,
  onAddRecurring,
  onUpdateRecurring,
  onUpdated,
}: UseRecurringSettingsStateOptions) {
  const [target, setTarget] = useState<RecurringFormTarget>(null);
  const [draft, setDraft] = useState<RecurringDraft>(() => emptyRecurringDraft(accounts, baseCurrency));
  // Field errors show after the first save attempt; the amount also as soon as it is unreadable.
  const [submitted, setSubmitted] = useState(false);

  const allErrors = validateRecurringDraft(draft, categories, accounts, language);
  const liveAmountError = draft.amountText.trim() ? amountError(draft.amountText, language) : undefined;
  const errors: RecurringErrors = submitted ? allErrors : liveAmountError ? { amount: liveAmountError } : {};

  const openAdd = () => {
    setDraft(emptyRecurringDraft(accounts, baseCurrency));
    setSubmitted(false);
    setTarget('new');
  };

  const openEdit = (recurring: RecurringTransaction) => {
    setDraft(draftFromRecurring(recurring, categories, accounts, language));
    setSubmitted(false);
    setTarget(recurring.id);
  };

  const close = () => {
    setTarget(null);
    setSubmitted(false);
  };

  const update = (patch: Partial<RecurringDraft>) => setDraft(current => ({ ...current, ...patch }));

  /** Returns true when the rule was saved. */
  const submit = (): boolean => {
    setSubmitted(true);
    if (Object.keys(allErrors).length > 0) return false;

    if (target === 'new') {
      if (!onAddRecurring) return false;
      onAddRecurring(buildRecurring(draft, language, crypto.randomUUID()));
    } else if (target) {
      const previous = recurringTransactions.find(recurring => recurring.id === target);
      if (!previous || !onUpdateRecurring) return false;
      onUpdateRecurring(previous.id, recurringUpdates(previous, draft, language));
      onUpdated?.();
    }
    close();
    return true;
  };

  return {
    target,
    draft,
    errors,
    openAdd,
    openEdit,
    close,
    submit,
    setName: (name: string) => update({ name }),
    setAmountText: (amountText: string) => update({ amountText }),
    setFrequency: (frequency: RecurringDraft['frequency']) => update({ frequency }),
    setStartDate: (startDate: string) => update({ startDate }),
    setCategoryId: (categoryId: string) => update({ categoryId }),
    setCurrency: (currency: Currency) => update({ currency, currencyChosen: true }),
    setType: (type: RecurringDraft['type']) => setDraft(current => withType(current, type, categories)),
    setAccountId: (accountId: string) => setDraft(current => withAccount(current, accountId, accounts)),
  };
}
