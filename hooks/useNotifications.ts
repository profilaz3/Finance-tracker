import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { CONFIG } from '../config';
import { TRANSLATIONS } from '../constants';
import { computeBudgetProgress, computeMonthSummary, monthKeyOf } from '../domain/home';
import { scopeStateToWorkspace } from '../domain/teams';
import {
  budgetMonthKey,
  DEFAULT_NOTIFICATION_PREFS,
  findBudgetCrossings,
  findNewSharedExpenses,
  isCollaborativeEvent,
  normalizeNotificationPrefs,
  notificationId,
  planBillReminders,
  trimKnownIds,
  type BudgetCrossing,
  type NotificationPrefs,
} from '../domain/notificationRules';
import type { AddToast } from './useToasts';
import type { AppState, Event, View } from '../types';
import { formatMoney, formatPercent } from '../utils/locale';
import { requestOpenLetter } from '../services/letterStore';
import { readDismissedSubscriptions, readMerchantMeta, requestSubscriptionsTab } from '../services/subscriptionStore';
import { resolveEventParticipants } from '../utils/eventParticipants';
import { buildEventViewer, participantName, readViewerPick } from '../domain/eventViewer';
import {
  canScheduleReminders,
  ensureChannels,
  getNotificationPermission,
  notifyNow,
  onNotificationTap,
  syncBillReminders,
  type NotificationExtra,
  type ScheduledNotification,
} from '../utils/notifications';

// ---------------------------------------------------------------------------
// Preferences: per device (a phone and a laptop may want different alerts), in localStorage.

const PREFS_KEY = CONFIG.NOTIFICATIONS_KEY;
const BILLS_SIGNATURE_KEY = `${CONFIG.NOTIFICATIONS_KEY}:bills-signature`;
let prefsCache: NotificationPrefs | null = null;
const prefsListeners = new Set<() => void>();

const readJson = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: alerts may repeat once, which is harmless.
  }
};

export const getNotificationPrefs = (): NotificationPrefs => {
  prefsCache ??= normalizeNotificationPrefs(readJson(PREFS_KEY) ?? DEFAULT_NOTIFICATION_PREFS);
  return prefsCache;
};

export const setNotificationPrefs = (update: Partial<NotificationPrefs>) => {
  prefsCache = normalizeNotificationPrefs({ ...getNotificationPrefs(), ...update });
  writeJson(PREFS_KEY, prefsCache);
  prefsListeners.forEach(listener => listener());
};

const subscribePrefs = (listener: () => void) => {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
};

export const useNotificationPrefs = (): NotificationPrefs =>
  useSyncExternalStore(subscribePrefs, getNotificationPrefs, () => DEFAULT_NOTIFICATION_PREFS);

// ---------------------------------------------------------------------------

type HydrationStatus = 'idle' | 'hydrating' | 'hydrated' | 'partial' | 'failed';

interface UseNotificationsOptions {
  state: AppState;
  isAuthenticated: boolean;
  currentUserId: string | null;
  hydrationStatus: HydrationStatus;
  fetchRemoteState: () => Promise<unknown>;
  addToast: AddToast;
  onNavigate: (view: View) => void;
  onOpenEvent: (event: Event) => void;
}

const isForeground = () => typeof document === 'undefined' || document.visibilityState === 'visible';
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);

/**
 * Bill reminders, budget alerts and shared-event activity.
 *
 * - Bill reminders are scheduled with the system (they fire with the app closed) and kept in
 *   step with the recurring rules.
 * - Budget alerts fire once per threshold (80%, 100%) per month: an in-app toast while the
 *   app is open, a system notification otherwise.
 * - Shared-event activity compares server data against the expense ids this device has
 *   already seen. Without a push server it runs when the app starts or comes back.
 */
