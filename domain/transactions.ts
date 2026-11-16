import { Account, Category, Currency, ExchangeRates, Person, Transaction, TransactionTemplate, TransactionType } from '../types';
import type { ParsedTransaction } from '../utils/aiShared';
import { parseAmountInput } from '../utils/numberInput';
import { toStoredFee } from './money';
import { withReceiptPhoto } from './receiptPhoto';

/** What the add form opens as: a transfer is booked as an expense leg plus an income leg. */
export type EntryKind = TransactionType | 'transfer';

export const TRANSFER_CATEGORY_ID = 'internal-transfer';
const DEBT_REPAYMENT_CATEGORY_ID = 'debt-repayment';
const LOAN_REPAYMENT_CATEGORY_ID = 'loan-repayment';

/** App-internal categories: excluded from totals, never a default for a plain expense or income. */
export const SYSTEM_CATEGORY_IDS: ReadonlySet<string> = new Set([
  TRANSFER_CATEGORY_ID,
  DEBT_REPAYMENT_CATEGORY_ID,
  LOAN_REPAYMENT_CATEGORY_ID,
]);

export const isSystemCategoryId = (categoryId: string | undefined): boolean =>
  !!categoryId && SYSTEM_CATEGORY_IDS.has(categoryId);

/** The debt category of a person-linked entry: money back to me (income) or money I pay back (expense). */
export const repaymentCategoryId = (type: TransactionType): string =>
  type === 'income' ? DEBT_REPAYMENT_CATEGORY_ID : LOAN_REPAYMENT_CATEGORY_ID;

/** The note the app writes on the incoming leg of a transfer (translated on screen, see utils/systemText). */
export const transferInNote = (fromAccountName: string): string => `Transfer from ${fromAccountName}`;
const TRANSFER_IN_NOTE = /^Transfer from .+$/;
export const TRANSFER_IN_SUBCATEGORY = 'Transfer In';

interface CreateTransactionDraftInput {
  createId: () => string;
  nowIso?: string;
  baseCurrency: Currency;
  accountId: string;
  type?: EntryKind;
  personId?: string;
  /** When given, the draft starts in the wallet's own currency. */
  accounts?: readonly Account[];
  /** When given, the draft starts on a real category (see `defaultCategoryId`). */
  categories?: readonly Category[];
  transactions?: readonly Transaction[];
}

interface CreateLinkedExpenseDraftInput {
  createId: () => string;
  nowIso?: string;
  baseCurrency: Currency;
  accountId: string;
  categories: Category[];
  eventId?: string;
}

interface DuplicateTransactionDraftOptions {
  createId: () => string;
  nowIso?: string;
}

interface RepeatTransactionDraftOptions {
  createId: () => string;
  nowIso?: string;
}

const getNowIso = (nowIso?: string) => nowIso ?? new Date().toISOString();

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The category a new expense or income starts on: the last category of that type the person used,
 * else the first category of that type. Never a repayment or transfer category, which do not count
 * in totals. Empty only when there is no usable category at all.
 */
export const defaultCategoryId = (
  type: TransactionType,
  categories: readonly Category[],
  transactions: readonly Transaction[] = [],
): string => {
  const usable = categories.filter(category => category.type === type && !isSystemCategoryId(category.id));
  const usableIds = new Set(usable.map(category => category.id));
  let latest: { id: string; time: number } | null = null;
  for (const transaction of transactions) {
    if (transaction.type !== type || transaction.transferId || transaction.personId) continue;
    if (!usableIds.has(transaction.categoryId)) continue;
    const time = Date.parse(transaction.date);
    if (!Number.isFinite(time)) continue;
    if (!latest || time > latest.time) latest = { id: transaction.categoryId, time };
  }
  if (latest) return latest.id;
  return usable[0]?.id ?? '';
};

