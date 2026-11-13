/**
 * Pure rules behind local notifications: when bill reminders fire, which budget
 * thresholds were just crossed, and which shared event expenses are new.
 * No platform code here, so everything is unit tested.
 */
import type { BudgetProgress } from './home';
import type { Event, RecurringTransaction, SharedExpense } from '../types';
import { calculateNextDueDate } from '../utils/recurringUtils';

export type ReminderLead = 0 | 1 | 3;
export const REMINDER_LEADS: ReminderLead[] = [0, 1, 3];

export interface NotificationPrefs {
  bills: boolean;
  budget: boolean;
  events: boolean;
  /** Last month's letter is ready (the 1st of each month). */
  letter: boolean;
  /** A detected subscription started charging more. */
  priceIncrease: boolean;
  /** Days before the due date that a bill reminder fires. */
  leadDays: ReminderLead;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  bills: true,
  budget: true,
  events: true,
  letter: true,
  priceIncrease: true,
  leadDays: 1,
};

/** Reads saved prefs, falling back field by field so older or damaged values stay usable. */
export function normalizeNotificationPrefs(value: unknown): NotificationPrefs {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const bool = (key: keyof NotificationPrefs) =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_NOTIFICATION_PREFS[key] as boolean);
  const lead = REMINDER_LEADS.includes(raw.leadDays as ReminderLead)
    ? (raw.leadDays as ReminderLead)
    : DEFAULT_NOTIFICATION_PREFS.leadDays;
  return { bills: bool('bills'), budget: bool('budget'), events: bool('events'), letter: bool('letter'), priceIncrease: bool('priceIncrease'), leadDays: lead };
}

/**
 * Stable positive 31-bit id for a notification key (FNV-1a). Android needs an int id,
 * and the same bill occurrence must always map to the same id so rescheduling is idempotent.
 */
export function notificationId(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const id = hash & 0x7fffffff;
  return id === 0 ? 1 : id;
}

export const REMINDER_HOUR = 9;

/**
 * Local time a reminder fires: `leadDays` calendar days before the due date, at 9:00.
 * Built from local date parts, so month ends and DST changes land on the right wall-clock time.
 */
export function reminderTime(dueDate: string, leadDays: number, hour = REMINDER_HOUR): Date {
  const [year, month, day] = dueDate.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day - leadDays, hour, 0, 0, 0);
}

export interface BillReminder {
  id: number;
  recurringId: string;
  /** YYYY-MM-DD */
  dueDate: string;
  at: Date;
  leadDays: number;
  name: string;
  amount: number;
  currency: RecurringTransaction['currency'];
}

const MAX_OCCURRENCES_PER_ITEM = 8;

/**
 * Bill reminders to have scheduled right now: every future reminder for active expense
 * rules within `horizonDays`, soonest first, capped at `max` (Android limits pending alarms).
 */
export function planBillReminders(
  recurring: RecurringTransaction[],
  now: Date,
  leadDays: number,
  { horizonDays = 45, max = 48 }: { horizonDays?: number; max?: number } = {},
): BillReminder[] {
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + horizonDays, 23, 59);
  const reminders: BillReminder[] = [];

  for (const item of recurring) {
    if (!item.isActive || item.type !== 'expense' || !item.nextDue) continue;
    const end = item.endDate ? item.endDate.slice(0, 10) : null;
    let due = item.nextDue.slice(0, 10);
    for (let count = 0; count < MAX_OCCURRENCES_PER_ITEM; count += 1) {
      if (end && due > end) break;
      const at = reminderTime(due, leadDays);
      if (Number.isNaN(at.getTime()) || at > horizon) break;
      if (at > now) {
        reminders.push({
          id: notificationId(`bill:${item.id}:${due}`),
          recurringId: item.id,
          dueDate: due,
          at,
          leadDays,
          name: item.name,
          amount: item.amount,
          currency: item.currency,
        });
      }
      const next = calculateNextDueDate(due, item.frequency, item.startDate);
      if (next <= due) break;
      due = next;
    }
  }

  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, max);
}

/** What to cancel and what to add so the scheduled bill reminders match `desired`. */
export function diffScheduled(pendingIds: number[], desired: Array<{ id: number }>): { cancel: number[]; add: number[] } {
  const pending = new Set(pendingIds);
  const wanted = new Set(desired.map(item => item.id));
  return {
    cancel: pendingIds.filter(id => !wanted.has(id)),
    add: desired.map(item => item.id).filter(id => !pending.has(id)),
  };
}

export const BUDGET_THRESHOLDS = [0.8, 1] as const;

export interface BudgetCrossing {
  /** 'total' or the category id. */
  scope: 'total' | string;
  /** Category name; undefined for the overall budget. */
  name?: string;
  threshold: (typeof BUDGET_THRESHOLDS)[number];
  spent: number;
  limit: number;
}

const sentKey = (scope: string, threshold: number) => `${scope}@${Math.round(threshold * 100)}`;

/**
 * Thresholds crossed that were not announced yet this month. A jump straight past
 * several thresholds reports only the highest one, but marks all of them as sent.
 */
export function findBudgetCrossings(
  progress: BudgetProgress,
  sent: ReadonlySet<string>,
): { crossings: BudgetCrossing[]; sent: Set<string> } {
  const nextSent = new Set(sent);
  const crossings: BudgetCrossing[] = [];
  const scopes: Array<{ scope: string; name?: string; spent: number; limit: number }> = [];
  if (progress.total > 0) scopes.push({ scope: 'total', spent: progress.spent, limit: progress.total });
  for (const category of progress.categories) {
    if (category.limit > 0) scopes.push({ scope: category.categoryId, name: category.name, spent: category.spent, limit: category.limit });
  }

  for (const entry of scopes) {
    const ratio = entry.spent / entry.limit;
    const reached = BUDGET_THRESHOLDS.filter(threshold => ratio >= threshold);
    const fresh = reached.filter(threshold => !nextSent.has(sentKey(entry.scope, threshold)));
    reached.forEach(threshold => nextSent.add(sentKey(entry.scope, threshold)));
    if (fresh.length > 0) {
      crossings.push({
        scope: entry.scope,
        name: entry.name,
        threshold: fresh[fresh.length - 1],
        spent: entry.spent,
        limit: entry.limit,
      });
    }
  }

  return { crossings, sent: nextSent };
}

/** Month bucket for "once per threshold per month". */
export const budgetMonthKey = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/** Events other people can add to: shared by email, in a team, or owned by someone else. */
export function isCollaborativeEvent(event: Event, currentUserId: string | null | undefined): boolean {
  return (event.sharedEmails?.length ?? 0) > 0 || !!event.teamId || (!!event.userId && !!currentUserId && event.userId !== currentUserId);
}

/**
 * Shared expenses on collaborative events that are not in `known`. Callers pass only
 * ids that arrived from the server, so expenses added on this device never show up here.
 */
export function findNewSharedExpenses(
  expenses: SharedExpense[],
  known: ReadonlySet<string>,
  events: Event[],
  currentUserId: string | null | undefined,
): Array<{ expense: SharedExpense; event: Event }> {
  const collaborative = new Map(
    events.filter(event => isCollaborativeEvent(event, currentUserId)).map(event => [event.id, event] as const),
  );
  return expenses
    .filter(expense => !known.has(expense.id))
    .flatMap(expense => {
      const event = collaborative.get(expense.eventId);
      return event ? [{ expense, event }] : [];
    });
}

/** Keeps the remembered id list bounded: the newest ids win. */
export function trimKnownIds(ids: string[], max = 2000): string[] {
  return ids.length > max ? ids.slice(ids.length - max) : ids;
}
