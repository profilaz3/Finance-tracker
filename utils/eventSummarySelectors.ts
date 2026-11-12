import type { Currency, Person, SharedExpense } from '../types';
import { convertCurrency } from './currencyUtils';

export interface EventPersonTotal {
  personId: string;
  totalPaid: number;
  totalOwed: number;
}

interface CalculateEventPersonTotalsOptions {
  people: Person[];
  expenses: SharedExpense[];
  summaryCurrency: Currency;
  rates: Record<Currency, number>;
}

const roundCurrency = (amount: number): number => Math.round(amount * 100) / 100;

const getExpenseShareAmount = (expense: SharedExpense, personId: string): number => {
  if (!expense.sharedWith.includes(personId)) {
    return 0;
  }

  if (expense.splitType === 'exact' && expense.splitDetails) {
    return expense.splitDetails[personId] || 0;
  }

  return expense.sharedWith.length > 0 ? expense.amount / expense.sharedWith.length : 0;
};

export const calculateEventPersonTotals = ({
  people,
  expenses,
  summaryCurrency,
  rates,
}: CalculateEventPersonTotalsOptions): EventPersonTotal[] => (
  people.map(person => {
    const totalPaid = expenses
      .filter(expense => expense.paidBy === person.id)
      .reduce((sum, expense) => sum + convertCurrency(expense.amount, expense.currency, summaryCurrency, rates), 0);

    const totalOwed = expenses.reduce((sum, expense) => {
      const shareAmount = getExpenseShareAmount(expense, person.id);
      return sum + convertCurrency(shareAmount, expense.currency, summaryCurrency, rates);
    }, 0);

    return {
      personId: person.id,
      totalPaid: roundCurrency(totalPaid),
      totalOwed: roundCurrency(totalOwed),
    };
  })
);