export const createTransactionDraft = ({
  createId,
  nowIso,
  baseCurrency,
  accountId,
  type = 'expense',
  personId,
  accounts,
  categories,
  transactions,
}: CreateTransactionDraftInput): Transaction => {
  const entryType: TransactionType = type === 'income' ? 'income' : 'expense';
  // Without categories the form picks the default (an empty id is "not chosen yet").
  const categoryId = type === 'transfer'
    ? TRANSFER_CATEGORY_ID
    : personId
      ? repaymentCategoryId(entryType)
      : categories
        ? defaultCategoryId(entryType, categories, transactions)
        : '';
  return {
    id: createId(),
    date: getNowIso(nowIso),
    amount: 0,
    currency: accounts?.find(account => account.id === accountId)?.currency ?? baseCurrency,
    categoryId,
    accountId,
    type: entryType,
    personId: type === 'transfer' ? undefined : personId,
    note: '',
  };
};

const byName = <T extends { name: string }>(items: readonly T[], name: string | undefined): T | undefined => {
  const wanted = name?.trim().toLowerCase();
  return wanted ? items.find(item => item.name.trim().toLowerCase() === wanted) : undefined;
};

/**
 * A new entry from smart entry (typed or voice). Names are matched against what the current
 * workspace offers; anything unmatched is left for `prepareEntry` (first offered wallet, default
 * category). The parser reads the fee in the entry's currency, fees are stored in USD.
 */
export const draftFromParsed = (
  parsed: ParsedTransaction,
  {
    createId,
    accounts,
    categories,
    people,
    baseCurrency,
    rates,
    eventId,
  }: {
    createId: () => string;
    accounts: readonly Account[];
    categories: readonly Category[];
    people: readonly Person[];
    baseCurrency: Currency;
    rates: ExchangeRates;
    eventId?: string;
  },
): Transaction => {
  const currency = parsed.currency || baseCurrency;
  const date = new Date(parsed.date || Date.now());
  return {
    id: createId(),
    date: Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(),
    amount: parsed.amount > 0 ? parsed.amount : 0,
    currency,
    categoryId: byName(categories, parsed.categoryName)?.id ?? '',
    accountId: byName(accounts, parsed.accountName)?.id ?? '',
    type: parsed.type === 'income' ? 'income' : 'expense',
    note: parsed.note || '',
    subcategory: parsed.subcategory,
    personId: byName(people, parsed.debtName ?? parsed.loanName)?.id,
    fees: toStoredFee(parsed.fees, currency, rates),
    eventId,
  };
};

/** A new entry from a saved template, dated now. */
export const draftFromTemplate = (
  template: TransactionTemplate,
  { createId, nowIso }: { createId: () => string; nowIso?: string },
): Transaction => ({
  id: createId(),
  date: getNowIso(nowIso),
  amount: template.amount || 0,
  currency: template.currency,
  categoryId: template.categoryId,
  accountId: template.accountId,
  type: template.type,
  note: template.note || '',
  subcategory: template.subcategory,
});

export const createLinkedExpenseDraft = ({
  createId,
  nowIso,
  baseCurrency,
  accountId,
  categories,
  eventId,
}: CreateLinkedExpenseDraftInput): Transaction => ({
  id: createId(),
  date: getNowIso(nowIso),
  amount: 0,
  currency: baseCurrency,
  categoryId: categories.find(category => category.type === 'expense')?.id || categories[0]?.id || '',
  accountId,
  type: 'expense',
  note: '',
  eventId,
});

/**
 * A fresh copy dated now. The copy is a new entry of its own: it never keeps the source's transfer
 * link (saving it would otherwise rewrite, and deleting it delete, the original transfer). A copied
 * transfer leg opens as a new transfer, booked as a new pair when saved.
 */
export const duplicateTransactionDraft = (
  transaction: Transaction,
  { createId, nowIso }: DuplicateTransactionDraftOptions
): Transaction => ({
  ...withReceiptPhoto(transaction, null),
  id: createId(),
  date: getNowIso(nowIso),
  splitDetails: undefined,
  transferId: undefined,
});

