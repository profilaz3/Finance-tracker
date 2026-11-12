import { describe, expect, it } from 'vitest';
import { SplitShare, Transaction } from '../types';
import {
  calculateIPaidSplitSubmission,
  calculateTheyPaidSubmission,
  deriveTheyPaidRecipients,
  toggleDebtRecipient,
  calculateTotalSplitAmount,
  recalculateSplitShares,
  updateDebtRecipientAmount,
  updatePercentageShare,
} from '../utils/splitExpenseCalculator';

const baseRates = {
  base: 'EUR' as const,
  date: '2026-04-05',
  rates: {
    EUR: 1,
    USD: 1.08,
    RSD: 117,
  },
};

const createShares = (shares: Partial<SplitShare>[]): SplitShare[] =>
  shares.map((share, index) => ({
    personId: share.personId ?? `p-${index + 1}`,
    amount: share.amount ?? 0,
    percentage: share.percentage ?? 0,
    isIncluded: share.isIncluded ?? false,
  }));

describe('splitExpenseCalculator', () => {
  it('includes converted USD fees in the total split amount', () => {
    expect(calculateTotalSplitAmount('100', '10', 'RSD', baseRates)).toBe(1183.33);
  });

  it('recalculates equal shares including the current user', () => {
    const shares = recalculateSplitShares(
      createShares([
        { personId: 'p-1', isIncluded: true },
        { personId: 'p-2', isIncluded: true },
      ]),
      'equal',
      120
    );

    expect(shares).toEqual([
      { personId: 'p-1', isIncluded: true, amount: 40, percentage: 33.33 },
      { personId: 'p-2', isIncluded: true, amount: 40, percentage: 33.33 },
    ]);
  });

  it('autofills the last remaining percentage share', () => {
    const shares = updatePercentageShare(
      createShares([
        { personId: 'p-1', isIncluded: true, percentage: 0, amount: 0 },
        { personId: 'p-2', isIncluded: true, percentage: 0, amount: 0 },
      ]),
      'p-1',
      '25',
      100
    );

    expect(shares).toEqual([
      { personId: 'p-1', isIncluded: true, percentage: 25, amount: 25 },
      { personId: 'p-2', isIncluded: true, percentage: 75, amount: 75 },
    ]);
  });

  it('computes edited split deltas and removed participants correctly', () => {
    const existingTransaction: Transaction = {
      id: 'tx-1',
      date: '2026-04-05T10:00:00.000Z',
      amount: 100,
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'cash',
      type: 'expense',
      splitDetails: {
        totalAmount: 100,
        myPortion: 40,
        splitMethod: 'exact',
        shares: [
          { personId: 'p-1', amount: 35, percentage: 35, isPaid: false },
          { personId: 'p-2', amount: 25, percentage: 25, isPaid: false },
        ],
      },
    };

    const result = calculateIPaidSplitSubmission({
      amount: '100',
      fees: '0',
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'cash',
      note: '',
      transactionDate: '2026-04-06T10:00:00.000Z',
      splitMethod: 'exact',
      shares: createShares([
        { personId: 'p-1', isIncluded: true, amount: 20, percentage: 20 },
        { personId: 'p-3', isIncluded: true, amount: 30, percentage: 30 },
      ]),
      rates: baseRates,
      transaction: existingTransaction,
      eventId: 'evt-1',
      language: 'en',
    });

    expect(result.error).toBeUndefined();
    expect(result.transaction?.splitDetails?.myPortion).toBe(50);
    expect(result.balanceUpdates).toEqual([
      { personId: 'p-1', currency: 'EUR', delta: -15 },
      { personId: 'p-3', currency: 'EUR', delta: 30 },
      { personId: 'p-2', currency: 'EUR', delta: -25 },
    ]);
  });

  it('creates only the self debt update when someone else paid for multiple people', () => {
    const result = calculateTheyPaidSubmission({
      payerId: 'p-1',
      currency: 'EUR',
      recipients: [
        { personId: 'self', name: 'Me', amount: 12.5, isIncluded: true },
        { personId: 'p-2', name: 'Alex', amount: 18, isIncluded: true },
        { personId: 'p-3', name: 'Sam', amount: 0, isIncluded: false },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.transactions).toEqual([]);
    expect(result.balanceUpdates).toEqual([
      { personId: 'p-1', currency: 'EUR', delta: -12.5 },
    ]);
  });

  it('requires a payer and at least one positive included recipient in they-paid mode', () => {
    expect(calculateTheyPaidSubmission({
      payerId: '',
      currency: 'EUR',
      recipients: [{ personId: 'self', name: 'Me', amount: 10, isIncluded: true }],
    }).error).toBe('missing-payer');

    expect(calculateTheyPaidSubmission({
      payerId: 'p-1',
      currency: 'EUR',
      recipients: [{ personId: 'self', name: 'Me', amount: 0, isIncluded: true }],
    }).error).toBe('no-amounts');
  });

  it('derives available recipients, included recipients, and totals for they-paid mode', () => {
    const recipients = [
      { personId: 'self', name: 'Me', amount: 12.5, isIncluded: true },
      { personId: 'p-1', name: 'Alex', amount: 0, isIncluded: false },
      { personId: 'p-2', name: 'Sam', amount: 20, isIncluded: true },
    ];

    const state = deriveTheyPaidRecipients(recipients, 'p-2');

    expect(state.availableRecipients).toEqual([
      { personId: 'self', name: 'Me', amount: 12.5, isIncluded: true },
      { personId: 'p-1', name: 'Alex', amount: 0, isIncluded: false },
    ]);
    expect(state.includedRecipients).toEqual([
      { personId: 'self', name: 'Me', amount: 12.5, isIncluded: true },
    ]);
    expect(state.recipientTotal).toBe(12.5);
  });

  it('clears recipient amount when toggled off and rounds updated amounts', () => {
    const recipients = [
      { personId: 'self', name: 'Me', amount: 12.5, isIncluded: true },
      { personId: 'p-1', name: 'Alex', amount: 0, isIncluded: false },
    ];

    expect(toggleDebtRecipient(recipients, 'self')).toEqual([
      { personId: 'self', name: 'Me', amount: 0, isIncluded: false },
      { personId: 'p-1', name: 'Alex', amount: 0, isIncluded: false },
    ]);

    expect(updateDebtRecipientAmount(recipients, 'p-1', '10.129')).toEqual([
      { personId: 'self', name: 'Me', amount: 12.5, isIncluded: true },
      { personId: 'p-1', name: 'Alex', amount: 10.13, isIncluded: false },
    ]);
  });
});
