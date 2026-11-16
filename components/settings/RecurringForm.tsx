import React, { useEffect, useId, useRef } from 'react';
import clsx from 'clsx';
import { Calendar } from 'lucide-react';
import type { Account, Category, Currency, RecurrenceFrequency, TransactionType } from '../../types';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import { AmountInput } from '../ui/AmountInput';
import { Segmented } from '../ui/Segmented';
import { parseAmountInput } from '../../utils/numberInput';
import { localizeCategoryName } from '../../utils/systemText';
import type { RecurringDraft, RecurringErrors, RecurringFieldError } from './recurringDraft';

type Strings = (typeof TRANSLATIONS)['en'];

interface RecurringFormProps {
  mode: 'new' | 'edit';
  draft: RecurringDraft;
  errors: RecurringErrors;
  categories: Category[];
  accounts: Account[];
  language: 'en' | 'sr';
  onName: (name: string) => void;
  onAmountText: (text: string) => void;
  onType: (type: TransactionType) => void;
  onFrequency: (frequency: RecurrenceFrequency) => void;
  onCategory: (id: string) => void;
  onAccount: (id: string) => void;
  onCurrency: (currency: Currency) => void;
  onStartDate: (date: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const fieldLabel = 'px-1 text-[12px] font-semibold text-muted';
// Width is set per field: two width utilities on one element would fight over the cascade.
const fieldBox = 'h-12 min-w-0 rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40';
const fieldBase = `${fieldBox} w-full`;

const errorText = (error: RecurringFieldError, t: Strings): string => ({
  nameRequired: t.recurringNameRequired,
  amountRequired: t.amountRequired,
  amountUnreadable: t.amountUnreadable,
  amountNotPositive: t.amountAboveZero,
  categoryRequired: t.chooseCategory,
  accountRequired: t.chooseWallet,
})[error];

/** Add or edit a recurring transaction. Amounts go through AmountInput (decimal comma, no negatives). */
export const RecurringForm: React.FC<RecurringFormProps> = ({
  mode,
  draft,
  errors,
  categories,
  accounts,
  language,
  onName,
  onAmountText,
  onType,
  onFrequency,
  onCategory,
  onAccount,
  onCurrency,
  onStartDate,
  onSubmit,
  onCancel,
}) => {
  const t = TRANSLATIONS[language];
  const id = useId();
  const rootRef = useRef<HTMLFormElement>(null);
  const typedCategories = categories.filter(category => category.type === draft.type);

  // An edit opens in place of its row; keep the whole form on screen.
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, []);

  const describe = (field: keyof RecurringErrors) => (errors[field] ? `${id}-${field}-error` : undefined);
  const fieldError = (field: keyof RecurringErrors) => {
    const error = errors[field];
    return error ? (
      <p id={`${id}-${field}-error`} role="alert" className="px-1 text-[12px] font-medium text-neg">
        {errorText(error, t)}
      </p>
    ) : null;
  };

  return (
    <form
      ref={rootRef}
      noValidate
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
      aria-label={mode === 'new' ? t.addRecurringTransaction : t.recurringEditRow.replace('{name}', draft.name)}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <Segmented<TransactionType>
        ariaLabel={t.transactionType}
        value={draft.type}
        onChange={onType}
        options={[
          { value: 'expense', label: t.expense },
          { value: 'income', label: t.income },
        ]}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className={fieldLabel}>{t.name}</label>
        <input
          id={`${id}-name`}
          type="text"
          value={draft.name}
          onChange={event => onName(event.target.value)}
          placeholder={t.recurringNamePlaceholder}
          maxLength={120}
          aria-invalid={!!errors.name}
          aria-describedby={describe('name')}
          enterKeyHint="next"
          autoFocus={mode === 'new'}
          className={clsx(fieldBase, errors.name && 'ring-2 ring-neg')}
        />
        {fieldError('name')}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-amount`} className={fieldLabel}>{t.amount}</label>
        <div className="flex gap-2">
          <AmountInput
            id={`${id}-amount`}
            value={parseAmountInput(draft.amountText, language)}
            onValueChange={(_, text) => onAmountText(text)}
            language={language}
            emptyWhenZero
            placeholder="0"
            enterKeyHint="next"
            aria-invalid={!!errors.amount}
            aria-describedby={describe('amount')}
            className={clsx(fieldBox, 'flex-1 font-semibold tabular-nums', errors.amount && 'ring-2 ring-neg')}
          />
          <select
            value={draft.currency}
            onChange={event => onCurrency(event.target.value as Currency)}
            aria-label={t.currency}
            className={clsx(fieldBox, 'w-[104px] shrink-0 font-semibold')}
          >
            {CURRENCIES.map(currency => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>
        {fieldError('amount')}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-category`} className={fieldLabel}>{t.category}</label>
          <select
            id={`${id}-category`}
            value={draft.categoryId}
            onChange={event => onCategory(event.target.value)}
            aria-invalid={!!errors.category}
            aria-describedby={describe('category')}
            className={clsx(fieldBase, !draft.categoryId && 'text-faint', errors.category && 'ring-2 ring-neg')}
          >
            <option value="" disabled>{t.chooseCategory}</option>
            {typedCategories.map(category => (
              <option key={category.id} value={category.id} className="text-on-surface">
                {localizeCategoryName(category, language)}
              </option>
            ))}
          </select>
          {fieldError('category')}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-wallet`} className={fieldLabel}>{t.wallet}</label>
          <select
            id={`${id}-wallet`}
            value={draft.accountId}
            onChange={event => onAccount(event.target.value)}
            aria-invalid={!!errors.account}
            aria-describedby={describe('account')}
            className={clsx(fieldBase, !draft.accountId && 'text-faint', errors.account && 'ring-2 ring-neg')}
          >
            <option value="" disabled>{t.chooseWallet}</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id} className="text-on-surface">
                {account.name} · {account.currency}
              </option>
            ))}
          </select>
          {fieldError('account')}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-repeat`} className={fieldLabel}>{t.repeat}</label>
          <select
            id={`${id}-repeat`}
            value={draft.frequency}
            onChange={event => onFrequency(event.target.value as RecurrenceFrequency)}
            className={fieldBase}
          >
            <option value="daily">{t.daily}</option>
            <option value="weekly">{t.weekly}</option>
            <option value="biweekly">{t.biweekly}</option>
            <option value="monthly">{t.monthly}</option>
            <option value="yearly">{t.yearly}</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-start`} className={clsx(fieldLabel, 'flex items-center gap-1')}>
            <Calendar size={12} aria-hidden="true" />
            {t.startsOn}
          </label>
          <input
            id={`${id}-start`}
            type="date"
            value={draft.startDate}
            onChange={event => onStartDate(event.target.value)}
            required
            className={clsx(fieldBase, 'px-3')}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-full px-4 text-[14px] font-semibold text-muted hover:bg-chip"
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          className="h-11 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent"
        >
          {mode === 'new' ? t.add : t.save}
        </button>
      </div>
    </form>
  );
};
