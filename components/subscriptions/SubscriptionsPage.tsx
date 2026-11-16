import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CalendarDays } from 'lucide-react';
import type { AppState, Currency, HomeHeaderTone, RecurringTransaction } from '../../types';
import { TRANSLATIONS } from '../../constants';
import {
  CADENCE_FREQUENCY,
  detectSubscriptions,
  recurringFromSubscription,
  subscriptionTotals,
  type DetectedSubscription,
} from '../../domain/subscriptions';
import { nextCharge, upcomingCharges } from '../../domain/subscriptionSchedule';
import { convertCurrency } from '../../utils/currencyUtils';
import { formatDate, formatPercent, getIntlLocale } from '../../utils/locale';
import { fetchMerchantMeta } from '../../services/cleanupService';
import {
  dismissSubscription,
  readDismissedSubscriptions,
  readMerchantMeta,
  readSubscriptionNames,
  renameSubscription,
  restoreDismissedSubscription,
  type StoredMerchantMeta,
} from '../../services/subscriptionStore';
import { useBackLayer } from '../../hooks/useBackLayer';
import { Illustration } from '../ui/Illustration';
import { fill } from '../home/parts';
import { CADENCE_KEYS, SubscriptionGlyph, chargeText, prettyLabel, subscriptionName } from './subscriptionParts';
import { SubscriptionsHero } from './SubscriptionsHero';
import { SubscriptionSheet } from './SubscriptionSheet';
import { SUBSCRIPTION_STRINGS } from './subscriptionStrings';

