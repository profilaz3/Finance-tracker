import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Repeat, TrendingUp, EyeOff, CalendarClock } from 'lucide-react';
import { Illustration } from '../ui/Illustration';
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
import { ServiceGlyph, serviceColor } from './ServiceGlyph';
import { IconTile } from '../ui/IconTile';
import { DeltaPill } from '../ui/primitives';
import { stableColor } from '../../utils/stableColor';

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

  const colorOf = (item: DetectedSubscription) => {
    const service = meta[item.key]?.service;
    if (service) return serviceColor(service);
    return state.categories.find(entry => entry.id === item.categoryId)?.color ?? stableColor(item.key);
  };

  const row = (item: DetectedSubscription, index: number, list: DetectedSubscription[], mode: 'active' | 'stopped' | 'hidden') => {
    const name = nameOf(item);
    const category = state.categories.find(entry => entry.id === item.categoryId);
    const service = meta[item.key]?.service;
    const increase = mode === 'active' ? item.priceIncrease : undefined;
    const canTrack = mode === 'active' && Boolean(onAddRecurring) && Boolean(CADENCE_FREQUENCY[item.cadence]);
    const badge = increase ? <IconTile icon={TrendingUp} color="var(--paper-neg)" size={18} shape="circle" tone="solid" /> : undefined;
    return (
      <li key={item.id} className={clsx('flex flex-col gap-2.5 py-3.5', index < list.length - 1 && 'border-b border-hair', mode !== 'active' && 'opacity-80')}>
        <div className="flex items-center gap-3">
          {service ? <ServiceGlyph service={service} size={44} badge={badge} /> : <CategoryGlyph category={category} size={44} badge={badge} />}
          <div className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-[16px] font-semibold">{name}</span>
              <span className="flex h-5 flex-none items-center rounded-full bg-chip px-2 text-[11px] font-semibold text-muted">
                {t[CADENCE_KEYS[item.cadence]]}
              </span>
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-muted">
              <CalendarClock size={13} className="flex-none" aria-hidden="true" />
              <span className="truncate">
                {mode === 'active'
                  ? fill(t.subscriptionNext, { date: formatShortDate(item.nextDate, language) })
                  : fill(t.subscriptionLast, { date: formatShortDate(item.lastDate, language) })}
              </span>
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

        {increase && (
          <div className="ml-[56px] flex flex-wrap items-center gap-x-2 gap-y-1">
            <DeltaPill direction="up" tone="neg" size="md">{formatPercent(increase.pct * 100, 0, language)}</DeltaPill>
            <span className="min-w-0 text-[12px] text-muted">
              {fill(t.subscriptionPriceWas, { from: money(increase.from, item.currency, language, true), to: money(increase.to, item.currency, language, true) })}
              {' · '}
              {formatDate(increase.date, { month: 'long' }, language)}
            </span>
            <span className="sr-only">
              {fill(t.subscriptionPriceUp, {
                name,
                pct: formatPercent(increase.pct * 100, 0, language),
                month: formatDate(increase.date, { month: 'long' }, language),
              })}
            </span>
          </div>
        )}

        <div className="flex min-w-0 items-center justify-between gap-1">
          {canTrack && (
            <button
              type="button"
              onClick={() => track(item)}
              className="flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent"
            >
              <Repeat size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{t.trackAsRecurring}</span>
            </button>
          )}
          {mode === 'hidden' ? (
            <button type="button" onClick={() => restore(item)} className="h-10 min-w-0 truncate rounded-full bg-chip px-3.5 text-[13px] font-semibold">
              {t.subscriptionsRestore}
            </button>
          ) : (
            <button type="button" onClick={() => dismiss(item)} className="h-10 min-w-0 truncate rounded-full px-2 text-[12.5px] font-semibold text-muted">
              {t.notASubscription}
            </button>
          )}
        </div>
      </li>
    );
  };

  // Share of the monthly total per active subscription, largest first.
  const shares = (() => {
    const entries = active.map(item => ({
      id: item.id,
      name: nameOf(item),
      color: colorOf(item),
      monthly: convertCurrency(item.monthlyCost, item.currency, baseCurrency, state.rates.rates),
    }));
    const sum = entries.reduce((total, entry) => total + entry.monthly, 0);
    if (sum <= 0) return [];
    return entries
      .sort((a, b) => b.monthly - a.monthly)
      .map(entry => ({ ...entry, pct: (entry.monthly / sum) * 100 }));
  })();

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-[15px] text-muted">{t.subscriptionsIntro}</p>

      {active.length > 0 && (
        <section className="paper-tile flex flex-col gap-3 p-4" aria-label={t.subscriptionsTotal}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-faint">{t.subscriptionsTotal}</span>
            <span className="flex h-6 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[12px] font-semibold text-accent">
              <Repeat size={12} aria-hidden="true" />
              {fill(t.subscriptionsActiveCount, { count: active.length })}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-[32px] font-bold leading-tight tracking-[-0.035em] tabular-nums">
              {money(totals.monthly, baseCurrency, language)}
              <span className="text-[16px] font-semibold tracking-normal text-muted">/{t.subscriptionMonth}</span>
            </span>
            <span className="text-[14px] text-muted">{fill(t.subscriptionsPerYear, { amount: money(totals.yearly, baseCurrency, language) })}</span>
          </div>
          {shares.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
                {shares.map(share => (
                  <span key={share.id} className="h-full rounded-full" style={{ width: `${share.pct}%`, minWidth: 6, background: share.color }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {shares.slice(0, 4).map(share => (
                  <li key={share.id} className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: share.color }} aria-hidden="true" />
                    <span className="max-w-[120px] truncate">{share.name}</span>
                    <span className="tabular-nums text-faint">{formatPercent(share.pct, 0, language)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {active.length > 0 ? (
        <section className="paper-tile px-4 py-1">
          <ul>{active.map((item, i) => row(item, i, active, 'active'))}</ul>
        </section>
      ) : (
        <section className="paper-tile flex items-center gap-3 p-3 pr-4">
          <span className="h-[72px] w-[90px] shrink-0" aria-hidden="true">
            <Illustration name="subscriptions" />
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
