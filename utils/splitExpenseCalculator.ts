import {
  Currency,
  ExchangeRates,
  SplitMethod,
  SplitShare,
  Transaction,
  TransactionSplitShare,
} from '../types';
import { convertAmount } from '../services/currencyService';
import { parseAmountInput } from './numberInput';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** An amount as a number, or as text the person typed (read in the app language). */
export type AmountLike = number | string | undefined | null;

/**
 * Numbers pass through; text is read with `parseAmountInput` in the app language, so
 * "45,50" is 45.5 and, in Serbian, "2.000" is two thousand. Empty or unreadable text is 0.
 */
export const readAmount = (value: AmountLike, language?: 'en' | 'sr'): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  return parseAmountInput(value, language) ?? 0;
};

/**
 * One person's share of `total` for a percentage, in whole cents rounded down, so the shares
 * of people who add up to at most 100% never exceed the total. The payer ("me") gets the rest,
 * which also absorbs the leftover cents.
 */
export const percentShareAmount = (total: number, percentage: number): number => {
  if (!(percentage > 0) || !(total > 0)) return 0;
  return Math.floor((Math.round(total * 100) * percentage) / 100 + 1e-6) / 100;
};

/**
 * Splits `total` into `count` parts in integer cents so the parts always sum
 * to the total. Leftover cents go to the first parts (index 0 is "me", the
 * payer, so I absorb rounding first).
 */
export const splitEvenlyInCents = (total: number, count: number): number[] => {
  if (count <= 0) return [];
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
};

/** Fees are always entered and stored in USD (see FEE_CURRENCY in domain/money.ts). */
export const convertFeesToSplitCurrency = (
  fees: AmountLike,
  currency: Currency,
  rates: ExchangeRates,
  language?: 'en' | 'sr'
): number => {
  const feeAmountUSD = readAmount(fees, language);
  return feeAmountUSD > 0 ? round2(convertAmount(feeAmountUSD, 'USD', currency, rates)) : 0;
};

export const calculateTotalSplitAmount = (
  amount: AmountLike,
  fees: AmountLike,
  currency: Currency,
  rates: ExchangeRates,
  language?: 'en' | 'sr'
): number => {
  const baseAmount = readAmount(amount, language);
  const feeAmountUSD = readAmount(fees, language);
  const feeAmountInTransactionCurrency = feeAmountUSD > 0
    ? convertAmount(feeAmountUSD, 'USD', currency, rates)
    : 0;

  return round2(baseAmount + feeAmountInTransactionCurrency);
};

export const recalculateSplitShares = (
  shares: SplitShare[],
  splitMethod: SplitMethod,
  totalToSplit: number
): SplitShare[] => {
  if (splitMethod === 'equal') {
    const includedCount = shares.filter(share => share.isIncluded).length;
    if (includedCount === 0) {
      return shares.map(share => ({ ...share, amount: 0, percentage: 0 }));
    }

    const totalParticipants = includedCount + 1;
    const parts = splitEvenlyInCents(totalToSplit, totalParticipants);
    const percentage = round2(100 / totalParticipants);
    let nextPart = 1; // parts[0] is my portion

    return shares.map(share => ({
      ...share,
      amount: share.isIncluded ? parts[nextPart++] : 0,
      percentage: share.isIncluded ? percentage : 0,
    }));
  }

  if (splitMethod === 'percentage') {
    return shares.map(share => ({
      ...share,
      amount: share.isIncluded ? percentShareAmount(totalToSplit, share.percentage || 0) : 0,
    }));
  }

  return shares;
};

/**
 * Switching to percentages with nothing entered yet starts everyone, me included, on an even
 * share (e.g. 33.33% each for two people and me) instead of 0% for the others.
 */
export const seedEvenPercentages = (shares: SplitShare[], totalToSplit: number): SplitShare[] => {
  const included = shares.filter(share => share.isIncluded);
  if (included.length === 0 || included.some(share => (share.percentage || 0) > 0)) return shares;
  const percentage = round2(100 / (included.length + 1));
  return shares.map(share => share.isIncluded
    ? { ...share, percentage, amount: percentShareAmount(totalToSplit, percentage) }
    : share);
};

/**
 * Sets one person's percentage. The payer ("me") is part of the 100%: whatever the others do
 * not take is my share, so nothing is auto-filled into another person.
 */