type ToastFn = (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;

interface SubscriptionsPageProps {
  state: AppState;
  tone: HomeHeaderTone;
  onBack: () => void;
  onAddRecurring?: (recurring: RecurringTransaction) => void;
  onToast?: ToastFn;
  onOpenCalendar?: () => void;
}

/**
 * Regular charges found in the history: what they cost a month and a year, when they charge over
 * the next 30 days, and a details sheet to track one as recurring, rename it or hide it.
 */
export const SubscriptionsPage: React.FC<SubscriptionsPageProps> = ({ state, tone, onBack, onAddRecurring, onToast, onOpenCalendar }) => {
  const { language, baseCurrency } = state;
  const t = TRANSLATIONS[language];
  const s = SUBSCRIPTION_STRINGS[language];
  const locale = getIntlLocale(language);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissedSubscriptions());
  const [meta, setMeta] = useState<Record<string, StoredMerchantMeta>>(() => readMerchantMeta());
  const [names, setNames] = useState<Record<string, string>>(() => readSubscriptionNames());
  const [showHidden, setShowHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The sheet keeps showing the last subscription while it closes (tracking one drops it from the list).
  const [lastSelected, setLastSelected] = useState<DetectedSubscription | null>(null);
  const now = useMemo(() => new Date(), []);

  const all = useMemo(
    () => detectSubscriptions(state.transactions, state.recurringTransactions ?? []),
    [state.transactions, state.recurringTransactions],
  );
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  const items = useMemo(() => all.filter(item => !dismissedSet.has(item.id)), [all, dismissedSet]);
  const hidden = all.filter(item => dismissedSet.has(item.id));
  const active = useMemo(
    () => items
      .filter(item => item.status === 'active')
      .map(item => ({ item, next: nextCharge(item, now) }))
      .sort((a, b) => a.next.getTime() - b.next.getTime()),
    [items, now],
  );
  const stopped = items.filter(item => item.status === 'stopped');
  const convert = (amount: number, from: Currency) => convertCurrency(amount, from, baseCurrency, state.rates.rates);
  const totals = subscriptionTotals(items, convert);
  const charges = useMemo(() => upcomingCharges(active.map(entry => entry.item), now), [active, now]);

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

  const nameOf = (item: DetectedSubscription) => subscriptionName(item, names, meta);
  const open = (item: DetectedSubscription) => {
    setLastSelected(item);
    setSelectedId(item.id);
  };
  const close = () => setSelectedId(null);
  const selected = lastSelected ? all.find(item => item.id === lastSelected.id) ?? lastSelected : null;
  useBackLayer('subscription-sheet', selectedId !== null, close);

  const track = (item: DetectedSubscription) => {
    if (!onAddRecurring) return;
    const rule = recurringFromSubscription(item, nameOf(item), () => crypto.randomUUID());
    if (!rule) return;
    close();
    onAddRecurring(rule);
  };

  const dismiss = (item: DetectedSubscription) => {
    close();
    setDismissed(dismissSubscription(item.id));
    onToast?.(fill(t.subscriptionDismissed, { name: nameOf(item) }), 'info', {
      label: t.undo,
      onClick: () => setDismissed(restoreDismissedSubscription(item.id)),
    });
  };

  const restore = (item: DetectedSubscription) => {
    close();
    setDismissed(restoreDismissedSubscription(item.id));
  };

  const rename = (item: DetectedSubscription, name: string) => setNames(renameSubscription(item.key, name));

  const row = (item: DetectedSubscription, mode: 'active' | 'stopped' | 'hidden', next?: Date) => {
    const name = nameOf(item);
    const increase = mode === 'active' ? item.priceIncrease : undefined;
    const pct = increase ? formatPercent(increase.pct * 100, 0, language) : '';
    const cadence = t[CADENCE_KEYS[item.cadence]];
    const sub = mode === 'active' && next
      ? fill(s.rowSub, { cadence, date: formatDate(next, { weekday: 'short', day: 'numeric', month: 'short' }, language) })
      : fill(s.last, { cadence, date: formatDate(item.lastDate, { day: 'numeric', month: 'short' }, language) });
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => open(item)}
          className="flex min-h-[68px] w-full items-center gap-3 py-3 text-left"
        >
          <SubscriptionGlyph item={item} name={name} meta={meta} size={44} className={clsx(mode !== 'active' && 'opacity-60')} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={clsx('min-w-0 truncate text-[16px] font-semibold', mode !== 'active' && 'text-muted')}>{name}</span>
              {increase && (
                <span className="flex h-5 shrink-0 items-center rounded-full bg-warning/12 px-1.5 text-[11.5px] font-bold tabular-nums text-warning">
                  <span aria-hidden="true">+{pct}</span>
                  <span className="sr-only">{fill(s.priceUp, { pct })}</span>
                </span>
              )}
            </span>
            <span className="block truncate text-[13.5px] text-muted">{sub}</span>
          </span>
          <span className={clsx('shrink-0 whitespace-nowrap text-[16px] font-semibold tabular-nums', mode !== 'active' && 'text-muted')}>
            −{chargeText(item.amount, item.currency, baseCurrency, language, locale)}
          </span>
        </button>
      </li>
    );
  };

  const list = (rows: React.ReactNode[]) => (
    <ul className="paper-tile divide-y divide-[var(--paper-line)] px-4">{rows}</ul>
  );

  return (
    <div className="mx-auto max-w-[920px] pb-28">
      <SubscriptionsHero
        tone={tone}
        title={t.subscriptions}
        backLabel={t.back}
        onBack={onBack}
        totals={totals}
        charges={charges}
        convert={convert}
        nameOf={charge => nameOf(charge.item)}
        meta={meta}
        hiddenCount={hidden.length}
        showHidden={showHidden}
        onToggleHidden={() => setShowHidden(value => !value)}
        intro={t.subscriptionsIntro}
        currency={baseCurrency}
        language={language}
        locale={locale}
        now={now}
        s={s}
      />

      <div className="screen-sheet flex flex-col gap-5">
        {active.length > 0 ? (
          <section className="flex flex-col gap-2.5" aria-labelledby="subscriptions-next">
            <div className="flex min-h-[40px] items-center justify-between gap-3 px-1">
              <h2 id="subscriptions-next" className="text-[17px] font-semibold tracking-[-0.01em]">{s.nextCharges}</h2>
              {onOpenCalendar && (
                <button
                  type="button"
                  onClick={onOpenCalendar}
                  className="-mr-2 flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-accent"
                >
                  <CalendarDays size={15} aria-hidden="true" />
                  {s.calendar}
                </button>
              )}
            </div>
            {list(active.map(entry => row(entry.item, 'active', entry.next)))}
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
          <section className="flex flex-col gap-2.5" aria-labelledby="subscriptions-stopped">
            <h2 id="subscriptions-stopped" className="px-1 text-[17px] font-semibold tracking-[-0.01em]">{t.subscriptionsStoppedTitle}</h2>
            {list(stopped.map(item => row(item, 'stopped')))}
          </section>
        )}

        {showHidden && hidden.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-labelledby="subscriptions-hidden">
            <h2 id="subscriptions-hidden" className="px-1 text-[17px] font-semibold tracking-[-0.01em]">
              {fill(t.subscriptionsHidden, { count: hidden.length })}
            </h2>
            {list(hidden.map(item => row(item, 'hidden')))}
          </section>
        )}
      </div>

      <SubscriptionSheet
        open={selectedId !== null}
        item={selected}
        name={selected ? nameOf(selected) : ''}
        detectedName={selected && names[selected.key] ? meta[selected.key]?.name ?? prettyLabel(selected.label) : null}
        hidden={!!selected && dismissedSet.has(selected.id)}
        canTrack={!!onAddRecurring && !!selected && !!CADENCE_FREQUENCY[selected.cadence]}
        meta={meta}
        state={state}
        tone={tone}
        locale={locale}
        onClose={close}
        onTrack={track}
        onRename={rename}
        onDismiss={dismiss}
        onRestore={restore}
        s={s}
      />
    </div>
  );
};
