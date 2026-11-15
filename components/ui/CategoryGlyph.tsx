import React from 'react';
import type { Category } from '../../types';
import { iconForCategory } from '../../utils/categoryIcons';
import { IconTile, type IconTileProps } from './IconTile';

interface CategoryGlyphProps {
  category?: Pick<Category, 'name' | 'color' | 'icon'>;
  size?: number;
  className?: string;
  badge?: React.ReactNode;
  shape?: IconTileProps['shape'];
  tone?: IconTileProps['tone'];
}

/** A category's icon on the shared tile, tinted with the category colour (or filled with it, `tone="solid"`). */
export const CategoryGlyph: React.FC<CategoryGlyphProps> = ({ category, size = 40, className, badge, shape, tone }) => (
  <IconTile
    icon={iconForCategory(category)}
    color={category?.color ?? 'var(--paper-muted)'}
    size={size}
    className={className}
    badge={badge}
    shape={shape}
    tone={tone}
  />
);