export const updatePercentageShare = (
  shares: SplitShare[],
  personId: string,
  value: AmountLike,
  totalToSplit: number,
  language?: 'en' | 'sr'
): SplitShare[] => {
  const newPercentage = round2(Math.max(0, readAmount(value, language)));
  return shares.map(share =>
    share.personId === personId
      ? { ...share, percentage: newPercentage, amount: percentShareAmount(totalToSplit, newPercentage) }
      : share
  );
};

export const calculateRemainingAmount = (shares: SplitShare[], totalToSplit: number): number =>
  round2(totalToSplit - shares.filter(share => share.isIncluded).reduce((sum, share) => sum + share.amount, 0));

/** My own percentage: what the others leave of 100%. Negative when they take more than 100%. */
export const calculateRemainingPercentage = (shares: SplitShare[]): number =>
  round2(100 - shares.filter(share => share.isIncluded).reduce((sum, share) => sum + (share.percentage || 0), 0));

interface CalculateIPaidSplitSubmissionArgs {
  amount: AmountLike;
  fees: AmountLike;
  currency: Currency;
  categoryId: string;
  accountId: string;
  note: string;
  transactionDate: string;
  splitMethod: SplitMethod;
  shares: SplitShare[];
  rates: ExchangeRates;
  transactionId?: string;
  transaction?: Transaction;
  eventId?: string;
  language: 'en' | 'sr';
}

type SplitSubmissionError = 'no-participants' | 'invalid-amount' | 'exceeds-total';

interface SplitSubmissionResult {
  transaction?: Transaction;
  balanceUpdates: { personId: string; currency: Currency; delta: number }[];
  error?: SplitSubmissionError;
}

export interface DebtRecipient {
  personId: string;
  name: string;
  amount: number;
  isIncluded: boolean;
}

type TheyPaidSubmissionError = 'missing-payer' | 'no-amounts';

interface TheyPaidSubmissionResult {
  transactions: Transaction[];
  balanceUpdates: { personId: string; currency: Currency; delta: number }[];
  error?: TheyPaidSubmissionError;
}

export const toggleDebtRecipient = (
  recipients: DebtRecipient[],
  personId: string
): DebtRecipient[] =>
  recipients.map(recipient =>
    recipient.personId === personId
      ? {
          ...recipient,
          isIncluded: !recipient.isIncluded,
          amount: recipient.isIncluded ? 0 : recipient.amount,
        }
      : recipient
  );

export const updateDebtRecipientAmount = (
  recipients: DebtRecipient[],
  personId: string,
  value: AmountLike,
  language?: 'en' | 'sr'
): DebtRecipient[] => {
  const amount = round2(Math.max(0, readAmount(value, language)));
  return recipients.map(recipient =>
    recipient.personId === personId
      ? { ...recipient, amount }
      : recipient
  );
};

export const deriveTheyPaidRecipients = (
  recipients: DebtRecipient[],
  payerId: string
): {
  availableRecipients: DebtRecipient[];
  includedRecipients: DebtRecipient[];
  recipientTotal: number;
} => {
  const availableRecipients = recipients.filter(recipient => recipient.personId !== payerId);
  const includedRecipients = recipients.filter(recipient => recipient.isIncluded && recipient.personId !== payerId);
  const recipientTotal = round2(includedRecipients.reduce((sum, recipient) => sum + recipient.amount, 0));

  return {
    availableRecipients,
    includedRecipients,
    recipientTotal,
  };
};

const buildCalculatedShares = (
  splitMethod: SplitMethod,
  includedShares: SplitShare[],
  totalAmount: number
): { myPortion: number; shares: Array<{ personId: string; amount: number; percentage?: number }> } | null => {
  const totalParticipants = includedShares.length + 1;

  if (splitMethod === 'equal') {
    const [myPortion, ...otherParts] = splitEvenlyInCents(totalAmount, totalParticipants);
    return {
      myPortion,
      shares: includedShares.map((share, index) => ({
        personId: share.personId,
        amount: otherParts[index],
        percentage: round2(100 / totalParticipants),
      })),
    };
  }

  // Percentages are worked out from the final total (fees included); I keep what is left.
  const others = includedShares.map(share => ({
    personId: share.personId,
    amount: splitMethod === 'percentage' ? percentShareAmount(totalAmount, share.percentage || 0) : round2(share.amount),
    percentage: round2(share.percentage || 0),
  }));
  const othersTotalCents = others.reduce((sum, share) => sum + Math.round(share.amount * 100), 0);
  const myPortion = (Math.round(totalAmount * 100) - othersTotalCents) / 100;

  if (myPortion < 0) {
    return null;
  }

  return { myPortion, shares: others };
};

