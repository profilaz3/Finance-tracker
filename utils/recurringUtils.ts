import { RecurringTransaction, RecurrenceFrequency } from '../types';

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateOnly = (date: Date): string => date.toISOString().split('T')[0];

const createClampedUtcDate = (year: number, monthIndex: number, day: number): Date => {
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDayOfMonth)));
};

const normalizeReferenceDate = (referenceDate: Date): Date =>
  new Date(Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ));

export const calculateNextDueDate = (currentDate: string, frequency: RecurrenceFrequency): string => {
  const date = parseDateOnly(currentDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case 'monthly':
      return formatDateOnly(createClampedUtcDate(year, month + 1, day));
    case 'yearly':
      return formatDateOnly(createClampedUtcDate(year + 1, month, day));
  }

  return formatDateOnly(date);
};

export const isDue = (recurring: RecurringTransaction, referenceDate: Date = new Date()): boolean => {
  if (!recurring.isActive) return false;

  const today = normalizeReferenceDate(referenceDate);

  const nextDue = parseDateOnly(recurring.nextDue);

  // Check if end date has passed
  if (recurring.endDate) {
    const endDate = parseDateOnly(recurring.endDate);
    if (today > endDate) return false;
  }

  return today >= nextDue;
};

export const getFrequencyLabel = (frequency: RecurrenceFrequency, language: 'en' | 'sr'): string => {
  const labels: Record<RecurrenceFrequency, { en: string; sr: string }> = {
    daily: { en: 'Daily', sr: 'Dnevno' },
    weekly: { en: 'Weekly', sr: 'Nedeljno' },
    biweekly: { en: 'Bi-weekly', sr: 'Dvonedeljno' },
    monthly: { en: 'Monthly', sr: 'Mesecno' },
    yearly: { en: 'Yearly', sr: 'Godisnje' }
  };

  return labels[frequency][language];
};
