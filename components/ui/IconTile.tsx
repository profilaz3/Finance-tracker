import React from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { monogram, stableColor } from '../../utils/stableColor';

/**
 * The one icon tile of the app: a softly tinted rounded square (or circle) with a duotone feel.
 * Tint and ink are mixed with the paper tokens, so loud colours stay legible on every theme,
 * light and dark, and custom accents. Sizes: 32 (dense lists), 40 (rows), 48 (headers).
 */
export interface IconTileProps {
  icon?: LucideIcon;
  /** Any CSS colour; defaults to the accent. */
  color?: string;
  size?: number;
  shape?: 'square' | 'circle';
  /** `soft` tints the tile (default); `solid` fills it with the colour and draws white ink. */
  tone?: 'soft' | 'solid';
  /** Small mark in the bottom right corner, for example a currency flag. */
  badge?: React.ReactNode;
  /** Replaces the icon, for example a monogram. */
  children?: React.ReactNode;
  className?: string;
  /** When set the tile is announced; otherwise it is decorative. */
  label?: string;
}

export const tileRadius = (size: number): number => Math.round(size * 0.34);

export const IconTile: React.FC<IconTileProps> = ({
  icon: Icon,
  color = 'rgb(var(--accent-rgb))',
  size = 40,
  shape = 'square',
  tone = 'soft',
  badge,
  children,
  className,
  label,
}) => {
  const solid = tone === 'solid';
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={clsx('relative flex shrink-0 items-center justify-center', className)}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? '50%' : tileRadius(size),
        background: solid
          ? `linear-gradient(150deg, color-mix(in oklab, ${color} 88%, white), ${color})`
          : `linear-gradient(150deg, color-mix(in oklab, ${color} 22%, var(--paper-tile)), color-mix(in oklab, ${color} 11%, var(--paper-tile)))`,
        boxShadow: solid ? undefined : `inset 0 0 0 1px color-mix(in oklab, ${color} 14%, transparent)`,
        color: solid ? '#FFFFFF' : `color-mix(in oklab, ${color} 74%, var(--paper-text))`,
      }}
    >
      {children ?? (Icon ? <Icon size={Math.round(size * 0.5)} strokeWidth={size <= 32 ? 2.1 : 1.9} aria-hidden="true" /> : null)}
      {badge && (
        <span className="absolute -bottom-1 -right-1 flex rounded-full shadow-[0_0_0_2px_var(--paper-tile)]">{badge}</span>
      )}
    </span>
  );
};

/** Letters on a tile with a stable colour from the name: merchants without a glyph, people without a photo. */
export const MonogramTile: React.FC<{
  name: string;
  color?: string;
  size?: number;
  shape?: 'square' | 'circle';
  tone?: 'soft' | 'solid';
  badge?: React.ReactNode;
  className?: string;
}> = ({ name, color, size = 40, shape = 'square', tone = 'soft', badge, className }) => (
  <IconTile color={color ?? stableColor(name)} size={size} shape={shape} tone={tone} badge={badge} className={className}>
    <span className="font-bold leading-none tracking-tight" style={{ fontSize: Math.max(10, Math.round(size * (size < 36 ? 0.36 : 0.34))) }}>
      {monogram(name)}
    </span>
  </IconTile>
);
