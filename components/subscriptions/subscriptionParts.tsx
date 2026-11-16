import React from 'react';
import type { Currency } from '../../types';
import type { DetectedSubscription, SubscriptionCadence } from '../../domain/subscriptions';
import type { StoredMerchantMeta } from '../../services/subscriptionStore';
import { stableColor } from '../../utils/stableColor';
import type { AppLanguage } from '../../utils/locale';
import { IconTile } from '../ui/IconTile';
import { money } from '../home/parts';
import { plainAmount } from '../stats/analyticsStrings';
import { ServiceGlyph, serviceColor } from './ServiceGlyph';

export const CADENCE_KEYS: Record<SubscriptionCadence, 'subCadenceWeekly' | 'subCadenceBiweekly' | 'subCadenceMonthly' | 'subCadenceQuarterly' | 'subCadenceYearly'> = {
  weekly: 'subCadenceWeekly',
  biweekly: 'subCadenceBiweekly',
  monthly: 'subCadenceMonthly',
  quarterly: 'subCadenceQuarterly',
  yearly: 'subCadenceYearly',
};

/** "NETFLIX.COM 8821" reads better as "Netflix.com" until the AI name arrives. */
export const prettyLabel = (label: string): string => {
  const trimmed =
    label
      // Trailing reference codes: "8821", "P2A9C", "#123".
      .replace(/(\s+[#*]?(?=[\p{L}\d]*\d)[\p{L}\d*/-]+)+$/u, '')
      // Legal suffix and whatever follows it (usually the city): "FITPASS DOO BEOGRAD" -> "FITPASS".
      .replace(/\s+(d\.?\s?o\.?\s?o\.?|a\.?d\.?|szr|str|pr)(\s.*)?$/i, '')
      .trim() || label;
  return trimmed === trimmed.toUpperCase() ? trimmed.toLowerCase().replace(/(^|\s)\p{L}/gu, ch => ch.toUpperCase()) : trimmed;
};

/** The name to show: the user's own, else the AI's, else the tidied statement text. */
export const subscriptionName = (
  item: DetectedSubscription,
  names: Record<string, string>,
  meta: Record<string, StoredMerchantMeta>,
): string => names[item.key] ?? meta[item.key]?.name ?? prettyLabel(item.label);

/** A charge as the lists show it: whole amounts in the home currency, with the currency otherwise. */
export const chargeText = (amount: number, currency: Currency, base: Currency, language: AppLanguage, locale: string): string =>
  currency === base ? plainAmount(amount, currency, locale) : money(amount, currency, language, true);

/** The service icon when the AI knows the kind of service, else the first letter on a stable colour. */
export const SubscriptionGlyph: React.FC<{
  item: DetectedSubscription;
  name: string;
  meta: Record<string, StoredMerchantMeta>;
  size?: number;
  className?: string;
}> = ({ item, name, meta, size = 44, className }) => {
  const service = meta[item.key]?.service;
  if (service && service !== 'other') {
    return <ServiceGlyph service={service} size={size} shape="circle" tone="solid" className={className} />;
  }
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <IconTile color={service ? serviceColor(service) : stableColor(item.key)} size={size} shape="circle" tone="solid" className={className}>
      <span className="font-bold leading-none" style={{ fontSize: Math.round(size * 0.42) }}>{letter}</span>
    </IconTile>
  );
};
