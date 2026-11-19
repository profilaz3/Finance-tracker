import React from 'react';
import clsx from 'clsx';
import type { Currency } from '../../types';
import { formatMoney, formatNumber, formatSummaryNumber, getIntlLocale } from '../../utils/locale';
import { stableColor } from '../../utils/stableColor';
import type { AppLanguage } from '../../utils/locale';

/** Whole units for summaries; cents only when the amount is small. */
export const money = (amount: number, currency: Currency, language: AppLanguage, precise = false): string => {
  const digits = precise || (Math.abs(amount) < 100 && currency !== 'RSD') ? 2 : 0;
  return formatMoney(amount, currency, language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

/** A summary figure keeps significant cents and puts the unit after the digits in both languages. */
export const SummaryAmount: React.FC<{
  value: number;
  currency: Currency;
  language: AppLanguage;
  showUnit?: boolean;
  sign?: string;
  fitSize?: number;
}> = ({ value, currency, language, showUnit = true, sign = '', fitSize }) => {
  const number = sign + formatSummaryNumber(value, currency, language);
  return (
    <span className="whitespace-nowrap tabular-nums" style={fitSize ? { fontSize: fitFont(fitSize, number + (showUnit ? ' ' + currency : '')) } : undefined}>
      {number}{showUnit && <span className="text-[0.76em] font-medium opacity-75"> {currency}</span>}
    </span>
  );
};

/** Short form for tight spots: 247.1K, 1.2M. Falls back to `money` below 100,000 unless `always`. */
export const compactMoney = (amount: number, currency: Currency, language: AppLanguage, always = false): string => {
  if (!always && Math.abs(amount) < 100_000) return money(amount, currency, language);
  try {
    return new Intl.NumberFormat(getIntlLocale(language), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: Math.abs(amount) < 1_000_000 ? 0 : 1,
    }).format(amount);
  } catch {
    return money(amount, currency, language);
  }
};

/** One format for a row of figures: all compact when any of them needs it, otherwise all in full. */
export const rowMoney = (amounts: number[], currency: Currency, language: AppLanguage): string[] => {
  const compact = amounts.some(amount => Math.abs(amount) >= 100_000);
  return amounts.map(amount => compact
    ? formatNumber(amount, { notation: 'compact', maximumFractionDigits: Math.abs(amount) < 1_000_000 ? 0 : 1 }, language)
    : formatSummaryNumber(amount, currency, language));
};

export const signedMoney = (amount: number, currency: Currency, language: AppLanguage, precise = false): string =>
  `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${money(Math.abs(amount), currency, language, precise)}`;

export const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

export const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

export const BlockHead: React.FC<{ title: string; right?: React.ReactNode; className?: string }> = ({ title, right, className }) => (
  <div className={clsx('mb-3 flex items-baseline justify-between gap-3', className)}>
    <h3 className="truncate text-[17px] font-bold tracking-[-0.3px]">{title}</h3>
    {right != null && <span className="shrink-0 truncate text-[13px] text-muted">{right}</span>}
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span className={clsx('text-[13px] font-semibold text-muted', className)}>{children}</span>
);

/**
 * Font size that shrinks long figures to fit the tile instead of truncating them.
 * Needs an ancestor with `container-type: inline-size`; ~0.6em per glyph in Geist bold.
 */
export const fitFont = (size: number, text: string, glyph = 0.6): string =>
  `min(${size}px, ${(100 / Math.max(1, text.length * glyph)).toFixed(2)}cqw)`;

export const Big: React.FC<{ children: React.ReactNode; size?: number; className?: string }> = ({ children, size = 30, className }) => (
  <span className={clsx('block min-w-0', className)} style={{ containerType: 'inline-size' }}>
    <span
      className="block truncate font-bold tabular-nums"
      style={{
        fontSize: typeof children === 'string' ? fitFont(size, children) : size,
        lineHeight: `${size + 4}px`,
        letterSpacing: '-0.035em',
      }}
    >
      {children}
    </span>
  </span>
);

export { Ring } from '../ui/Ring';

export const Avatar: React.FC<{ name: string; color?: string; image?: string; size?: number; ring?: boolean }> = ({ name, color, image, size = 40, ring }) => (
  <span
    aria-hidden="true"
    className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white', ring && 'shadow-[0_0_0_2.5px_var(--paper-tile)]')}
    style={{ width: size, height: size, background: color || stableColor(name), fontSize: size < 36 ? 12 : 14 }}
  >
    {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : initials(name)}
  </span>
);

export const DateChip: React.FC<{ date: Date; language: AppLanguage; size?: number }> = ({ date, language, size = 40 }) => (
  <span aria-hidden="true" className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-chip leading-none" style={{ width: size, height: size }}>
    <span className="text-[15px] font-bold">{date.getDate()}</span>
    <span className="mt-0.5 text-[10px] font-semibold uppercase text-muted">
      {date.toLocaleDateString(language === 'sr' ? 'sr-Latn-RS' : 'en-GB', { month: 'short' }).replace('.', '')}
    </span>
  </span>
);

export const ListRow: React.FC<{
  left: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  amount: React.ReactNode;
  amountClassName?: string;
  last?: boolean;
  onClick?: () => void;
}> = ({ left, title, sub, amount, amountClassName, last, onClick }) => {
  const content = (
    <>
      {left}
      <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
        <span className="truncate text-[15px] font-semibold">{title}</span>
        {sub && <span className="truncate text-[13px] text-muted">{sub}</span>}
      </span>
      <span className={clsx('shrink-0 text-right text-[15px] font-semibold tabular-nums', amountClassName)}>{amount}</span>
    </>
  );
  const className = clsx('flex h-[58px] w-full items-center gap-3', !last && 'border-b border-hair');
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="flex flex-1 items-center justify-center py-4 text-center text-[13px] text-muted">{children}</span>
);
