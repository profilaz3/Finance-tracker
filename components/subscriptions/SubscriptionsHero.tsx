import React from 'react';
import { ArrowLeft, Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import type { Currency, HomeHeaderTone } from '../../types';
import type { UpcomingCharge } from '../../domain/subscriptionSchedule';
import type { StoredMerchantMeta } from '../../services/subscriptionStore';
import { formatShortDate, type AppLanguage } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import { HeroIconButton, HeroMenu, ScreenHero } from '../ui/ScreenHero';
import { fill, fitFont } from '../home/parts';
import { plainAmount } from '../stats/analyticsStrings';
import { SubscriptionGlyph } from './subscriptionParts';
import type { SubscriptionStrings } from './subscriptionStrings';

const DAYS = 30;
const PIN = 26;
const AXIS = 26;

const plural = (count: number, language: AppLanguage, one: string, few: string | undefined, other: string) =>
  pluralText(count, language, { one, few, other });

/**
 * The next 30 days as a line: today on the left, a pin for every expected charge, its stem as
 * tall as the charge is big (in the home currency), and the first of next month marked.
 */
const ChargeTimeline: React.FC<{
  charges: UpcomingCharge[];
  convert: (amount: number, from: Currency) => number;
  nameOf: (charge: UpcomingCharge) => string;
  meta: Record<string, StoredMerchantMeta>;
  now: Date;
  language: AppLanguage;
  s: SubscriptionStrings;
}> = ({ charges, convert, nameOf, meta, now, language, s }) => {
  const sizes = charges.map(charge => convert(charge.item.amount, charge.item.currency));
  const biggest = Math.max(...sizes, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS, 12);
  const monthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12);
  const monthAt = Math.round((monthStart.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86_400_000) / DAYS;
  const at = (fraction: number) => `calc(${PIN / 2}px + (100% - ${PIN}px) * ${fraction.toFixed(4)})`;
  const label = plural(charges.length, language, s.chargesOne, 'chargesFew' in s ? s.chargesFew : undefined, s.chargesOther);
  return (
    <figure role="img" aria-label={label} className="relative mt-5 h-[124px]">
      <figcaption aria-hidden="true" className="absolute left-0 top-0 text-[12.5px] font-semibold text-white/65">{s.next30}</figcaption>
      <span aria-hidden="true" className="absolute inset-x-0 h-[1.5px] bg-white/30" style={{ bottom: AXIS }} />
      <span aria-hidden="true" className="absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-white" style={{ left: at(0), bottom: AXIS }} />
      {charges.map((charge, i) => {
        const height = 8 + 46 * (sizes[i] / biggest);
        const left = at(charge.inDays / DAYS);
        return (
          <React.Fragment key={`${charge.item.id}-${charge.date.getTime()}`}>
            <span aria-hidden="true" className="absolute w-[1.5px] -translate-x-1/2 bg-white/55" style={{ left, bottom: AXIS, height }} />
            <span aria-hidden="true" className="absolute -translate-x-1/2 rounded-full ring-2 ring-white/85" style={{ left, bottom: AXIS + height }}>
              <SubscriptionGlyph item={charge.item} name={nameOf(charge)} meta={meta} size={PIN} />
            </span>
          </React.Fragment>
        );
      })}
      <span aria-hidden="true" className="absolute bottom-0 left-0 text-[12px] font-semibold text-white/65">{s.today}</span>
      {monthAt > 0.2 && monthAt < 0.8 && (
        <span aria-hidden="true" className="absolute bottom-0 -translate-x-1/2 text-[12px] font-semibold text-white/65" style={{ left: at(monthAt) }}>
          {formatShortDate(monthStart, language)}
        </span>
      )}
      <span aria-hidden="true" className="absolute bottom-0 right-0 text-[12px] font-semibold text-white/65">{formatShortDate(end, language)}</span>
    </figure>
  );
};

interface SubscriptionsHeroProps {
  tone: HomeHeaderTone;
  title: string;
  backLabel: string;
  onBack: () => void;
  totals: { monthly: number; yearly: number; count: number };
  charges: UpcomingCharge[];
  convert: (amount: number, from: Currency) => number;
  nameOf: (charge: UpcomingCharge) => string;
  meta: Record<string, StoredMerchantMeta>;
  hiddenCount: number;
  showHidden: boolean;
  onToggleHidden: () => void;
  intro: string;
  currency: Currency;
  language: AppLanguage;
  locale: string;
  now: Date;
  s: SubscriptionStrings;
}

/** What subscriptions cost a month and a year, and when they charge over the next 30 days. */
export const SubscriptionsHero: React.FC<SubscriptionsHeroProps> = ({
  tone, title, backLabel, onBack, totals, charges, convert, nameOf, meta, hiddenCount, showHidden, onToggleHidden, intro,
  currency, language, locale, now, s,
}) => {
  const monthly = plainAmount(totals.monthly, currency, locale);
  return (
    <ScreenHero tone={tone} label={title}>
      <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
        <HeroIconButton icon={ArrowLeft} label={backLabel} onClick={onBack} />
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
        {hiddenCount > 0 ? (
          <HeroMenu
            label={s.listActions}
            icon={MoreHorizontal}
            items={[{
              icon: showHidden ? EyeOff : Eye,
              label: showHidden ? s.hideHidden : fill(s.showHidden, { count: hiddenCount }),
              onSelect: onToggleHidden,
            }]}
          />
        ) : <span className="w-11 shrink-0" aria-hidden="true" />}
      </div>

      <div className="px-4 pb-[42px] pt-3 md:px-5 md:pb-5" style={{ containerType: 'inline-size' }}>
        {totals.count > 0 ? (
          <>
            <p className="text-[14px] font-medium text-white/75">
              {plural(totals.count, language, s.costOne, 'costFew' in s ? s.costFew : undefined, s.costOther)}
            </p>
            <p
              className="whitespace-nowrap font-bold leading-[1.1] tracking-[-0.04em] tabular-nums"
              style={{ fontSize: fitFont(44, `${monthly} ${currency} ${s.aMonth}`, 0.58) }}
            >
              {monthly}
              <span className="ml-1.5 text-[0.4em] font-semibold tracking-normal text-white/60">{`${currency} ${s.aMonth}`}</span>
            </p>
            <p className="mt-0.5 text-[14px] text-white/75">{fill(s.aYear, { amount: `${plainAmount(totals.yearly, currency, locale)} ${currency}` })}</p>
            {charges.length > 0 && (
              <ChargeTimeline charges={charges} convert={convert} nameOf={nameOf} meta={meta} now={now} language={language} s={s} />
            )}
          </>
        ) : (
          <p className="max-w-[40ch] text-[15px] leading-snug text-white/80">{intro}</p>
        )}
      </div>
    </ScreenHero>
  );
};
