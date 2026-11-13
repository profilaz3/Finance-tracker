import React from 'react';
import type { Category } from '../../types';
import { iconForCategory } from '../../utils/categoryIcons';

interface CategoryGlyphProps {
  category?: Pick<Category, 'name' | 'color' | 'icon'>;
  size?: number;
  className?: string;
}

/**
 * A soft tinted tile with the category icon. The tint and ink are mixed with
 * the paper tokens, so loud category colors stay legible in light and dark.
 */
export const CategoryGlyph: React.FC<CategoryGlyphProps> = ({ category, size = 40, className }) => {
  const Icon = iconForCategory(category);
  const color = category?.color ?? 'var(--paper-muted)';
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-[14px] ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, ${color} 16%, var(--paper-tile))`,
        color: `color-mix(in oklab, ${color} 72%, var(--paper-text))`,
      }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2.1} />
    </span>
  );
};
