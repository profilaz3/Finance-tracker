import {
  Currency,
  ExchangeRates,
  SplitMethod,
  SplitShare,
  Transaction,
  TransactionSplitShare,
} from '../types';
import { convertAmount } from '../services/currencyService';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const calculateTotalSplitAmount = (
  amount: string,
  fees: string,
  currency: Currency,
  rates: ExchangeRates
): number => {
  const baseAmount = parseFloat(amount) || 0;
  const feeAmountUSD = parseFloat(fees) || 0;
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
    const perPerson = round2(totalToSplit / totalParticipants);
    const percentage = round2(100 / totalParticipants);

    return shares.map(share => ({
      ...share,
      amount: share.isIncluded ? perPerson : 0,
      percentage: share.isIncluded ? percentage : 0,
    }));
  }

  if (splitMethod === 'percentage') {
    return shares.map(share => ({
      ...share,
      amount: share.isIncluded ? round2((totalToSplit * (share.percentage || 0)) / 100) : 0,
    }));
  }

  return shares;
};

export const updatePercentageShare = (
  shares: SplitShare[],
  personId: string,
  value: string,
  totalToSplit: number
): SplitShare[] => {
  const newPercentage = parseFloat(value) || 0;

  const updatedShares = shares.map(share =>
    share.personId === personId
      ? {
          ...share,
          percentage: round2(newPercentage),
          amount: round2((totalToSplit * newPercentage) / 100),
        }
      : share
  );

  const assignedPercentage = updatedShares.reduce(
    (sum, share) => sum + (share.personId === personId ? newPercentage : (share.percentage || 0)),
    0
  );
  const emptyShares = updatedShares.filter(
    share =>
      share.isIncluded &&
      share.personId !== personId &&
      (share.percentage === 0 || share.percentage === undefined)
  );

  if (emptyShares.length === 1) {
    const remaining = 100 - assignedPercentage;
    if (remaining >= 0) {
      return updatedShares.map(share =>
        share.personId === emptyShares[0].personId
          ? {
              ...share,
              percentage: round2(remaining),
              amount: round2((totalToSplit * remaining) / 100),
            }
          : share
      );
    }
  }

  return updatedShares;
};

export const calculateRemainingAmount = (shares: SplitShare[], totalToSplit: number): number =>
  round2(totalToSplit - shares.filter(share => share.isIncluded).reduce((sum, share) => sum + share.amount, 0));

export const calculateRemainingPercentage = (shares: SplitShare[]): number =>
  round2(100 - shares.filter(share => share.isIncluded).reduce((sum, share) => sum + (share.percentage || 0), 0));

interface CalculateIPaidSplitSubmissionArgs {
  amount: string;
  fees: string;
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
  value: string
): DebtRecipient[] => {
  const amount = round2(parseFloat(value) || 0);
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
    const perPerson = round2(totalAmount / totalParticipants);
    return {
      myPortion: perPerson,
      shares: includedShares.map(share => ({
        personId: share.personId,
        amount: perPerson,
        percentage: round2(100 / totalParticipants),
      })),
    };
  }

  const othersTotal = includedShares.reduce((sum, share) => sum + share.amount, 0);
  const myPortion = round2(totalAmount - othersTotal);

  if (myPortion < 0) {
    return null;
  }

  return {
    myPortion,
    shares: includedShares.map(share => ({
      personId: share.personId,
      amount: round2(share.amount),
      percentage: round2(share.percentage || 0),
    })),
  };
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
}: CalculateIPaidSplitSubmissionArgs): SplitSubmissionResult => {
  const includedShares = shares.filter(share => share.isIncluded);
  if (includedShares.length === 0) {
    return { balanceUpdates: [], error: 'no-participants' };
  }

  const totalAmount = calculateTotalSplitAmount(amount, fees, currency, rates);
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
      amount: parseFloat(amount) || 0,
      fees: parseFloat(fees) || undefined,
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