export const createRepeatTransactionDraft = (
  transaction: Transaction,
  { createId, nowIso }: RepeatTransactionDraftOptions
): Transaction => ({
  id: createId(),
  date: getNowIso(nowIso),
  amount: transaction.amount,
  currency: transaction.currency,
  categoryId: transaction.categoryId,
  accountId: transaction.accountId,
  type: transaction.type,
  note: transaction.note,
  subcategory: transaction.subcategory,
});

/** Both legs of a transfer: the expense leg leaves the From wallet, the income leg arrives in To. */
export const transferLegsOf = (
  transaction: Transaction,
  transactions: readonly Transaction[],
): { outflow: Transaction; inflow: Transaction } | null => {
  if (!transaction.transferId) return null;
  const legs = [transaction, ...transactions.filter(entry => entry.transferId === transaction.transferId && entry.id !== transaction.id)];
  const outflow = legs.find(leg => leg.type === 'expense');
  const inflow = legs.find(leg => leg.type === 'income');
  return outflow && inflow ? { outflow, inflow } : null;
};

export interface PreparedEntry {
  /** What the form edits. For a transfer this is always the outgoing (expense) leg. */
  entry: Transaction;
  /** The To wallet of a transfer ('' until chosen). */
  targetAccountId: string;
  /** An existing transfer whose other leg was found: the form edits both. */
  isPairedTransfer: boolean;
}

/**
 * The wallet a new entry starts on: its own when the form offers it, otherwise the first offered
 * one (a template, smart entry or copy can name a wallet of another workspace, or none at all).
 * Without any wallet on offer there is nothing to switch to.
 */
const offeredAccount = (accountId: string, accounts: readonly Account[]): Account | undefined =>
  accounts.find(entry => entry.id === accountId) ?? accounts[0];

/**
 * Turns whatever opened the form into what the form shows:
 * - an existing transfer opens from its outgoing leg, with the incoming leg's wallet as To;
 * - a new entry never starts on a hidden repayment or transfer category by accident (a
 *   person-linked draft keeps its repayment category), and a fresh draft (no amount yet)
 *   starts in its wallet's currency;
 * - a copied incoming transfer leg becomes a new transfer into that wallet;
 * - a new entry on a wallet the form does not offer moves to the first offered wallet.
 */
export const prepareEntry = (
  transaction: Transaction,
  {
    isNew,
    accounts,
    categories,
    transactions,
  }: { isNew: boolean; accounts: readonly Account[]; categories: readonly Category[]; transactions: readonly Transaction[] },
): PreparedEntry => {
  if (!isNew) {
    const legs = transferLegsOf(transaction, transactions);
    return legs
      ? { entry: legs.outflow, targetAccountId: legs.inflow.accountId, isPairedTransfer: true }
      : { entry: transaction, targetAccountId: '', isPairedTransfer: false };
  }

  if (transaction.categoryId === TRANSFER_CATEGORY_ID) {
    const base: Transaction = { ...transaction, type: 'expense', transferId: undefined, personId: undefined, splitDetails: undefined };
    if (transaction.type === 'income') {
      // A copy of the incoming leg: same To wallet, the From wallet is for the person to choose.
      const note = transaction.note && TRANSFER_IN_NOTE.test(transaction.note) ? '' : transaction.note;
      return { entry: { ...base, accountId: '', note, subcategory: undefined }, targetAccountId: transaction.accountId, isPairedTransfer: false };
    }
    // The amount of a transfer is always in the From wallet's currency.
    const from = offeredAccount(transaction.accountId, accounts);
    return { entry: { ...base, accountId: from?.id ?? base.accountId, currency: from?.currency ?? base.currency }, targetAccountId: '', isPairedTransfer: false };
  }

  const category = categories.find(entry => entry.id === transaction.categoryId);
  const fits = !!category && category.type === transaction.type && (!!transaction.personId || !isSystemCategoryId(category.id));
  let categoryId = transaction.categoryId;
  if (!fits) {
    const repayment = repaymentCategoryId(transaction.type);
    categoryId = transaction.personId && categories.some(entry => entry.id === repayment)
      ? repayment
      : defaultCategoryId(transaction.type, categories, transactions);
  }
  const account = offeredAccount(transaction.accountId, accounts);
  const currency = transaction.amount === 0 && account ? account.currency : transaction.currency;
  return {
    entry: { ...transaction, accountId: account?.id ?? transaction.accountId, categoryId, currency, subcategory: fits ? transaction.subcategory : undefined },
    targetAccountId: '',
    isPairedTransfer: false,
  };
};