/**
 * Net balance change per person and currency caused by creating or editing a
 * split. When editing, the old shares are reversed in the OLD transaction
 * currency and the new shares applied in the new one, so a currency change
 * never leaves the old-currency balance behind. Computed in integer cents.
 */
const buildBalanceUpdates = (
  currency: Currency,
  calculatedShares: Array<{ personId: string; amount: number; percentage?: number }>,
  transaction?: Transaction
): { personId: string; currency: Currency; delta: number }[] => {
  const deltas = new Map<string, { personId: string; currency: Currency; cents: number }>();
  const add = (personId: string, entryCurrency: Currency, amount: number) => {
    const key = `${personId}|${entryCurrency}`;
    const entry = deltas.get(key) ?? { personId, currency: entryCurrency, cents: 0 };
    entry.cents += Math.round(amount * 100);
    deltas.set(key, entry);
  };

  calculatedShares.forEach(share => add(share.personId, currency, share.amount));

  const oldCurrency = transaction?.currency ?? currency;
  transaction?.splitDetails?.shares.forEach(oldShare => add(oldShare.personId, oldCurrency, -oldShare.amount));

  return Array.from(deltas.values())
    .filter(entry => entry.cents !== 0)
    .map(entry => ({ personId: entry.personId, currency: entry.currency, delta: entry.cents / 100 }));
};

export const calculateIPaidSplitSubmission = ({
  amount,
  fees,
  currency,
  categoryId,
  accountId,
  note,
  transactionDate,
  splitMethod,
  shares,
  rates,
  transactionId,
  transaction,
  eventId,
  language,
}: CalculateIPaidSplitSubmissionArgs): SplitSubmissionResult => {
  const includedShares = shares.filter(share => share.isIncluded);
  if (includedShares.length === 0) {
    return { balanceUpdates: [], error: 'no-participants' };
  }

  const totalAmount = calculateTotalSplitAmount(amount, fees, currency, rates, language);
  if (totalAmount <= 0) {
    return { balanceUpdates: [], error: 'invalid-amount' };
  }

  const calculated = buildCalculatedShares(splitMethod, includedShares, totalAmount);
  if (!calculated) {
    return { balanceUpdates: [], error: 'exceeds-total' };
  }

  const splitShares: TransactionSplitShare[] = calculated.shares.map(share => ({
    personId: share.personId,
    amount: share.amount,
    percentage: share.percentage,
    isPaid: false,
  }));

  return {
    transaction: {
      id: transaction?.id || transactionId || '',
      date: transactionDate,
      amount: readAmount(amount, language),
      fees: readAmount(fees, language) || undefined,
      currency,
      categoryId,
      accountId,
      type: 'expense',
      note: note || `Split with ${includedShares.length} ${includedShares.length === 1 ? 'person' : 'people'}`,
      eventId,
      splitDetails: {
        totalAmount,
        myPortion: calculated.myPortion,
        shares: splitShares,
        splitMethod,
      },
    },
    balanceUpdates: buildBalanceUpdates(currency, calculated.shares, transaction),
  };
};

export const calculateTheyPaidSubmission = ({
  payerId,
  currency,
  recipients,
}: {
  payerId: string;
  currency: Currency;
  recipients: DebtRecipient[];
}): TheyPaidSubmissionResult => {
  if (!payerId) {
    return { transactions: [], balanceUpdates: [], error: 'missing-payer' };
  }

  const validRecipients = recipients.filter(recipient => recipient.isIncluded && recipient.amount > 0);
  if (validRecipients.length === 0) {
    return { transactions: [], balanceUpdates: [], error: 'no-amounts' };
  }

  const userRecipient = validRecipients.find(recipient => recipient.personId === 'self');

  return {
    transactions: [],
    balanceUpdates: userRecipient
      ? [{
          personId: payerId,
          currency,
          delta: round2(-userRecipient.amount),
        }]
      : [],
  };
};
