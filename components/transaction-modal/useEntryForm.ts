import { useEffect, useMemo, useState } from 'react';
import type { SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { TRANSLATIONS } from '../../constants';
import type { Account, Category, Currency, ExchangeRates, Transaction } from '../../types';
import { merchantMemoryFor, usualChoice } from '../../domain/merchantMemory';
import { FEE_CURRENCY, toStoredFee } from '../../domain/money';
import { convertAmount } from '../../services/currencyService';
import {
  createTransactionDraft,
  defaultCategoryId,
  isSystemCategoryId,
  prepareEntry,
  repaymentCategoryId,
  TRANSFER_CATEGORY_ID,
  type EntryKind,
} from '../../domain/transactions';

type Translations = typeof TRANSLATIONS['en'];

interface EntryFormOptions {
  transaction: Transaction | null;
  isNewTransaction: boolean;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  t: Translations;
  /** Lets the fee be typed in the entry's currency and shows what a transfer arrives as. */
  rates?: ExchangeRates;
}

interface FormState {
  edited: Transaction;
  targetAccountId: string;
  isPairedTransfer: boolean;
  /** Text is present in the amount field but cannot be read as a number. */
  amountUnreadable: boolean;
  feesUnreadable: boolean;
  /** The fee as typed, in the entry's currency (USD without rates); only used once edited. */
  feeTyped: number | undefined;
  feesEdited: boolean;
  /** The person typed in the amount field (focus alone, even moved in and out by the app, is not). */
  amountEdited: boolean;
  amountTouched: boolean;
  submitted: boolean;
  /** The person chose these themselves: habits and wallet changes stop overriding them. */
  categoryPicked: boolean;
  currencyPicked: boolean;
}

const startState = (
  { transaction, isNewTransaction, accounts, categories, transactions }: EntryFormOptions,
): FormState => {
  const draft = transaction ?? createTransactionDraft({
    createId: uuidv4,
    baseCurrency: accounts[0]?.currency ?? 'RSD',
    accountId: accounts[0]?.id ?? '',
    accounts,
    categories,
    transactions,
  });
  const prepared = prepareEntry(draft, { isNew: isNewTransaction || !transaction, accounts, categories, transactions });
  return {
    edited: prepared.entry,
    targetAccountId: prepared.targetAccountId,
    isPairedTransfer: prepared.isPairedTransfer,
    amountUnreadable: false,
    feesUnreadable: false,
    feeTyped: undefined,
    feesEdited: false,
    amountEdited: false,
    amountTouched: false,
    submitted: false,
    categoryPicked: false,
    currencyPicked: false,
  };
};

/** The language a translation table belongs to (the modal only receives `t`). */
export const languageOf = (t: Translations): 'en' | 'sr' => (t === TRANSLATIONS.sr ? 'sr' : 'en');

/**
 * State and rules of the entry form (expense, income or transfer). The draft is ready on the
 * first render, so the dialog can move focus into itself as it opens.
 */
export function useEntryForm(options: EntryFormOptions) {
  const { transaction, isNewTransaction, accounts, categories, transactions, t, rates } = options;
  const [source, setSource] = useState(transaction);
  const [form, setForm] = useState(() => startState(options));
  if (source !== transaction) {
    setSource(transaction);
    setForm(startState(options));
  }

  const { edited, targetAccountId } = form;
  const kind: EntryKind = edited.categoryId === TRANSFER_CATEGORY_ID && (isNewTransaction || form.isPairedTransfer)
    ? 'transfer'
    : edited.type;
  const accountById = (accountId: string) => accounts.find(account => account.id === accountId);

  const setEdited = (update: SetStateAction<Transaction>) =>
    setForm(prev => ({ ...prev, edited: typeof update === 'function' ? update(prev.edited) : update }));

  // New entries: once the note names a shop the user has a clear habit for, preselect that
  // category, unless they already picked one themselves.
  const merchantText = edited.receiptData?.merchant || edited.note || '';
  const usual = useMemo(
    () => (isNewTransaction && merchantText ? usualChoice(merchantMemoryFor(transactions), merchantText) : null),
    [isNewTransaction, merchantText, transactions]
  );
  useEffect(() => {
    if (!usual) return;
    const category = categories.find(c => c.id === usual.categoryId);
    if (!category) return;
    setForm(prev => {
      const current = prev.edited;
      if (prev.categoryPicked || current.categoryId === category.id || current.categoryId === TRANSFER_CATEGORY_ID) return prev;
      if (category.type !== current.type || current.personId) return prev;
      return { ...prev, edited: { ...current, categoryId: category.id, subcategory: '' } };
    });
  }, [usual, categories]);

  const setAmount = (amount: number | undefined, text: string) =>
    setForm(prev => ({
      ...prev,
      amountUnreadable: amount === undefined && text.trim() !== '',
      amountEdited: true,
      edited: { ...prev.edited, amount: amount ?? 0 },
    }));

  const setFees = (fee: number | undefined, text: string) =>
    setForm(prev => ({
      ...prev,
      feesUnreadable: fee === undefined && text.trim() !== '',
      feesEdited: true,
      feeTyped: fee,
    }));

  // Fees are stored in USD. With rates the field shows and takes them in the entry's currency;
  // an untouched fee is saved exactly as stored (no round trip through the rates).
  const feeCurrency: Currency = rates ? edited.currency : FEE_CURRENCY;
  const storedFeeShown = edited.fees && rates
    ? Math.round(convertAmount(edited.fees, FEE_CURRENCY, edited.currency, rates) * 100) / 100
    : edited.fees;
  const feeShown = form.feesEdited ? form.feeTyped : storedFeeShown;
  const storedFee = (): number | undefined => {
    if (!form.feesEdited) return edited.fees;
    if (rates) return toStoredFee(form.feeTyped, edited.currency, rates);
    return form.feeTyped && form.feeTyped > 0 ? Math.round(form.feeTyped * 100) / 100 : undefined;
  };

  /** The currency follows the wallet (always for a transfer) unless the person set it themselves. */
  const pickAccount = (accountId: string) =>
    setForm(prev => {
      const next = accountById(accountId);
      const previous = accountById(prev.edited.accountId);
      const follows = kind === 'transfer' || (!prev.currencyPicked && (!previous || prev.edited.currency === previous.currency));
      return {
        ...prev,
        targetAccountId: prev.targetAccountId === accountId ? '' : prev.targetAccountId,
        edited: { ...prev.edited, accountId, currency: follows && next ? next.currency : prev.edited.currency },
      };
    });

  const pickTarget = (accountId: string) => setForm(prev => ({ ...prev, targetAccountId: accountId }));

  const pickCurrency = (currency: Currency) =>
    setForm(prev => ({ ...prev, currencyPicked: true, edited: { ...prev.edited, currency } }));

  const pickCategory = (category: Category) =>
    setForm(prev => ({ ...prev, categoryPicked: true, edited: { ...prev.edited, categoryId: category.id, subcategory: '' } }));

  /** Expense, income or (new entries only) transfer; categories are only offered for the current kind. */
  const setKind = (next: EntryKind) =>
    setForm(prev => {
      const current = prev.edited;
      if (next === 'transfer') {
        const from = accountById(current.accountId);
        return {
          ...prev,
          edited: { ...current, type: 'expense', categoryId: TRANSFER_CATEGORY_ID, subcategory: '', personId: undefined, eventId: undefined, currency: from?.currency ?? current.currency },
        };
      }
      const category = categories.find(c => c.id === current.categoryId);
      const keeps = current.categoryId !== TRANSFER_CATEGORY_ID && category?.type === next;
      return {
        ...prev,
        categoryPicked: keeps && prev.categoryPicked,
        targetAccountId: '',
        edited: {
          ...current,
          type: next,
          categoryId: keeps ? current.categoryId : defaultCategoryId(next, categories, transactions),
          subcategory: keeps ? current.subcategory : '',
        },
      };
    });

  /** A debt with a person sits on the repayment category unless the person chose another one. */
  const setPerson = (personId: string | undefined) =>
    setForm(prev => {
      const current = prev.edited;
      let categoryId = current.categoryId;
      if (isNewTransaction && !prev.categoryPicked && kind !== 'transfer') {
        const repayment = repaymentCategoryId(current.type);
        if (personId && categories.some(c => c.id === repayment)) categoryId = repayment;
        else if (!personId && isSystemCategoryId(categoryId)) categoryId = defaultCategoryId(current.type, categories, transactions);
      }
      return { ...prev, edited: { ...current, personId, categoryId, subcategory: categoryId === current.categoryId ? current.subcategory : '' } };
    });

  // "Above zero" shows once the person has typed and left the field, or tried to save.
  const touchAmount = () => setForm(prev => (prev.amountEdited && !prev.amountTouched ? { ...prev, amountTouched: true } : prev));

  const unreadable = form.amountUnreadable;
  const showRequired = form.amountTouched || form.submitted;
  const errors = {
    amount: unreadable ? t.amountUnreadable : showRequired && !(edited.amount > 0) ? t.amountAboveZero : null,
    account: form.submitted && !edited.accountId ? t.chooseWallet : null,
    target: kind !== 'transfer' ? null
      : targetAccountId && targetAccountId === edited.accountId ? t.sameWalletError
      : form.submitted && !targetAccountId ? t.chooseToWallet
      : null,
    fees: form.feesUnreadable ? t.amountUnreadable : null,
  };
  // What the To wallet of a transfer in another currency receives (as booked on save).
  const target = kind === 'transfer' ? accountById(targetAccountId) : undefined;
  const arrival = target && rates && target.currency !== edited.currency && edited.amount > 0
    ? { account: target, amount: Math.round(convertAmount(edited.amount, edited.currency, target.currency, rates) * 100) / 100 }
    : null;

  const canSave = edited.amount > 0 && !unreadable && !form.feesUnreadable && !!edited.accountId
    && (kind !== 'transfer' || (!!targetAccountId && targetAccountId !== edited.accountId));

  /**
   * Marks the form as submitted (errors show). Returns the entry to save, or null while something
   * is missing.
   */
  const submit = (): Transaction | null => {
    setForm(prev => ({ ...prev, submitted: true }));
    return canSave ? { ...edited, fees: storedFee() } : null;
  };

  return {
    edited,
    setEdited,
    kind,
    targetAccountId,
    isPairedTransfer: form.isPairedTransfer,
    usual,
    errors,
    canSave,
    feeCurrency,
    feeShown,
    arrival,
    setAmount,
    setFees,
    touchAmount,
    pickAccount,
    pickTarget,
    pickCurrency,
    pickCategory,
    setKind,
    setPerson,
    submit,
  };
}

export type EntryForm = ReturnType<typeof useEntryForm>;
