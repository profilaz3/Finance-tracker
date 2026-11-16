import React from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { IconTile } from './IconTile';

/**
 * Small shared building blocks for the paper design. Theme tokens only, so they follow every
 * theme, mode and custom accent.
 */

export type DeltaTone = 'pos' | 'neg' | 'neutral';

/**
 * Tone for a change: rising spending is bad, rising income is good.
 * Changes under `epsilon` (same units as `change`) count as flat.
 */
export const deltaTone = (change: number, goodWhen: 'up' | 'down' = 'up', epsilon = 0.0005): DeltaTone => {
  if (!Number.isFinite(change) || Math.abs(change) < epsilon) return 'neutral';
  return (change > 0) === (goodWhen === 'up') ? 'pos' : 'neg';
};

const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  pos: 'text-pos bg-[color-mix(in_oklab,var(--paper-pos)_14%,transparent)]',
  neg: 'text-neg bg-[color-mix(in_oklab,var(--paper-neg)_14%,transparent)]',
  neutral: 'text-muted bg-chip',
};

/**
 * Pill with an arrow and a pre-formatted change ("2.4%", "RSD 1,200").
 * `direction` picks the arrow, `tone` the colour (see `deltaTone`).
 */
export const DeltaPill: React.FC<{
  direction: 'up' | 'down' | 'flat';
  tone?: DeltaTone;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}> = ({ direction, tone = 'neutral', children, size = 'sm', className, label }) => {
  const arrow = size === 'sm' ? 9 : 11;
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold tabular-nums leading-none',
        size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-[12px]',
        DELTA_TONE_CLASS[tone],
        className,
      )}
      aria-label={label}
    >
      <svg width={arrow} height={arrow} viewBox="0 0 10 10" aria-hidden="true" className={clsx(direction === 'down' && 'rotate-180')}>
        {direction === 'flat' ? (
          <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M5 8.5V1.8M1.9 4.6 5 1.5l3.1 3.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        )}
      </svg>
      {children}
    </span>
  );
};

/** Title row for a card or list section, with an optional link-style action or a muted right slot. */
export const SectionHeader: React.FC<{
  title: React.ReactNode;
  icon?: LucideIcon;
  right?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
  as?: 'h2' | 'h3';
}> = ({ title, icon: Icon, right, action, className, as: Heading = 'h3' }) => (
  <div className={clsx('mb-3 flex items-center justify-between gap-3', className)}>
    <Heading className="flex min-w-0 items-center gap-2 truncate text-[17px] font-bold tracking-[-0.3px]">
      {Icon && <Icon size={18} className="shrink-0 text-accent" aria-hidden="true" />}
      <span className="truncate">{title}</span>
    </Heading>
    {action ? (
      <button type="button" onClick={action.onClick} className="shrink-0 text-sm font-semibold text-accent">
        {action.label}
      </button>
    ) : (
      right != null && <span className="shrink-0 truncate text-[13px] text-muted">{right}</span>
    )}
  </div>
);

/** Figure tile: label, big value, optional sub line, delta and icon. Use inside a grid. */
export const StatTile: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
  icon?: LucideIcon;
  color?: string;
  tone?: 'default' | 'pos' | 'neg';
  className?: string;
}> = ({ label, value, sub, delta, icon, color, tone = 'default', className }) => (
  <div className={clsx('flex min-w-0 flex-col gap-1 rounded-[18px] bg-chip p-3 [container-type:inline-size]', className)}>
    <span className="flex min-w-0 items-center gap-2">
      {icon && <IconTile icon={icon} color={color} size={28} />}
      <span className="truncate text-[12px] font-semibold text-muted">{label}</span>
    </span>
    <span className={clsx('truncate text-[20px] font-bold tabular-nums tracking-[-0.4px]', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{value}</span>
    {(sub != null || delta != null) && (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {delta}
        {sub != null && <span className="truncate text-[12px] text-muted">{sub}</span>}
      </span>
    )}
  </div>
);
