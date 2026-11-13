import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Repeat, TrendingUp, EyeOff } from 'lucide-react';
import type { AppState, RecurringTransaction } from '../../types';
import { TRANSLATIONS } from '../../constants';
import {
  CADENCE_FREQUENCY,
  detectSubscriptions,
  recurringFromSubscription,
  subscriptionTotals,
  type DetectedSubscription,
  type SubscriptionCadence,
} from '../../domain/subscriptions';
import { convertCurrency } from '../../utils/currencyUtils';
import { formatPercent, formatShortDate, formatDate } from '../../utils/locale';
import { fetchMerchantMeta } from '../../services/cleanupService';
import {
  dismissSubscription,
  readDismissedSubscriptions,
  readMerchantMeta,
  restoreDismissedSubscription,
  type StoredMerchantMeta,
} from '../../services/subscriptionStore';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { fill, money } from '../home/parts';
import { ServiceGlyph } from './ServiceGlyph';

type ToastFn = (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;

interface SubscriptionsPanelProps {
  state: AppState;
  onAddRecurring?: (recurring: RecurringTransaction) => void;
  onToast?: ToastFn;
}

const CADENCE_KEYS: Record<SubscriptionCadence, 'subCadenceWeekly' | 'subCadenceBiweekly' | 'subCadenceMonthly' | 'subCadenceQuarterly' | 'subCadenceYearly'> = {
  weekly: 'subCadenceWeekly',
  biweekly: 'subCadenceBiweekly',
  monthly: 'subCadenceMonthly',
  quarterly: 'subCadenceQuarterly',
  yearly: 'subCadenceYearly',
};

/** "NETFLIX.COM 8821" reads better as "Netflix.com" until the AI name arrives. */
const prettyLabel = (label: string): string => {
  const trimmed =
    label
      // Trailing reference codes: "8821", "P2A9C", "#123".
      .replace(/(\s+[#*]?(?=[\p{L}\d]*\d)[\p{L}\d*/-]+)+$/u, '')
      // Legal suffix and whatever follows it (usually the city): "FITPASS DOO BEOGRAD" -> "FITPASS".
      .replace(/\s+(d\.?\s?o\.?\s?o\.?|a\.?d\.?|szr|str|pr)(\s.*)?$/i, '')
      .trim() || label;
  return trimmed === trimmed.toUpperCase() ? trimmed.toLowerCase().replace(/(^|\s)\p{L}/gu, ch => ch.toUpperCase()) : trimmed;
};

export const SubscriptionsPanel: React.FC<SubscriptionsPanelProps> = ({ state, onAddRecurring, onToast }) => {
  const t = TRANSLATIONS[state.language];
  const { language, baseCurrency } = state;
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissedSubscriptions());
  const [meta, setMeta] = useState<Record<string, StoredMerchantMeta>>(() => readMerchantMeta());
  const [showHidden, setShowHidden] = useState(false);

  const all = useMemo(
    () => detectSubscriptions(state.transactions, state.recurringTransactions ?? []),
    [state.transactions, state.recurringTransactions],
  );
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const items = all.filter(item => !dismissedSet.has(item.id));
  const hidden = all.filter(item => dismissedSet.has(item.id));
  const active = items.filter(item => item.status === 'active');
  const stopped = items.filter(item => item.status === 'stopped');
  const totals = subscriptionTotals(items, (amount, from) => convertCurrency(amount, from, baseCurrency, state.rates.rates));

  // Clean names and service types: one small AI call for merchants not seen before.
  const missingKey = all.filter(item => !meta[item.key]).map(item => item.key).join(',');
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    void fetchMerchantMeta(all.map(item => ({ key: item.key, label: item.label }))).then(next => {
      if (!cancelled) setMeta(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when new merchants appear
  }, [missingKey]);

  const nameOf = (item: DetectedSubscription) => meta[item.key]?.name ?? prettyLabel(item.label);

  const track = (item: DetectedSubscription) => {
    if (!onAddRecurring) return;
    const rule = recurringFromSubscription(item, nameOf(item), () => crypto.randomUUID());
    if (rule) onAddRecurring(rule);
  };

  const dismiss = (item: DetectedSubscription) => {
    setDismissed(dismissSubscription(item.id));
    onToast?.(fill(t.subscriptionDismissed, { name: nameOf(item) }), 'info', {
      label: t.undo,
      onClick: () => setDismissed(restoreDismissedSubscription(item.id)),
    });
  };

  const restore = (item: DetectedSubscription) => setDismissed(restoreDismissedSubscription(item.id));

  const row = (item: DetectedSubscription, index: number, list: DetectedSubscription[], mode: 'active' | 'stopped' | 'hidden') => {
    const name = nameOf(item);
    const category = state.categories.find(entry => entry.id === item.categoryId);
    const service = meta[item.key]?.service;
    const increase = item.priceIncrease;
    const canTrack = mode === 'active' && Boolean(onAddRecurring) && Boolean(CADENCE_FREQUENCY[item.cadence]);
    return (
      <li key={item.id} className={clsx('flex flex-col gap-2.5 py-3', index < list.length - 1 && 'border-b border-hair', mode !== 'active' && 'opacity-80')}>
        <div className="flex items-center gap-3">
          {service ? <ServiceGlyph service={service} size={40} /> : <CategoryGlyph category={category} size={40} />}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold">{name}</span>
            <span className="block truncate text-[13px] text-muted">
              {t[CADENCE_KEYS[item.cadence]]} ·{' '}
              {mode === 'active'
                ? fill(t.subscriptionNext, { date: formatShortDate(item.nextDate, language) })
                : fill(t.subscriptionLast, { date: formatShortDate(item.lastDate, language) })}
            </span>
          </div>
          <div className="shrink-0 text-right">
            <span className="block whitespace-nowrap text-[16px] font-bold tabular-nums">
              {money(item.monthlyCost, item.currency, language)}
              <span className="text-[12px] font-semibold text-muted">/{t.subscriptionMonth}</span>
            </span>
            <span className="block whitespace-nowrap text-[12px] text-muted tabular-nums">
              {money(item.yearlyCost, item.currency, language)}/{t.subscriptionYear}
            </span>
          </div>
        </div>

        {increase && mode === 'active' && (
          <div className="ml-[52px] flex flex-col gap-0.5 rounded-[14px] px-3 py-2" style={{ background: 'color-mix(in oklab, var(--paper-neg) 12%, var(--paper-tile))' }}>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-neg">
              <TrendingUp size={14} aria-hidden="true" />
              {fill(t.subscriptionPriceUp, {
                name,
                pct: formatPercent(increase.pct * 100, 0, language),
                month: formatDate(increase.date, { month: 'long' }, language),
              })}
            </span>
            <span className="text-[12px] text-muted">
              {fill(t.subscriptionPriceWas, { from: money(increase.from, item.currency, language, true), to: money(increase.to, item.currency, language, true) })}
            </span>
          </div>
        )}

        <div className={clsx('grid gap-2', canTrack || mode === 'hidden' ? 'grid-cols-2' : 'grid-cols-1')}>
          {canTrack && (
            <button
              type="button"
              onClick={() => track(item)}
              className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full bg-accent px-3 text-[13px] font-semibold text-on-accent"
            >
              <Repeat size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{t.trackAsRecurring}</span>
            </button>
          )}
          {mode === 'hidden' ? (
            <button type="button" onClick={() => restore(item)} className="h-9 min-w-0 truncate rounded-full bg-chip px-3 text-[13px] font-semibold">
              {t.subscriptionsRestore}
            </button>
          ) : (
            <button type="button" onClick={() => dismiss(item)} className="h-9 min-w-0 truncate rounded-full bg-chip px-3 text-[13px] font-semibold text-muted">
              {t.notASubscription}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-[15px] text-muted">{t.subscriptionsIntro}</p>

      {active.length > 0 && (
        <section className="paper-tile flex flex-col gap-1 p-4" aria-label={t.subscriptionsTotal}>
          <span className="text-[13px] font-semibold uppercase tracking-wide text-faint">{t.subscriptionsTotal}</span>
          <span className="text-[30px] font-bold leading-tight tracking-[-0.6px] tabular-nums">
            {money(totals.monthly, baseCurrency, language)}
            <span className="text-[16px] font-semibold text-muted">/{t.subscriptionMonth}</span>
          </span>
          <span className="text-[14px] text-muted">{fill(t.subscriptionsPerYear, { amount: money(totals.yearly, baseCurrency, language) })}</span>
        </section>
      )}

      {active.length > 0 ? (
        <section className="paper-tile px-4 py-1">
          <ul>{active.map((item, i) => row(item, i, active, 'active'))}</ul>
        </section>
      ) : (
        <section className="paper-tile flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-chip text-muted">
            <Repeat size={20} aria-hidden="true" />
          </span>
          <p className="text-[14px] text-muted">{t.subscriptionsEmpty}</p>
        </section>
      )}

      {stopped.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-faint">{t.subscriptionsStoppedTitle}</h2>
          <div className="paper-tile px-4 py-1">
            <ul>{stopped.map((item, i) => row(item, i, stopped, 'stopped'))}</ul>
          </div>
        </section>
      )}

      {hidden.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowHidden(value => !value)}
            aria-expanded={showHidden}
            className="flex h-10 items-center gap-2 self-start rounded-full px-3 text-[13px] font-semibold text-muted"
          >
            <EyeOff size={15} aria-hidden="true" />
            {fill(t.subscriptionsHidden, { count: hidden.length })}
          </button>
          {showHidden && (
            <div className="paper-tile px-4 py-1">
              <ul>{hidden.map((item, i) => row(item, i, hidden, 'hidden'))}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
