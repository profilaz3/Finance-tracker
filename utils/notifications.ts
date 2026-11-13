/**
 * Thin platform layer for notifications.
 *
 * On the phone this uses @capacitor/local-notifications (loaded on first use): scheduled
 * reminders fire even when the app is closed. In a browser it falls back to the Notification
 * API, but only once the user has granted it from settings; nothing prompts on load, and
 * scheduling is a no-op because a web page cannot wake itself up.
 */
import { Capacitor } from '@capacitor/core';
import { CONFIG } from '../config';
import { diffScheduled } from '../domain/notificationRules';

type LocalNotificationsModule = typeof import('@capacitor/local-notifications');
let pluginModule: Promise<LocalNotificationsModule> | null = null;
const plugin = () => (pluginModule ??= import('@capacitor/local-notifications'));

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const hasWebNotifications = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

export type NotificationKind = 'bill' | 'budget' | 'event' | 'letter' | 'subscription' | 'test';

export interface NotificationExtra {
  kind: NotificationKind;
  eventId?: string;
  recurringId?: string;
  /** Monthly letter: the month it is about, "YYYY-MM". */
  month?: string;
}

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export const CHANNELS: Record<NotificationKind, string> = {
  bill: 'bills',
  budget: 'budget',
  event: 'events',
  letter: 'letters',
  // Price increases share the money-alerts channel with budgets.
  subscription: 'budget',
  test: 'bills',
};

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await plugin();
      const { display } = await LocalNotifications.checkPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (!hasWebNotifications()) return 'unsupported';
  const permission = Notification.permission;
  return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'prompt';
}

/** Asks for permission. Call only from a user action (a tap in settings). */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await plugin();
      const { display } = await LocalNotifications.requestPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (!hasWebNotifications()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt';
}

let channelsReady: Promise<void> | null = null;

/** Android notification channels, shown by name in the system settings. Created once per launch. */
export function ensureChannels(names: Record<'bills' | 'budget' | 'events', string> & { letters?: string }): Promise<void> {
  if (!isNative() || Capacitor.getPlatform() !== 'android') return Promise.resolve();
  channelsReady ??= plugin()
    .then(({ LocalNotifications }) =>
      Promise.all([
        LocalNotifications.createChannel({ id: 'bills', name: names.bills, importance: 4, visibility: 1 }),
        LocalNotifications.createChannel({ id: 'budget', name: names.budget, importance: 3, visibility: 1 }),
        LocalNotifications.createChannel({ id: 'events', name: names.events, importance: 3, visibility: 1 }),
        LocalNotifications.createChannel({ id: 'letters', name: names.letters ?? names.events, importance: 3, visibility: 1 }),
      ]),
    )
    .then(() => undefined)
    .catch(() => {
      channelsReady = null;
    });
  return channelsReady;
}

export interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  at: Date;
  extra: NotificationExtra;
}

const SCHEDULED_BILLS_KEY = `${CONFIG.NOTIFICATIONS_KEY}:scheduled-bills`;

const readIds = (key: string): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
};

const writeIds = (key: string, ids: number[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage full or blocked: the next sync falls back to the pending list.
  }
};

/**
 * Makes the scheduled bill reminders match `desired`: cancels stale ones and schedules the
 * missing ones. Ids are stable per bill occurrence, so calling this repeatedly is idempotent.
 * Changed text (a renamed bill) is picked up because the caller passes a fresh list and
 * `force` re-schedules everything.
 */
