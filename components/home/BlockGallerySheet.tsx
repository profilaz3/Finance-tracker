import React from 'react';
import type { HomeBlockType } from '../../types';
import { BLOCK_TYPES } from '../../domain/homeLayout';
import { GlassSheet } from '../ui/GlassSheet';
import { BlockPreview } from './BlockPreview';
import type { HomeData } from './useHomeData';

interface BlockGallerySheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (type: HomeBlockType) => void;
  data: HomeData;
}

export const BlockGallerySheet: React.FC<BlockGallerySheetProps> = ({ isOpen, onClose, onAdd, data }) => {
  const { t } = data;
  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title={t.addBlock} closeLabel={t.close}>
      <p className="mb-4 text-sm text-muted">{t.addBlockHint}</p>
      <div className="grid grid-cols-2 gap-3">
        {BLOCK_TYPES.map(def => {
          const block = { id: `preview-${def.type}`, type: def.type, style: def.defaultStyle, size: def.defaultSize };
          const name = t[`block_${def.type}` as const];
          return (
            <button
              key={def.type}
              type="button"
              onClick={() => onAdd(def.type)}
              className="flex flex-col overflow-hidden rounded-[22px] bg-tile text-left shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            >
              <span className="flex h-[104px] items-start justify-center overflow-hidden bg-chip px-2 pt-2">
                <BlockPreview block={block} data={data} scale={0.44} />
              </span>
              <span className="flex flex-col gap-0.5 px-3 pb-3 pt-2.5">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold">{name}</span>
                  {def.isNew && (
                    <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-on-accent">
                      {t.newBadge}
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-[12px] leading-4 text-muted">{t[`blockDesc_${def.type}` as const]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </GlassSheet>
  );
};
