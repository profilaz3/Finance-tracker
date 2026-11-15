import { describe, expect, it } from 'vitest';
import { SplitShare, Transaction } from '../types';
import {
  calculateIPaidSplitSubmission,
  calculateTheyPaidSubmission,
  deriveTheyPaidRecipients,
  toggleDebtRecipient,
  calculateTotalSplitAmount,
  calculateRemainingPercentage,
  convertFeesToSplitCurrency,
  percentShareAmount,
  readAmount,
  recalculateSplitShares,
  seedEvenPercentages,
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

  it('sets only the edited percentage; what the others leave of 100% is mine', () => {
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
      { personId: 'p-2', isIncluded: true, percentage: 0, amount: 0 },
    ]);
    expect(calculateRemainingPercentage(shares)).toBe(75);
  });

  it('reads typed amounts in the app language', () => {
    expect(readAmount('45,50', 'en')).toBe(45.5);
    expect(readAmount('45,50', 'sr')).toBe(45.5);
    expect(readAmount('2.000', 'sr')).toBe(2000);
    expect(readAmount('abc', 'sr')).toBe(0);
    expect(readAmount(undefined)).toBe(0);
    expect(readAmount(12.5)).toBe(12.5);
    expect(calculateTotalSplitAmount('45,50', '', 'EUR', baseRates, 'sr')).toBe(45.5);
    expect(calculateTotalSplitAmount('2.000', undefined, 'RSD', baseRates, 'sr')).toBe(2000);
  });

  it('reads Serbian decimal commas in percentages and debt amounts', () => {
    const shares = updatePercentageShare(
      createShares([{ personId: 'p-1', isIncluded: true }]),
      'p-1',
      '33,5',
      200,
      'sr'
    );
    expect(shares[0]).toMatchObject({ percentage: 33.5, amount: 67 });

    const recipients = [{ personId: 'p-1', name: 'Alex', amount: 0, isIncluded: true }];
    expect(updateDebtRecipientAmount(recipients, 'p-1', '12,5', 'sr')[0].amount).toBe(12.5);
  });

  it('converts USD fees into the split currency', () => {
    expect(convertFeesToSplitCurrency(10, 'RSD', baseRates)).toBe(1083.33);
    expect(convertFeesToSplitCurrency(10, 'USD', baseRates)).toBe(10);
    expect(convertFeesToSplitCurrency(undefined, 'EUR', baseRates)).toBe(0);
  });

  it('keeps the payer share in a percentage split (30% + 30% leaves me 40%)', () => {
    const shares = createShares([
      { personId: 'p-1', isIncluded: true, percentage: 30 },
      { personId: 'p-2', isIncluded: true, percentage: 30 },
    ]);
    expect(calculateRemainingPercentage(shares)).toBe(40);

    const result = calculateIPaidSplitSubmission({
      amount: 200,
      fees: undefined,
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'cash',
      note: '',
      transactionDate: '2026-04-05T10:00:00.000Z',
      splitMethod: 'percentage',
      shares,
      rates: baseRates,
      transactionId: 'tx-pct',
      language: 'en',
    });

    expect(result.error).toBeUndefined();
    expect(result.transaction?.splitDetails?.myPortion).toBe(80);
    expect(result.transaction?.splitDetails?.shares.map(share => share.amount)).toEqual([60, 60]);
    expect(result.balanceUpdates).toEqual([
      { personId: 'p-1', currency: 'EUR', delta: 60 },
      { personId: 'p-2', currency: 'EUR', delta: 60 },
    ]);
  });

  it('rejects percentages that add up to more than 100%', () => {
    const shares = createShares([
      { personId: 'p-1', isIncluded: true, percentage: 60 },
      { personId: 'p-2', isIncluded: true, percentage: 50 },
    ]);
    expect(calculateRemainingPercentage(shares)).toBe(-10);
    const result = calculateIPaidSplitSubmission({
      amount: 100,
      fees: undefined,
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'cash',
      note: '',
      transactionDate: '2026-04-05T10:00:00.000Z',
      splitMethod: 'percentage',
      shares,
      rates: baseRates,
      language: 'en',
    });
    expect(result.error).toBe('exceeds-total');
  });

  it('rounds percentage shares down to the cent and leaves the leftover cents to me', () => {
    expect(percentShareAmount(10.01, 50)).toBe(5);
    expect(percentShareAmount(100, 33.33)).toBe(33.33);
    expect(percentShareAmount(0, 50)).toBe(0);

    const result = calculateIPaidSplitSubmission({
      amount: '10,01',
      fees: '',
      currency: 'EUR',
      categoryId: 'food',
      accountId: 'cash',
      note: '',
      transactionDate: '2026-04-05T10:00:00.000Z',
      splitMethod: 'percentage',
      shares: createShares([{ personId: 'p-1', isIncluded: true, percentage: 50 }]),
      rates: baseRates,
      language: 'sr',
    });
    expect(result.transaction?.amount).toBe(10.01);
    expect(result.transaction?.splitDetails?.shares[0].amount).toBe(5);
    expect(result.transaction?.splitDetails?.myPortion).toBe(5.01);
  });

  it('seeds even percentages, me included, only when none are set yet', () => {
    const seeded = seedEvenPercentages(
      createShares([
        { personId: 'p-1', isIncluded: true },
        { personId: 'p-2', isIncluded: true },
        { personId: 'p-3', isIncluded: false },
      ]),
      90
    );
    expect(seeded.map(share => share.percentage)).toEqual([33.33, 33.33, 0]);
    expect(seeded.map(share => share.amount)).toEqual([29.99, 29.99, 0]);
    expect(calculateRemainingPercentage(seeded)).toBe(33.34);

    const alreadySet = createShares([
      { personId: 'p-1', isIncluded: true, percentage: 10 },
      { personId: 'p-2', isIncluded: true },
    ]);
    expect(seedEvenPercentages(alreadySet, 90)).toBe(alreadySet);
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