export async function syncBillReminders(desired: ScheduledNotification[], force = false): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await plugin();
    const { notifications } = await LocalNotifications.getPending();
    const remembered = new Set(readIds(SCHEDULED_BILLS_KEY));
    const pendingBills = notifications
      .filter(item => (item.extra as NotificationExtra | undefined)?.kind === 'bill' || remembered.has(item.id))
      .map(item => item.id);
    const { cancel, add } = force
      ? { cancel: pendingBills, add: desired.map(item => item.id) }
      : diffScheduled(pendingBills, desired);
    if (cancel.length > 0) await LocalNotifications.cancel({ notifications: cancel.map(id => ({ id })) });
    const toAdd = desired.filter(item => add.includes(item.id));
    if (toAdd.length > 0) {
      await LocalNotifications.schedule({
        notifications: toAdd.map(item => ({
          id: item.id,
          title: item.title,
          body: item.body,
          schedule: { at: item.at },
          channelId: CHANNELS.bill,
          extra: item.extra,
        })),
      });
    }
    writeIds(SCHEDULED_BILLS_KEY, desired.map(item => item.id));
  } catch (error) {
    console.warn('[notifications] could not schedule bill reminders', error);
  }
}

const SCHEDULED_LETTER_KEY = `${CONFIG.NOTIFICATIONS_KEY}:scheduled-letter`;

/**
 * Keeps at most one pending "your letter is here" reminder (the next 1st of the month).
 * Passing null cancels it. Idempotent: an unchanged reminder is left alone.
 */
export async function syncLetterReminder(desired: ScheduledNotification | null): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await plugin();
    const { notifications } = await LocalNotifications.getPending();
    const remembered = new Set(readIds(SCHEDULED_LETTER_KEY));
    const pending = notifications
      .filter(item => (item.extra as NotificationExtra | undefined)?.kind === 'letter' || remembered.has(item.id))
      .map(item => item.id);
    const { cancel, add } = diffScheduled(pending, desired ? [desired] : []);
    if (cancel.length > 0) await LocalNotifications.cancel({ notifications: cancel.map(id => ({ id })) });
    if (desired && add.includes(desired.id)) {
      await LocalNotifications.schedule({
        notifications: [{ id: desired.id, title: desired.title, body: desired.body, schedule: { at: desired.at }, channelId: CHANNELS.letter, extra: desired.extra }],
      });
    }
    writeIds(SCHEDULED_LETTER_KEY, desired ? [desired.id] : []);
  } catch (error) {
    console.warn('[notifications] could not schedule the letter reminder', error);
  }
}

type TapHandler = (extra: NotificationExtra) => void;
let webTapHandler: TapHandler | null = null;

/** Shows a notification right away (system tray on the phone, a browser notification on the web). */
export async function notifyNow(id: number, title: string, body: string, extra: NotificationExtra): Promise<boolean> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await plugin();
      await LocalNotifications.schedule({
        notifications: [{ id, title, body, channelId: CHANNELS[extra.kind], extra }],
      });
      return true;
    } catch (error) {
      console.warn('[notifications] could not show notification', error);
      return false;
    }
  }
  if (!hasWebNotifications() || Notification.permission !== 'granted') return false;
  try {
    const notification = new Notification(title, { body, tag: String(id), icon: '/icon-192.png' });
    notification.onclick = () => {
      window.focus();
      notification.close();
      webTapHandler?.(extra);
    };
    return true;
  } catch {
    // Some browsers (Android Chrome) only allow notifications from a service worker.
    return false;
  }
}

/** Runs `handler` when the user taps one of our notifications. Returns an unsubscribe function. */
export function onNotificationTap(handler: TapHandler): () => void {
  webTapHandler = handler;
  if (!isNative()) {
    return () => {
      if (webTapHandler === handler) webTapHandler = null;
    };
  }
  let removed = false;
  let remove: (() => void) | null = null;
  plugin()
    .then(({ LocalNotifications }) =>
      LocalNotifications.addListener('localNotificationActionPerformed', action => {
        const extra = action.notification.extra as NotificationExtra | undefined;
        if (extra?.kind) handler(extra);
      }),
    )
    .then(handle => {
      if (removed) void handle.remove();
      else remove = () => void handle.remove();
    })
    .catch(() => undefined);
  return () => {
    removed = true;
    remove?.();
    if (webTapHandler === handler) webTapHandler = null;
  };
}

export const notificationsSupported = (): boolean => isNative() || hasWebNotifications();
export const canScheduleReminders = (): boolean => isNative();
