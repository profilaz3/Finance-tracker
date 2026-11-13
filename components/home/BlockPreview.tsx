import React from 'react';
import clsx from 'clsx';
import type { HomeBlock } from '../../types';
import { BlockContent } from './blocks';
import type { HomeActions, HomeData } from './useHomeData';

/** Width a block is laid out at before scaling: one or two phone columns. */
export const previewWidth = (block: HomeBlock): number => (block.size === 's' ? 170 : 348);

const NOOP_ACTIONS: HomeActions = {
  openBudgets: () => {},
  openActivity: () => {},
  openInsights: () => {},
  openEvents: () => {},
  openEvent: () => {},
  createEvent: () => {},
  openPeople: () => {},
  openPerson: () => {},
  openWallets: () => {},
  openTransaction: () => {},
  openRecurring: () => {},
  useTemplate: () => {},
  addEntry: () => {},
};

/** A non-interactive, scaled copy of a block for the gallery and settings sheets. */
export const BlockPreview: React.FC<{ block: HomeBlock; data: HomeData; scale: number; className?: string }> = ({ block, data, scale, className }) => (
  <div
    aria-hidden="true"
    inert
    className={clsx('pointer-events-none select-none', className)}
    style={{ zoom: scale, width: previewWidth(block) }}
  >
    <div className={clsx('flex', block.size === 's' && 'h-[172px]')}>
      <BlockContent block={block} data={data} actions={NOOP_ACTIONS} />
    </div>
  </div>
);
