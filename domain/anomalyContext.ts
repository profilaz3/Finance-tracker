import type { Category, Currency, ExchangeRates, Event, RecurringTransaction, Transaction } from '../types';
import type { AnalyticsAnomaly } from '../utils/analyticsSelectors';
import { convertAmount } from '../services/currencyService';
import { formatDate, formatPercent, type AppLanguage } from '../utils/locale';
import { parseLocalDate } from './home';
import { FEE_CURRENCY, getCountedExpenseAmount, isCountedExpense } from './money';
import { normalizeMerchant } from './merchantMemory';
import { letterMoney, matchesRecurring, merchantLabel } from './monthlyLetter';

/**
 * Compact, pre-formatted context for each flagged anomaly, so the model can say in one
 * sentence why it probably happened. Only aggregates and short labels leave the device.
 */

export interface AnomalyPeriod {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  currentKey: string;
}

export interface AnomalyContextInputs {
  transactions: Transaction[];
  categories: Category[];
  events?: Event[];
  recurringTransactions?: RecurringTransaction[];
  baseCurrency: Currency;
  rates: ExchangeRates;
  language: AppLanguage;
}

export interface AnomalyContext {
  id: string;
  kind: AnalyticsAnomaly['kind'];
  facts: Record<string, unknown>;
}

export const MAX_EXPLAINED_ANOMALIES = 8;
const LOOKBACK_MS = 180 * 86_400_000;

const within = (transaction: Transaction, start: Date, end: Date): boolean => {
  const time = parseLocalDate(transaction.date).getTime();
  return time >= start.getTime() && time <= end.getTime();
};

/**
 * Same shop under a slightly different label ("NETFLIX.COM 8821" and "Netflix"): equal keys,
 * or the same distinctive first word.
 */
export const samePlace = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  const first = a.split(' ')[0];
  return first.length >= 4 && first === b.split(' ')[0];
};

const short = (value: string, max = 40) => value.replace(/\s+/g, ' ').trim().slice(0, max);

const eventOverlaps = (event: Event, start: Date, end: Date): boolean => {
  const from = event.startDate ? parseLocalDate(event.startDate.slice(0, 10)) : null;
  const to = event.endDate ? parseLocalDate(event.endDate.slice(0, 10)) : from;
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  return from.getTime() <= end.getTime() && to.getTime() + 86_399_999 >= start.getTime();
};

