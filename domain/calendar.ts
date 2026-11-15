import type { RecurringTransaction } from '../types';
import { calculateNextDueDate } from '../utils/recurringUtils';
import { parseLocalDate } from './home';

/** Local calendar day as "2026-11-15". */
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export interface DueOccurrence {
  recurring: RecurringTransaction;
  due: Date;
}

const MAX_OCCURRENCES_PER_RULE = 400;

/**
 * Every day an active recurring entry falls due between `from` and `to` (local days, inclusive),
 * soonest first. Walks forward from `nextDue`, so occurrences already turned into entries are not
 * repeated, and stops at the rule's end date.
 */
export function getRecurringOccurrences(recurring: RecurringTransaction[], from: Date, to: Date): DueOccurrence[] {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  const occurrences: DueOccurrence[] = [];

  for (const rule of recurring) {
    if (!rule.isActive || !rule.nextDue) continue;
    const ruleEnd = rule.endDate ? parseLocalDate(rule.endDate.slice(0, 10)).getTime() : Number.POSITIVE_INFINITY;
    let next = rule.nextDue.slice(0, 10);
    for (let step = 0; step < MAX_OCCURRENCES_PER_RULE; step += 1) {
      const due = parseLocalDate(next);
      const time = due.getTime();
      if (Number.isNaN(time) || time > end || time > ruleEnd) break;
      if (time >= start) occurrences.push({ recurring: rule, due });
      const following = calculateNextDueDate(next, rule.frequency, rule.startDate);
      if (following <= next) break;
      next = following;
    }
  }

  return occurrences.sort((a, b) => a.due.getTime() - b.due.getTime());
}

/**
 * How strongly a day is shaded, 0 (nothing spent) to 4 (the month's biggest day). Square-root
 * scale, so one large day (rent) does not wash out the rest of the month.
 */
export const heatLevel = (spent: number, monthMax: number): 0 | 1 | 2 | 3 | 4 => {
  if (!(spent > 0) || !(monthMax > 0)) return 0;
  return Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.min(1, spent / monthMax)) * 4))) as 1 | 2 | 3 | 4;
};

/** The Monday-first weeks that show `month`, from the Monday on or before the 1st to the Sunday on or after the last day. */
export const monthGrid = (year: number, month: number): Date[] => {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const end = new Date(year, month, last.getDate() + ((7 - last.getDay()) % 7));
  const days: Date[] = [];
  for (let day = new Date(start); day <= end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    days.push(day);
  }
  return days;
};