export function useNotifications({
  state,
  isAuthenticated,
  currentUserId,
  hydrationStatus,
  fetchRemoteState,
  addToast,
  onNavigate,
  onOpenEvent,
}: UseNotificationsOptions) {
  const prefs = useNotificationPrefs();
  const t = TRANSLATIONS[state.language];
  const stateRef = useRef(state);
  stateRef.current = state;
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const openEventRef = useRef(onOpenEvent);
  openEventRef.current = onOpenEvent;

  const money = useCallback(
    (amount: number, currency: AppState['baseCurrency']) => formatMoney(amount, currency, stateRef.current.language),
    [],
  );

  const route = useCallback((extra: NotificationExtra) => {
    if (extra.kind === 'bill') navigateRef.current('transactions');
    else if (extra.kind === 'budget') navigateRef.current('budgets');
    else if (extra.kind === 'subscription') {
      requestSubscriptionsTab();
      navigateRef.current('budgets');
    }
    else if (extra.kind === 'letter') {
      requestOpenLetter(extra.month ?? null);
      navigateRef.current('insights');
    } else if (extra.kind === 'event' && extra.eventId) {
      const event = stateRef.current.events.find(item => item.id === extra.eventId);
      if (event) openEventRef.current(event);
      else navigateRef.current('events');
    }
  }, []);

  // Taps on notifications (also delivers a tap that cold-started the app).
  useEffect(() => onNotificationTap(route), [route]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void ensureChannels({ bills: t.notifBills, budget: t.notifBudget, events: t.notifEvents, letters: t.notifLetter });
  }, [isAuthenticated, t]);

  // --- Bill reminders -------------------------------------------------------
  useEffect(() => {
    if (!canScheduleReminders()) return;
    const timer = window.setTimeout(async () => {
      const permission = await getNotificationPermission();
      const enabled = isAuthenticated && prefs.bills && permission === 'granted';
      const plan = enabled ? planBillReminders(state.recurringTransactions ?? [], new Date(), prefs.leadDays) : [];
      const desired: ScheduledNotification[] = plan.map(reminder => {
        const amount = money(reminder.amount, reminder.currency);
        const template = reminder.leadDays === 0
          ? t.notifBillDueToday
          : reminder.leadDays === 1
            ? t.notifBillDueTomorrow
            : t.notifBillDueInDays;
        return {
          id: reminder.id,
          title: t.notifBillTitle,
          body: fill(template, { name: reminder.name, amount, days: reminder.leadDays }),
          at: reminder.at,
          extra: { kind: 'bill', recurringId: reminder.recurringId },
        };
      });
      // Unchanged plan: nothing to do. Any change (a new bill, a renamed one, another language)
      // re-schedules the whole set, so the text in the tray always matches the app.
      const signature = JSON.stringify(desired.map(item => [item.id, item.body, item.at.getTime()]));
      if (signature === readJson(BILLS_SIGNATURE_KEY)) return;
      await syncBillReminders(desired, true);
      writeJson(BILLS_SIGNATURE_KEY, signature);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, prefs, state.recurringTransactions, t, money]);

  // Permission granted later (from settings) should schedule straight away.
  useEffect(() => {
    const onGranted = () => {
      writeJson(BILLS_SIGNATURE_KEY, null);
      setNotificationPrefs({});
    };
    window.addEventListener('finance:notifications-granted', onGranted);
    return () => window.removeEventListener('finance:notifications-granted', onGranted);
  }, []);

  const hydrated = hydrationStatus === 'hydrated' || hydrationStatus === 'partial';

  // --- Budget alerts --------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !currentUserId || !hydrated || !prefs.budget) return;
    const budget = state.budget;
    if (!budget || (budget.monthly <= 0 && Object.keys(budget.categoryLimits ?? {}).length === 0)) return;

    const now = new Date();
    // `state.budget` is the Personal budget: measure it against Personal spending only (team
    // workspaces have their own budgets, shown on their Budgets page).
    const personal = scopeStateToWorkspace(state, null);
    const summary = computeMonthSummary(personal, monthKeyOf(now), now);
    const progress = computeBudgetProgress(budget, summary, personal.categories);
    const key = `${CONFIG.NOTIFICATIONS_KEY}:budget:${currentUserId}`;
    const saved = readJson(key) as { month?: string; sent?: string[] } | null;
    const month = budgetMonthKey(now);
    const firstRun = !saved;
    const sent = new Set(saved?.month === month && Array.isArray(saved.sent) ? saved.sent : []);
    const { crossings, sent: nextSent } = findBudgetCrossings(progress, sent);
    writeJson(key, { month, sent: [...nextSent] });
    // The first time this device sees a budget, take the current level as the baseline.
    if (firstRun || crossings.length === 0) return;

    const describe = (crossing: BudgetCrossing) => {
      const over = crossing.threshold >= 1;
      const title = crossing.name
        ? fill(over ? t.notifBudgetCategoryOverTitle : t.notifBudgetCategoryNearTitle, { category: crossing.name })
        : over ? t.notifBudgetOverTitle : t.notifBudgetNearTitle;
      const body = fill(t.notifBudgetBody, {
        spent: money(crossing.spent, state.baseCurrency),
        limit: money(crossing.limit, state.baseCurrency),
      });
      return { title, body, over };
    };

    for (const crossing of crossings) {
      const { title, body, over } = describe(crossing);
      const id = notificationId(`budget:${month}:${crossing.scope}:${crossing.threshold}`);
      if (isForeground()) {
        addToast(`${title}. ${body}`, over ? 'error' : 'warning', { label: t.notifView, onClick: () => navigateRef.current('budgets') }, {
          id: `toast-budget-${crossing.scope}`,
        });
      } else {
        void notifyNow(id, title, body, { kind: 'budget' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the inputs of the budget maths
  }, [isAuthenticated, currentUserId, hydrated, prefs.budget, state.transactions, state.budget, state.categories, state.rates, state.baseCurrency, t, money, addToast]);

  // --- Subscription price increases -----------------------------------------
  // Once per merchant per increase. The first run on a device only reports increases from the
  // last week, so installing or reinstalling does not replay old news.
  useEffect(() => {
    if (!isAuthenticated || !currentUserId || !hydrated || !prefs.priceIncrease) return;
    const now = Date.now();
    const key = `${CONFIG.NOTIFICATIONS_KEY}:price:${currentUserId}`;
    const saved = readJson(key);
    const firstRun = !Array.isArray(saved);
    const sent = new Set(Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === 'string') : []);
    let cancelled = false;
    // Detection loads on demand so it stays out of the startup bundle.
    void import('../domain/subscriptions').then(({ detectSubscriptions, priceIncreaseKey }) => {
      if (cancelled) return;
      const items = detectSubscriptions(state.transactions, state.recurringTransactions ?? [], {
        now,
        dismissed: readDismissedSubscriptions(),
      });
      const fresh = items.filter(item => {
        const id = priceIncreaseKey(item);
        if (!id || sent.has(id)) return false;
        return !firstRun || now - Date.parse(item.priceIncrease!.date) <= 7 * 86_400_000;
      });
      for (const item of items) {
        const id = priceIncreaseKey(item);
        if (id) sent.add(id);
      }
      if (!firstRun && fresh.length === 0) return;
      writeJson(key, [...sent].slice(-200));

      const meta = readMerchantMeta();
      for (const item of fresh) {
        const increase = item.priceIncrease!;
        const name = meta[item.key]?.name ?? item.label;
        const title = fill(t.priceIncreaseTitle, { name, pct: formatPercent(increase.pct * 100, 0, stateRef.current.language) });
        const body = fill(t.priceIncreaseBody, { to: money(increase.to, item.currency), from: money(increase.from, item.currency) });
        if (isForeground()) {
          addToast(`${title}. ${body}`, 'warning', {
            label: t.notifView,
            onClick: () => {
              requestSubscriptionsTab();
              navigateRef.current('budgets');
            },
          }, { id: `toast-price-${item.id}` });
        } else {
          void notifyNow(notificationId(`price:${priceIncreaseKey(item)}`), title, body, { kind: 'subscription' });
        }
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUserId, hydrated, prefs.priceIncrease, state.transactions, state.recurringTransactions, t, money, addToast]);

  // --- Shared event activity ------------------------------------------------
  const previousStatusRef = useRef<HydrationStatus>(hydrationStatus);
  useEffect(() => {
    // Keep the old status until the user id is known so a fetch that lands first is not missed.
    if (!isAuthenticated || !currentUserId) return;
    const previous = previousStatusRef.current;
    previousStatusRef.current = hydrationStatus;

    const key = `${CONFIG.NOTIFICATIONS_KEY}:seen:${currentUserId}`;
    const saved = readJson(key);
    const known = new Set(Array.isArray(saved) ? (saved as string[]) : []);
    const expenses = state.sharedExpenses ?? [];
    // Only a server fetch that just finished can bring in other people's expenses; anything
    // that appears at other times was added on this device and is simply remembered. Only a
    // fetch sets the hydrated statuses and the user id can arrive after it, so any step into
    // them counts (idle -> hydrated on start, hydrating -> hydrated on a refresh).
    const justFetched = hydrated && previous !== hydrationStatus;

    if (justFetched && Array.isArray(saved) && prefs.events) {
      // In someone else's event, "mine" is the participant this user said they are (domain/eventViewer).
      const viewerOf = (event: Event) => buildEventViewer({
        event,
        sessionUserId: currentUserId,
        userProfileId: state.userProfile?.id,
        pick: readViewerPick(currentUserId, event.id),
        people: state.people ?? [],
      });
      const fresh = findNewSharedExpenses(expenses, known, state.events, currentUserId)
        .filter(({ expense, event }) => !viewerOf(event).selfIds.has(expense.paidBy) && expense.paidBy !== 'me');
      const byEvent = new Map<string, typeof fresh>();
      fresh.forEach(entry => byEvent.set(entry.event.id, [...(byEvent.get(entry.event.id) ?? []), entry]));

      byEvent.forEach((entries, eventId) => {
        const event = entries[0].event;
        let body: string;
        if (entries.length === 1) {
          const { expense } = entries[0];
          const eventPeople = resolveEventParticipants({
            event,
            people: state.people ?? [],
            userProfile: state.userProfile,
            fallbackCurrency: state.baseCurrency,
            viewerUserId: currentUserId,
          });
          // The organizer keeps their name (or "Organizer") even when their id is not a person row.
          const payerName = participantName(expense.paidBy, viewerOf(event), [...eventPeople, ...(state.people ?? [])], {
            you: t.you,
            organizer: t.organizer,
            unknown: '',
          });
          const values = { name: payerName, expense: expense.name, amount: money(expense.amount, expense.currency), event: event.name };
          body = fill(payerName ? t.notifEventExpense : t.notifEventExpenseNoName, values);
        } else {
          body = fill(t.notifEventMany, { count: entries.length, event: event.name });
        }
        if (isForeground()) {
          addToast(body, 'info', { label: t.notifView, onClick: () => openEventRef.current(event) }, { id: `toast-event-${eventId}` });
        } else {
          void notifyNow(notificationId(`event:${eventId}:${entries.map(entry => entry.expense.id).join(',')}`), event.name, body, {
            kind: 'event',
            eventId,
          });
        }
      });
    }

    // Remember ids only while a server copy is in. During a fetch the list can already hold
    // merged server rows from an earlier fetch, and marking them seen would hide them.
    if (!hydrated) return;
    const next = trimKnownIds([...new Set([...known, ...expenses.map(expense => expense.id)])]);
    if (next.length !== known.size) writeJson(key, next);
  }, [hydrationStatus, hydrated, isAuthenticated, currentUserId, prefs.events, state.sharedExpenses, state.events, state.people, state.userProfile, state.baseCurrency, t, money, addToast]);

  // Coming back after a while: refresh so new expenses on shared events show up.
  useEffect(() => {
    if (!isAuthenticated || !prefs.events) return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt || Date.now() - hiddenAt < CONFIG.RESUME_REFRESH_AFTER_MS) return;
      hiddenAt = 0;
      const hasShared = stateRef.current.events.some(event => event.status === 'active' && isCollaborativeEvent(event, currentUserId));
      if (hasShared && navigator.onLine !== false) void fetchRemoteState();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isAuthenticated, prefs.events, currentUserId, fetchRemoteState]);
}

/** Fires a sample notification; used by the settings test button. */
export async function sendTestNotification(language: AppState['language']): Promise<boolean> {
  const t = TRANSLATIONS[language];
  await ensureChannels({ bills: t.notifBills, budget: t.notifBudget, events: t.notifEvents });
  return notifyNow(notificationId(`test:${Date.now()}`), t.notifTestTitle, t.notifTestBody, { kind: 'test' });
}
