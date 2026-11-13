import type { HomeBlock, HomeBlockSize, HomeBlockType } from '../types';

export interface BlockStyleDef {
  key: string;
  sizes: HomeBlockSize[];
}

export interface BlockTypeDef {
  type: HomeBlockType;
  styles: BlockStyleDef[];
  /** Style and size used when the block is added from the gallery. */
  defaultStyle: string;
  defaultSize: HomeBlockSize;
  isNew?: boolean;
}

/** Styles and the sizes each one supports. Order is the order shown in pickers. */
export const BLOCK_TYPES: BlockTypeDef[] = [
  {
    type: 'budget',
    styles: [
      { key: 'ring', sizes: ['s'] },
      { key: 'bar', sizes: ['m'] },
      { key: 'categories', sizes: ['m', 'l'] },
    ],
    defaultStyle: 'categories',
    defaultSize: 'm',
    isNew: true,
  },
  {
    type: 'networth',
    styles: [
      { key: 'card', sizes: ['m', 'l'] },
      { key: 'plain', sizes: ['m'] },
      { key: 'small', sizes: ['s'] },
    ],
    defaultStyle: 'card',
    defaultSize: 'm',
  },
  {
    type: 'categories',
    styles: [
      { key: 'boxes', sizes: ['m', 'l'] },
      { key: 'bars', sizes: ['m', 'l'] },
      { key: 'donut', sizes: ['s'] },
    ],
    defaultStyle: 'boxes',
    defaultSize: 'm',
  },
  {
    type: 'daily',
    styles: [
      { key: 'bars', sizes: ['m', 'l'] },
      { key: 'calendar', sizes: ['m', 'l'] },
      { key: 'week', sizes: ['s'] },
    ],
    defaultStyle: 'bars',
    defaultSize: 'm',
  },
  {
    type: 'wallets',
    styles: [
      { key: 'cards', sizes: ['m'] },
      { key: 'list', sizes: ['m', 'l'] },
    ],
    defaultStyle: 'cards',
    defaultSize: 'm',
  },
  {
    type: 'people',
    styles: [
      { key: 'stack', sizes: ['s'] },
      { key: 'list', sizes: ['m', 'l'] },
    ],
    defaultStyle: 'stack',
    defaultSize: 's',
  },
  {
    type: 'event',
    styles: [
      { key: 'photo', sizes: ['s'] },
      { key: 'banner', sizes: ['m'] },
    ],
    defaultStyle: 'photo',
    defaultSize: 's',
  },
  {
    type: 'upcoming',
    styles: [
      { key: 'next', sizes: ['s'] },
      { key: 'list', sizes: ['m', 'l'] },
    ],
    defaultStyle: 'list',
    defaultSize: 'm',
  },
  {
    type: 'recent',
    styles: [{ key: 'list', sizes: ['m', 'l'] }],
    defaultStyle: 'list',
    defaultSize: 'm',
  },
  {
    type: 'rates',
    styles: [
      { key: 'compact', sizes: ['s'] },
      { key: 'row', sizes: ['m'] },
      { key: 'trend', sizes: ['m'] },
    ],
    defaultStyle: 'compact',
    defaultSize: 's',
  },
  {
    type: 'quickadd',
    styles: [{ key: 'chips', sizes: ['m'] }],
    defaultStyle: 'chips',
    defaultSize: 'm',
  },
];

export const BLOCK_TYPE_MAP: Record<HomeBlockType, BlockTypeDef> = Object.fromEntries(
  BLOCK_TYPES.map(def => [def.type, def]),
) as Record<HomeBlockType, BlockTypeDef>;

const blockId = (type: HomeBlockType, index: number) => `${type}-${index}`;

/** Matches the round-6 design: card, budget + today, boxes, event + people, ... */
export const DEFAULT_HOME_LAYOUT: HomeBlock[] = [
  { id: 'networth-0', type: 'networth', style: 'card', size: 'm' },
  { id: 'budget-0', type: 'budget', style: 'ring', size: 's' },
  { id: 'daily-0', type: 'daily', style: 'week', size: 's' },
  { id: 'categories-0', type: 'categories', style: 'boxes', size: 'm' },
  { id: 'event-0', type: 'event', style: 'photo', size: 's' },
  { id: 'people-0', type: 'people', style: 'stack', size: 's' },
  { id: 'wallets-0', type: 'wallets', style: 'cards', size: 'm' },
  { id: 'upcoming-0', type: 'upcoming', style: 'next', size: 's' },
  { id: 'rates-0', type: 'rates', style: 'compact', size: 's' },
  { id: 'daily-1', type: 'daily', style: 'bars', size: 'm' },
  { id: 'recent-0', type: 'recent', style: 'list', size: 'm' },
];

/** Keep a stored block valid: unknown styles fall back to the default, sizes to one the style supports. */
export function normalizeBlock(block: HomeBlock): HomeBlock | null {
  const def = BLOCK_TYPE_MAP[block.type];
  if (!def) return null;
  const style = def.styles.find(entry => entry.key === block.style) ?? def.styles.find(entry => entry.key === def.defaultStyle)!;
  const size = style.sizes.includes(block.size) ? block.size : style.sizes[0];
  return { ...block, style: style.key, size };
}

export function resolveHomeLayout(layout: HomeBlock[] | undefined): HomeBlock[] {
  if (!layout) return DEFAULT_HOME_LAYOUT;
  const seen = new Set<string>();
  return layout
    .map(normalizeBlock)
    .filter((block): block is HomeBlock => {
      if (!block || seen.has(block.id)) return false;
      seen.add(block.id);
      return true;
    });
}

export function addBlock(layout: HomeBlock[], type: HomeBlockType): { layout: HomeBlock[]; block: HomeBlock } {
  const def = BLOCK_TYPE_MAP[type];
  let index = 0;
  while (layout.some(block => block.id === blockId(type, index))) index += 1;
  const block: HomeBlock = { id: blockId(type, index), type, style: def.defaultStyle, size: def.defaultSize };
  return { layout: [...layout, block], block };
}

export const removeBlock = (layout: HomeBlock[], id: string): HomeBlock[] => layout.filter(block => block.id !== id);

export function updateBlock(layout: HomeBlock[], id: string, changes: Partial<Pick<HomeBlock, 'style' | 'size'>>): HomeBlock[] {
  return layout.map(block => {
    if (block.id !== id) return block;
    return normalizeBlock({ ...block, ...changes }) ?? block;
  });
}

/** Move the block at `from` so it ends up at index `to`. */
export function moveBlock(layout: HomeBlock[], from: number, to: number): HomeBlock[] {
  if (from === to || from < 0 || from >= layout.length) return layout;
  const target = Math.max(0, Math.min(layout.length - 1, to));
  const next = layout.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/** Sizes the chosen style supports, and the style to switch to when a size is picked that it does not. */
export function styleForSize(type: HomeBlockType, currentStyle: string, size: HomeBlockSize): string {
  const def = BLOCK_TYPE_MAP[type];
  const current = def.styles.find(entry => entry.key === currentStyle);
  if (current?.sizes.includes(size)) return current.key;
  return def.styles.find(entry => entry.sizes.includes(size))?.key ?? currentStyle;
}

export const sizesForType = (type: HomeBlockType): HomeBlockSize[] => {
  const sizes = new Set<HomeBlockSize>();
  BLOCK_TYPE_MAP[type].styles.forEach(style => style.sizes.forEach(size => sizes.add(size)));
  return (['s', 'm', 'l'] as HomeBlockSize[]).filter(size => sizes.has(size));
};