export function buildAnomalyContexts(
  anomalies: readonly AnalyticsAnomaly[],
  period: AnomalyPeriod,
  inputs: AnomalyContextInputs,
): AnomalyContext[] {
  const { transactions, baseCurrency, rates, language } = inputs;
  const fmt = (amount: number) => letterMoney(amount, baseCurrency, language);
  const day = (value: string) => formatDate(parseLocalDate(value), { day: 'numeric', month: 'long' }, language);
  const pct = (value: number | undefined) => (value === undefined ? undefined : formatPercent(value, 1, language));
  const categoryName = (id: string) => inputs.categories.find(category => category.id === id)?.name ?? id;
  const activeRecurring = (inputs.recurringTransactions ?? []).filter(rule => rule.isActive);
  const eventsById = new Map((inputs.events ?? []).map(event => [event.id, event] as const));
  const overlappingEvents = (inputs.events ?? []).filter(event => eventOverlaps(event, period.currentStart, period.currentEnd));

  const expenses = (start: Date, end: Date) =>
    transactions
      .filter(transaction => isCountedExpense(transaction) && within(transaction, start, end))
      .map(transaction => ({ transaction, amount: getCountedExpenseAmount(transaction, baseCurrency, rates) }))
      .filter(entry => entry.amount > 0);
  const current = expenses(period.currentStart, period.currentEnd);
  const previous = expenses(period.previousStart, period.previousEnd);

  const seenBefore = (transaction: Transaction): number => {
    const key = normalizeMerchant(merchantLabel(transaction));
    if (!key) return 0;
    const time = parseLocalDate(transaction.date).getTime();
    return transactions.filter(other => {
      if (other.id === transaction.id) return false;
      const otherTime = parseLocalDate(other.date).getTime();
      return otherTime < time && otherTime >= time - LOOKBACK_MS && samePlace(normalizeMerchant(merchantLabel(other)), key);
    }).length;
  };

  const describePurchase = (transaction: Transaction, amount: number) => {
    const earlier = seenBefore(transaction);
    const event = transaction.eventId ? eventsById.get(transaction.eventId) : undefined;
    return {
      name: short(merchantLabel(transaction) || categoryName(transaction.categoryId)),
      amount: fmt(amount),
      date: day(transaction.date),
      recurring: matchesRecurring(transaction, activeRecurring, baseCurrency, rates),
      newMerchant: Boolean(merchantLabel(transaction)) && earlier === 0,
      ...(event ? { event: short(event.name) } : {}),
      ...(transaction.splitDetails ? { splitWithOthers: true } : {}),
    };
  };

  return anomalies.slice(0, MAX_EXPLAINED_ANOMALIES).map((anomaly): AnomalyContext => {
    if (anomaly.kind === 'category-spike' && anomaly.categoryId) {
      const inCategory = (entries: typeof current) => entries.filter(entry => entry.transaction.categoryId === anomaly.categoryId);
      const now = inCategory(current);
      const before = inCategory(previous);
      const byMerchant = (entries: typeof current) => {
        const map = new Map<string, { label: string; amount: number; count: number }>();
        entries.forEach(({ transaction, amount }) => {
          const label = merchantLabel(transaction);
          const key = normalizeMerchant(label) || '(no name)';
          const entry = map.get(key) ?? { label: label || '(no name)', amount: 0, count: 0 };
          entry.amount += amount;
          entry.count += 1;
          map.set(key, entry);
        });
        return map;
      };
      const merchantsNow = byMerchant(now);
      const merchantsBefore = byMerchant(before);
      const topMerchants = [...merchantsNow.entries()]
        .map(([key, entry]) => ({
          key,
          ...entry,
          previous: [...merchantsBefore.entries()].filter(([other]) => samePlace(key, other)).reduce((sum, [, before]) => sum + before.amount, 0),
        }))
        .sort((a, b) => (b.amount - b.previous) - (a.amount - a.previous))
        .slice(0, 4)
        .map(entry => ({
          name: short(entry.label),
          thisPeriod: fmt(entry.amount),
          previousPeriod: fmt(entry.previous),
          purchases: entry.count,
          ...(entry.previous === 0 ? { newThisPeriod: true } : {}),
        }));
      const events = overlappingEvents
        .map(event => ({ event, spent: now.filter(entry => entry.transaction.eventId === event.id).reduce((sum, entry) => sum + entry.amount, 0) }))
        .filter(entry => entry.spent > 0)
        .map(entry => ({ name: short(entry.event.name), spentInCategory: fmt(entry.spent) }));
      return {
        id: anomaly.id,
        kind: anomaly.kind,
        facts: {
          what: 'spending in one category rose against the previous period',
          category: short(anomaly.categoryName ?? categoryName(anomaly.categoryId)),
          increase: fmt(anomaly.amount),
          ...(anomaly.percentage !== undefined ? { increasePercent: pct(anomaly.percentage) } : {}),
          purchasesThisPeriod: now.length,
          purchasesPreviousPeriod: before.length,
          merchants: topMerchants,
          largestPurchases: [...now].sort((a, b) => b.amount - a.amount).slice(0, 3).map(entry => describePurchase(entry.transaction, entry.amount)),
          recurringRulesInCategory: activeRecurring.filter(rule => rule.categoryId === anomaly.categoryId).length,
          ...(events.length > 0 ? { events } : {}),
        },
      };
    }

    if (anomaly.kind === 'large-transaction') {
      const id = anomaly.id.slice('large-transaction:'.length);
      const entry = current.find(item => item.transaction.id === id);
      const items = entry?.transaction.receiptData?.items?.slice(0, 4).map(item => short(item.name, 30)).filter(Boolean) ?? [];
      return {
        id: anomaly.id,
        kind: anomaly.kind,
        facts: {
          what: 'one expense was a large share of the period',
          category: short(anomaly.categoryName ?? (entry ? categoryName(entry.transaction.categoryId) : '')),
          amount: fmt(anomaly.amount),
          ...(anomaly.percentage !== undefined ? { shareOfPeriodSpending: pct(anomaly.percentage) } : {}),
          ...(entry
            ? {
                purchase: describePurchase(entry.transaction, entry.amount),
                earlierPurchasesAtSamePlace: seenBefore(entry.transaction),
                ...(items.length > 0 ? { receiptItems: items } : {}),
              }
            : {}),
          ...(overlappingEvents.length > 0 ? { eventsInPeriod: overlappingEvents.slice(0, 3).map(event => short(event.name)) } : {}),
        },
      };
    }

    // High fees.
    const withFees = current
      .filter(({ transaction }) => (transaction.fees ?? 0) > 0)
      .map(({ transaction }) => ({ transaction, fee: convertAmount(transaction.fees ?? 0, FEE_CURRENCY, baseCurrency, rates) }))
      .sort((a, b) => b.fee - a.fee);
    return {
      id: anomaly.id,
      kind: anomaly.kind,
      facts: {
        what: 'fees were high compared with spending',
        totalFees: fmt(anomaly.amount),
        ...(anomaly.percentage !== undefined ? { shareOfSpending: pct(anomaly.percentage) } : {}),
        paymentsWithFees: withFees.length,
        paymentsInOtherCurrencies: current.filter(({ transaction }) => transaction.currency !== baseCurrency).length,
        largestFees: withFees.slice(0, 3).map(({ transaction, fee }) => ({
          name: short(merchantLabel(transaction) || categoryName(transaction.categoryId)),
          fee: fmt(fee),
          date: day(transaction.date),
          currency: transaction.currency,
        })),
      },
    };
  });
}

/** FNV-1a over a string, as 8 hex digits. */
export const hashText = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Cache key for a set of explanations: the period, the language and the anomalies with their
 * amounts to two significant digits, so adding a small expense does not spend another AI call.
 */
export const anomalySignature = (anomalies: readonly AnalyticsAnomaly[], periodKey: string, language: AppLanguage): string =>
  `${periodKey}:${language}:${hashText(
    anomalies
      .slice(0, MAX_EXPLAINED_ANOMALIES)
      .map(anomaly => `${anomaly.id}=${Number(anomaly.amount.toPrecision(2))}`)
      .join('|'),
  )}`;