type Convert = (amount: number, from: Currency, to: Currency) => number;

const convertOrKeep = (amount: number, from: Currency, to: Currency, convert: Convert, fallback: number) => {
  if (from === to) return amount;
  const raw = convert(amount, from, to);
  return Number.isFinite(raw) ? round2(raw) : fallback;
};

/**
 * Books a transfer as two legs sharing a transferId, so they are edited and deleted together:
 * the expense leg leaves the From wallet in its currency, the income leg arrives in the To wallet
 * converted to that wallet's currency. Neither leg counts as spending or earning.
 */
export const buildTransferPair = ({
  outflow,
  toAccount,
  fromAccountName,
  transferId,
  inflowId,
  convert,
}: {
  outflow: Transaction;
  toAccount: Pick<Account, 'id' | 'currency'>;
  fromAccountName: string;
  transferId: string;
  inflowId: string;
  convert: Convert;
}): [Transaction, Transaction] => {
  const out: Transaction = {
    ...outflow,
    type: 'expense',
    categoryId: TRANSFER_CATEGORY_ID,
    transferId,
    personId: undefined,
    splitDetails: undefined,
  };
  const inflow: Transaction = {
    id: inflowId,
    date: outflow.date,
    amount: convertOrKeep(outflow.amount, outflow.currency, toAccount.currency, convert, outflow.amount),
    currency: toAccount.currency,
    categoryId: TRANSFER_CATEGORY_ID,
    accountId: toAccount.id,
    type: 'income',
    note: transferInNote(fromAccountName),
    subcategory: TRANSFER_IN_SUBCATEGORY,
    transferId,
  };
  return [out, inflow];
};

/**
 * Keeps the other leg of an edited transfer in step: same date, the amount converted to the leg's
 * currency, and, for the incoming leg, the To wallet the form chose and a generated note that names
 * the current From wallet.
 */
export const alignTransferLeg = (
  updated: Transaction,
  partner: Transaction,
  {
    toAccount,
    fromAccountName,
    convert,
  }: { toAccount?: Pick<Account, 'id' | 'currency'>; fromAccountName?: string; convert: Convert },
): Transaction => {
  const moves = partner.type === 'income' && !!toAccount && toAccount.id !== partner.accountId;
  const currency = moves ? toAccount!.currency : partner.currency;
  const regenerateNote = partner.type === 'income' && !!fromAccountName && !!partner.note && TRANSFER_IN_NOTE.test(partner.note);
  return {
    ...partner,
    date: updated.date,
    amount: convertOrKeep(updated.amount, updated.currency, currency, convert, partner.amount),
    accountId: moves ? toAccount!.id : partner.accountId,
    currency,
    note: regenerateNote ? transferInNote(fromAccountName!) : partner.note,
  };
};

const NUMBER_TOKEN = /[\d][\d.,]*/;

/**
 * What a failed smart entry ("kafa 250") still tells the manual form: the first readable amount
 * (in the app's number format) and the rest of the text as the note. Without a readable amount the
 * whole text becomes the note.
 */
export const splitAmountFromText = (text: string, language: 'en' | 'sr'): { amount: number; note: string } => {
  const trimmed = text.trim();
  const match = NUMBER_TOKEN.exec(trimmed);
  if (!match) return { amount: 0, note: trimmed };
  const token = match[0].replace(/[.,]+$/, '');
  const amount = parseAmountInput(token, language);
  if (amount === undefined || !(amount > 0)) return { amount: 0, note: trimmed };
  const note = `${trimmed.slice(0, match.index)} ${trimmed.slice(match.index + match[0].length)}`.replace(/\s+/g, ' ').trim();
  return { amount, note };
};
