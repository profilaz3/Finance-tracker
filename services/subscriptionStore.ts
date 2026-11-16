import { CONFIG } from '../config';
import type { ServiceType } from '../utils/aiCleanup';

/**
 * Small per-device stores for the subscription list: AI display names per merchant key,
 * "Not a subscription" choices, and a one-shot request to open the Subscriptions tab
 * (from a price-increase notification). localStorage only; losing it is harmless.
 */

const META_KEY = `${CONFIG.STORAGE_KEY}:subscriptions-meta`;
const DISMISSED_KEY = `${CONFIG.STORAGE_KEY}:subscriptions-dismissed`;
const MAX_DISMISSED = 500;

export interface StoredMerchantMeta {
  name: string;
  service: ServiceType;
  at: number;
}

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
    // Storage full or blocked: a convenience cache only.
  }
};

export const readMerchantMeta = (): Record<string, StoredMerchantMeta> => {
  const stored = readJson(META_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, StoredMerchantMeta] =>
        !!entry[1] && typeof (entry[1] as StoredMerchantMeta).name === 'string' && typeof (entry[1] as StoredMerchantMeta).at === 'number',
    ),
  );
};

export const writeMerchantMeta = (meta: Record<string, StoredMerchantMeta>) => writeJson(META_KEY, meta);

export const readDismissedSubscriptions = (): string[] => {
  const list = readJson(DISMISSED_KEY);
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(-MAX_DISMISSED) : [];
};

export const dismissSubscription = (id: string): string[] => {
  const next = [...readDismissedSubscriptions().filter(entry => entry !== id), id].slice(-MAX_DISMISSED);
  writeJson(DISMISSED_KEY, next);
  return next;
};

export const restoreDismissedSubscription = (id: string): string[] => {
  const next = readDismissedSubscriptions().filter(entry => entry !== id);
  writeJson(DISMISSED_KEY, next);
  return next;
};

export const OPEN_SUBSCRIPTIONS_EVENT = 'finance:open-subscriptions';
let openSubscriptionsRequested = false;

/** Asks the next BudgetsView mount to start on the Subscriptions tab. */
export const requestSubscriptionsTab = () => {
  openSubscriptionsRequested = true;
  // An already open BudgetsView switches tabs on this event.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_SUBSCRIPTIONS_EVENT));
};

/** Reads and clears the request. */
export const takeSubscriptionsTabRequest = (): boolean => {
  const requested = openSubscriptionsRequested;
  openSubscriptionsRequested = false;
  return requested;
};

const NAMES_KEY = `${CONFIG.STORAGE_KEY}:subscriptions-names`;
const MAX_NAMES = 200;
/** Longest name kept for a renamed subscription. */
export const SUBSCRIPTION_NAME_MAX = 60;

/** Names the user gave subscriptions (per merchant key); they win over AI names. */
export const readSubscriptionNames = (): Record<string, string> => {
  const stored = readJson(NAMES_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([key, name]) => [key, name.trim().slice(0, SUBSCRIPTION_NAME_MAX)]),
  );
};

/** Renames one subscription; an empty name goes back to the detected one. */
export const renameSubscription = (key: string, name: string): Record<string, string> => {
  const names = readSubscriptionNames();
  delete names[key];
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, SUBSCRIPTION_NAME_MAX);
  const next = clean ? { ...names, [key]: clean } : names;
  const trimmed = Object.fromEntries(Object.entries(next).slice(-MAX_NAMES));
  writeJson(NAMES_KEY, trimmed);
  return trimmed;
};
