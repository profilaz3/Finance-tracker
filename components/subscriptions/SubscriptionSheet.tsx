import React, { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Eye, EyeOff, Pencil, ReceiptText, Repeat, TrendingUp, type LucideIcon } from 'lucide-react';
import type { AppState, HomeHeaderTone } from '../../types';
import { TRANSLATIONS } from '../../constants';
import type { DetectedSubscription } from '../../domain/subscriptions';
import { nextCharge } from '../../domain/subscriptionSchedule';
import { SUBSCRIPTION_NAME_MAX, type StoredMerchantMeta } from '../../services/subscriptionStore';
import { formatDate, formatPercent } from '../../utils/locale';
import { GlassSheet } from '../ui/GlassSheet';
import { fill } from '../home/parts';
import { plainAmount } from '../stats/analyticsStrings';
import { CADENCE_KEYS, SubscriptionGlyph, chargeText } from './subscriptionParts';
import type { SubscriptionStrings } from './subscriptionStrings';

const ActionRow: React.FC<{
  icon: LucideIcon;
  title: string;
  hint?: string;
  onClick: () => void;
  trailing?: 'chevron' | 'open' | 'closed';
  accent?: boolean;
  expanded?: boolean;
}> = ({ icon: Icon, title, hint, onClick, trailing, accent, expanded }) => (
  <button type="button" onClick={onClick} aria-expanded={expanded} className="flex min-h-[64px] w-full items-center gap-3.5 py-2.5 text-left">
    <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', accent ? 'bg-accent-soft text-accent' : 'bg-chip text-on-surface')} aria-hidden="true">
      <Icon size={19} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[16px] font-semibold">{title}</span>
      {hint && <span className="block text-[13px] leading-snug text-muted">{hint}</span>}
    </span>
    {trailing === 'chevron' && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-faint" />}
    {(trailing === 'open' || trailing === 'closed') && (
      <ChevronDown size={18} aria-hidden="true" className={clsx('shrink-0 text-faint transition-transform', trailing === 'open' && 'rotate-180')} />
    )}
  </button>
);

interface SubscriptionSheetProps {
  open: boolean;
  item: DetectedSubscription | null;
  name: string;
  /** The name before the user renamed it, when they did. */
  detectedName: string | null;
  hidden: boolean;
  canTrack: boolean;
  meta: Record<string, StoredMerchantMeta>;
  state: AppState;
  tone: HomeHeaderTone;
  locale: string;
  onClose: () => void;
  onTrack: (item: DetectedSubscription) => void;
  onRename: (item: DetectedSubscription, name: string) => void;
  onDismiss: (item: DetectedSubscription) => void;
  onRestore: (item: DetectedSubscription) => void;
  s: SubscriptionStrings;
}

/** One subscription: what it costs and when it charges next, with track, rename, past payments and hide. */
export const SubscriptionSheet: React.FC<SubscriptionSheetProps> = ({
  open, item, name, detectedName, hidden, canTrack, meta, state, tone, locale, onClose, onTrack, onRename, onDismiss, onRestore, s,
}) => {
  const { language, baseCurrency } = state;
  const t = TRANSLATIONS[language];
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [showPayments, setShowPayments] = useState(false);

  // Each subscription opens with its sections folded.
  const openId = open ? item?.id ?? null : null;
  const [shownId, setShownId] = useState<string | null>(null);
  if (openId !== shownId) {
    setShownId(openId);
    setRenaming(false);
    setShowPayments(false);
    setDraft(name);
  }

  const active = item?.status === 'active' && !hidden;
  const cadence = item ? t[CADENCE_KEYS[item.cadence]] : '';
  const wallet = item ? state.accounts.find(account => account.id === item.accountId)?.name : undefined;
  // Keep "Fri 20 Nov" on one line when the subtitle wraps.
  const day = (date: Date | string, options: Intl.DateTimeFormatOptions) => formatDate(date, options, language).replace(/ /g, '\u00a0');
  const sub = !item
    ? ''
    : active
      ? fill(wallet ? s.nextFrom : s.next, { cadence, date: day(nextCharge(item), { weekday: 'short', day: 'numeric', month: 'short' }), wallet: wallet ?? '' })
      : fill(s.last, { cadence, date: day(item.lastDate, { day: 'numeric', month: 'short' }) });
  const increase = active ? item?.priceIncrease : undefined;

  const byId = new Map(state.transactions.map(transaction => [transaction.id, transaction] as const));
  const payments = item
    ? item.transactionIds.map(id => byId.get(id)).filter((entry): entry is NonNullable<typeof entry> => !!entry).reverse().slice(0, 12)
    : [];

  const saveName = (event: React.FormEvent) => {
    event.preventDefault();
    if (!item) return;
    onRename(item, draft);
    setRenaming(false);
  };

  return (
    <GlassSheet
      isOpen={open && !!item}
      onClose={onClose}
      title={name || s.details}
      hideTitle
      closeLabel={t.close}
      hero={item ? {
        tone,
        content: (
          <>
            <div className="flex items-center gap-3.5 pr-12">
              <SubscriptionGlyph item={item} name={name} meta={meta} size={56} className="ring-2 ring-white/25" />
              <div className="min-w-0">
                <p className="truncate text-[21px] font-bold tracking-[-0.02em]">{name}</p>
                <p className="text-[14px] leading-snug text-white/75">{sub}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="whitespace-nowrap text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums">
                {plainAmount(item.amount, item.currency, locale)}
                <span className="ml-1 text-[15px] font-semibold tracking-normal text-white/60">{item.currency}</span>
              </p>
              {increase && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[13px] font-semibold">
                  <TrendingUp size={13} aria-hidden="true" />
                  {fill(s.upFrom, {
                    pct: formatPercent(increase.pct * 100, 0, language),
                    from: plainAmount(increase.from, item.currency, locale),
                  })}
                </span>
              )}
            </div>
          </>
        ),
      } : undefined}
    >
      {item && (
        <div className="flex flex-col divide-y divide-[var(--paper-line)]">
          {canTrack && active && (
            <ActionRow icon={Repeat} title={t.trackAsRecurring} hint={s.trackHint} accent trailing="chevron" onClick={() => onTrack(item)} />
          )}

          <div>
            <ActionRow
              icon={Pencil}
              title={s.rename}
              hint={fill(s.shownAs, { name })}
              trailing={renaming ? 'open' : 'closed'}
              expanded={renaming}
              onClick={() => {
                setDraft(name);
                setRenaming(value => !value);
              }}
            />
            {renaming && (
              <form onSubmit={saveName} className="flex flex-col gap-2 pb-3 pl-[58px]">
                <label htmlFor="subscription-name" className="sr-only">{s.nameLabel}</label>
                <div className="flex gap-2">
                  <input
                    id="subscription-name"
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    maxLength={SUBSCRIPTION_NAME_MAX}
                    autoComplete="off"
                    autoFocus
                    className="paper-field h-11 min-w-0 flex-1 rounded-[14px] px-3.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button type="submit" className="h-11 shrink-0 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent">{t.save}</button>
                </div>
                {detectedName && (
                  <button
                    type="button"
                    onClick={() => {
                      onRename(item, '');
                      setRenaming(false);
                    }}
                    className="h-10 self-start rounded-full px-1 text-[14px] font-semibold text-accent"
                  >
                    {s.originalName}
                  </button>
                )}
              </form>
            )}
          </div>

          {payments.length > 0 && (
            <div>
              <ActionRow
                icon={ReceiptText}
                title={showPayments ? s.hidePayments : s.pastPayments}
                trailing={showPayments ? 'open' : 'closed'}
                expanded={showPayments}
                onClick={() => setShowPayments(value => !value)}
              />
              {showPayments && (
                <ul className="pb-3 pl-[58px]">
                  {payments.map(payment => (
                    <li key={payment.id} className="flex items-center justify-between gap-3 py-1.5 text-[14.5px]">
                      <span className="text-muted">{formatDate(payment.date, { day: 'numeric', month: 'short', year: 'numeric' }, language)}</span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">
                        −{chargeText(payment.amount, payment.currency, baseCurrency, language, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hidden ? (
            <ActionRow icon={Eye} title={t.subscriptionsRestore} onClick={() => onRestore(item)} />
          ) : (
            <ActionRow icon={EyeOff} title={t.notASubscription} hint={s.hideHint} onClick={() => onDismiss(item)} />
          )}
        </div>
      )}
    </GlassSheet>
  );
};
