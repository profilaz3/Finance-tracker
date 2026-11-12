import type { Account, Currency, Person } from '../types';
import { convertCurrency } from './currencyUtils';

export interface DashboardWalletSummary {
  account: Account;
  balance: number;
}

interface CalculateDashboardDebtSummaryOptions {
  people: Person[];
  baseCurrency: Currency;
  rates: Record<Currency, number>;
}

const roundCurrency = (amount: number): number => Math.round(amount * 100) / 100;

const getAccountOrder = (account: Account): number => account.order ?? Number.MAX_SAFE_INTEGER;

export const getDashboardWalletSummaries = (
  accounts: Account[],
  getAccountBalance: (account: Account) => number,
): DashboardWalletSummary[] => (
  [...accounts]
    .sort((left, right) => getAccountOrder(left) - getAccountOrder(right))
    .map(account => ({
      account,
      balance: getAccountBalance(account),
    }))
);

export const getActiveDashboardPeople = (people: Person[]): Person[] => (
  people.filter(person => Object.values(person.balances).some(balance => balance !== 0))
);

export const calculateDashboardDebtSummary = ({
  people,
  baseCurrency,
  rates,
}: CalculateDashboardDebtSummaryOptions): { totalOwedToMe: number; totalIOwe: number } => {
  let totalOwedToMe = 0;
  let totalIOwe = 0;

  people.forEach(person => {
    Object.entries(person.balances).forEach(([currency, amount]) => {
      const amountInBase = convertCurrency(amount, currency as Currency, baseCurrency, rates);
      if (amount > 0) {
        totalOwedToMe += amountInBase;
      } else if (amount < 0) {
        totalIOwe += Math.abs(amountInBase);
      }
    });
  });

  return {
    totalOwedToMe: roundCurrency(totalOwedToMe),
    totalIOwe: roundCurrency(totalIOwe),
  };
};
