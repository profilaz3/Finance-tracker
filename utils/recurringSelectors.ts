import type { RecurringTransaction } from '../types';
import { isDue } from './recurringUtils';

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const normalizeDateOnly = (referenceDate: Date): Date =>
  new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

const getDayLabel = (days: number, language: 'en' | 'sr'): string => {
  if (language === 'sr') {
    return days === 1 ? 'dan' : 'dana';
  }

  return days === 1 ? 'day' : 'days';
};

export const countDueRecurringTransactions = (
  recurringTransactions: RecurringTransaction[],
  referenceDate: Date = new Date()
): number => recurringTransactions.filter(recurring => isDue(recurring, referenceDate)).length;

export const getRecurringStatus = (
  recurring: RecurringTransaction,
  language: 'en' | 'sr',
  referenceDate: Date = new Date()
) => {
  const nextDueDate = parseDateOnly(recurring.nextDue);
  const today = normalizeDateOnly(referenceDate);
  const daysUntil = Math.round((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntil < 0;
  const isDueToday = daysUntil === 0;

  let countdownText: string;
  if (isDueToday) {
    countdownText = language === 'sr' ? 'Danas' : 'Today';
  } else if (isOverdue) {
    const overdueDays = Math.abs(daysUntil);
    countdownText = language === 'sr'
      ? `Kasni ${overdueDays} ${getDayLabel(overdueDays, language)}`
      : `Overdue ${overdueDays} ${getDayLabel(overdueDays, language)}`;
  } else {
    countdownText = language === 'sr'
      ? `za ${daysUntil} ${getDayLabel(daysUntil, language)}`
      : `in ${daysUntil} ${getDayLabel(daysUntil, language)}`;
  }

  return {
    nextDueDate,
    daysUntil,
    isOverdue,
    isDueToday,
    countdownText,
  };
}
