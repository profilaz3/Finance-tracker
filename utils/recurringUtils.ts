import { RecurringTransaction, RecurrenceFrequency } from '../types';

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
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

/**
 * Next due date after `currentDate`.
 *
 * Monthly and yearly schedules keep the day of `anchorDate` (normally the
 * recurring `startDate`), clamped to the length of each month: a schedule
 * anchored on the 31st goes Jan 31 -> Feb 28 -> Mar 31 -> Apr 30 instead of
 * drifting to the 28th forever. Without an anchor the current day is used.
 */
export const calculateNextDueDate = (
  currentDate: string,
  frequency: RecurrenceFrequency,
  anchorDate?: string,
): string => {
  const date = parseDateOnly(currentDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const anchor = anchorDate ? parseDateOnly(anchorDate) : null;
  const day = anchor && !Number.isNaN(anchor.getTime()) ? anchor.getUTCDate() : date.getUTCDate();

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

const MAX_CATCH_UP_OCCURRENCES = 400;

/**
 * Every occurrence that is due on or before `referenceDate` (local day),
 * respecting `endDate`, plus the next due date after them. Used to generate
 * one transaction per missed occurrence, each dated on its own due date.
 */
export const getDueOccurrences = (
  recurring: Pick<RecurringTransaction, 'isActive' | 'nextDue' | 'frequency' | 'startDate' | 'endDate'>,
  referenceDate: Date = new Date(),
): { dueDates: string[]; nextDue: string } => {
  const dueDates: string[] = [];
  let nextDue = recurring.nextDue;
  if (!recurring.isActive || !nextDue) {
    return { dueDates, nextDue };
  }

  const today = normalizeReferenceDate(referenceDate).getTime();
  const endDate = recurring.endDate ? parseDateOnly(recurring.endDate).getTime() : Number.POSITIVE_INFINITY;

  while (dueDates.length < MAX_CATCH_UP_OCCURRENCES) {
    const due = parseDateOnly(nextDue).getTime();
    if (Number.isNaN(due) || due > today || due > endDate) break;
    dueDates.push(nextDue);
    nextDue = calculateNextDueDate(nextDue, recurring.frequency, recurring.startDate);
  }

  return { dueDates, nextDue };
};

/**
 * Timestamp for a generated occurrence: its own due date (local noon, so the
 * calendar day is stable across time zones), or now when it is due today.
 */
export const getOccurrenceTimestamp = (dueDate: string, now: Date = new Date()): string => {
  const [year, month, day] = dueDate.split('-').map(Number);
  if (year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()) {
    return now.toISOString();
  }
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
};

export const isDue = (recurring: RecurringTransaction, referenceDate: Date = new Date()): boolean => {
  if (!recurring.isActive) return false;

  const today = normalizeReferenceDate(referenceDate);

  const nextDue = parseDateOnly(recurring.nextDue);

  // Occurrences after the end date are never due (earlier missed ones still are).
  if (recurring.endDate) {
    const endDate = parseDateOnly(recurring.endDate);
    if (nextDue > endDate) return false;
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
