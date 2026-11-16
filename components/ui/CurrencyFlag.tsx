import React, { useId } from 'react';
import clsx from 'clsx';
import type { Currency } from '../../types';

/**
 * Small hand drawn flag marks for the app's currencies, inline SVG (no images, no network).
 * RSD: Serbian tricolour with a simplified shield. EUR: EU blue with the ring of 12 stars.
 * USD: stripes with a blue canton. Round by default; `rounded` gives a soft square.
 * Sizes 16 / 20 / 28 / 40 are the designed steps; small sizes drop fine detail.
 */
export interface CurrencyFlagProps {
  currency: Currency;
  size?: number;
  shape?: 'round' | 'rounded';
  className?: string;
  /** When set the flag is announced (for example "Euro"); otherwise it is decorative. */
  label?: string;
}

const star = (cx: number, cy: number, r: number): string => {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
};

const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6;
  return { x: 16 + 9 * Math.cos(angle), y: 16 + 9 * Math.sin(angle) };
});

const Rsd: React.FC<{ detail: boolean }> = ({ detail }) => (
  <>
    <rect width="32" height="11" fill="#C6363C" />
    <rect y="10.7" width="32" height="10.7" fill="#0C4076" />
    <rect y="21.3" width="32" height="10.7" fill="#FFFFFF" />
    {detail ? (
      <g transform="translate(7.2 8)">
        <path d="M0 2.2h7.6v6.4c0 2.6-1.9 4.3-3.8 5.2C1.9 12.9 0 11.2 0 8.6z" fill="#C6363C" stroke="#EDB92E" strokeWidth="0.9" />
        <path d="M3.8 3.6v7.6M1.4 6.6h4.8" stroke="#FFFFFF" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M1.2 0.4h5.2l-0.6 1.6H1.8z" fill="#EDB92E" />
      </g>
    ) : (
      <path d="M7.5 10h6v5.5c0 2-1.5 3.3-3 4-1.5-0.7-3-2-3-4z" fill="#C6363C" stroke="#EDB92E" strokeWidth="0.9" />
    )}
  </>
);

const Eur: React.FC<{ detail: boolean }> = ({ detail }) => (
  <>
    <rect width="32" height="32" fill="#003399" />
    {EU_STARS.map(({ x, y }, i) =>
      detail ? <polygon key={i} points={star(x, y, 1.75)} fill="#FFCC00" /> : <circle key={i} cx={x} cy={y} r="1.35" fill="#FFCC00" />,
    )}
  </>
);

const Usd: React.FC<{ detail: boolean }> = ({ detail }) => (
  <>
    <rect width="32" height="32" fill="#FFFFFF" />
    {[0, 2, 4, 6, 8, 10, 12].map(i => (
      <rect key={i} y={(i * 32) / 13} width="32" height={32 / 13} fill="#B22234" />
    ))}
    <rect width="15" height={(7 * 32) / 13} fill="#3C3B6E" />
    {detail &&
      [0, 1, 2, 3].flatMap(row =>
        [0, 1, 2].map(col => <circle key={`${row}-${col}`} cx={2.6 + col * 4.6 + (row % 2) * 2.3} cy={2.5 + row * 4.1} r="0.85" fill="#FFFFFF" />),
      )}
  </>
);

const FLAGS: Record<Currency, React.FC<{ detail: boolean }>> = { RSD: Rsd, EUR: Eur, USD: Usd };

export const CurrencyFlag: React.FC<CurrencyFlagProps> = ({ currency, size = 20, shape = 'round', className, label }) => {
  const clip = useId().replace(/:/g, '');
  const Flag = FLAGS[currency];
  if (!Flag) return null;
  const detail = size >= 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={clsx('block shrink-0', className)}
    >
      <defs>
        <clipPath id={`flag-${clip}`}>
          {shape === 'round' ? <circle cx="16" cy="16" r="16" /> : <rect width="32" height="32" rx="8" />}
        </clipPath>
      </defs>
      <g clipPath={`url(#flag-${clip})`}>
        <Flag detail={detail} />
      </g>
      {shape === 'round' ? (
        <circle cx="16" cy="16" r="15.5" fill="none" stroke="var(--paper-line)" strokeWidth="1" />
      ) : (
        <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="var(--paper-line)" strokeWidth="1" />
      )}
    </svg>
  );
};

/**
 * Two overlapping flags for a rate, "1 EUR = x RSD": base in front, quote behind on the right.
 * With `arrow`, a small arrow sits between them (converter, "EUR to RSD").
 */
/** `on` is the surface behind the pair, so the overlap ring matches it. */
export const CurrencyPair: React.FC<{ base: Currency; quote?: Currency; size?: number; arrow?: boolean; on?: 'tile' | 'chip'; className?: string }> = ({
  base,
  quote = 'RSD',
  size = 28,
  arrow = false,
  on = 'tile',
  className,
}) => (
  <span
    aria-hidden="true"
    className={clsx('inline-flex shrink-0 items-center', className)}
    style={{ '--pair-ring': on === 'chip' ? 'var(--paper-chip)' : 'var(--paper-tile)' } as React.CSSProperties}
  >
    <span className="relative z-[1] flex rounded-full shadow-[0_0_0_2px_var(--pair-ring)]">
      <CurrencyFlag currency={base} size={size} />
    </span>
    {arrow ? (
      <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 16 16" className="mx-0.5 text-faint" aria-hidden="true">
        <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : null}
    <span className="flex rounded-full shadow-[0_0_0_2px_var(--pair-ring)]" style={arrow ? undefined : { marginLeft: -Math.round(size * 0.3) }}>
      <CurrencyFlag currency={quote} size={size} />
    </span>
  </span>
);
