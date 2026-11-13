import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Trash2 } from 'lucide-react';
import type { HomeBlock, HomeBlockSize } from '../../types';
import { BLOCK_TYPE_MAP, sizesForType, styleForSize } from '../../domain/homeLayout';
import { GlassSheet } from '../ui/GlassSheet';
import { Segmented } from '../ui/Segmented';
import { BlockPreview } from './BlockPreview';
import { fill, money } from './parts';
import type { HomeData } from './useHomeData';

interface BlockSettingsSheetProps {
  block: HomeBlock | null;
  index: number;
  count: number;
  data: HomeData;
  onClose: () => void;
  onSave: (changes: Pick<HomeBlock, 'style' | 'size'>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onOpenBudgets: () => void;
}

const SIZE_KEYS: Record<HomeBlockSize, 'sizeS' | 'sizeM' | 'sizeL'> = { s: 'sizeS', m: 'sizeM', l: 'sizeL' };

export const BlockSettingsSheet: React.FC<BlockSettingsSheetProps> = ({
  block,
  index,
  count,
  data,
  onClose,
  onSave,
  onMove,
  onRemove,
  onOpenBudgets,
}) => {
  const { t } = data;
  const [draft, setDraft] = useState<Pick<HomeBlock, 'style' | 'size'> | null>(block ? { style: block.style, size: block.size } : null);

  useEffect(() => {
    setDraft(block ? { style: block.style, size: block.size } : null);
  }, [block?.id]);

  const def = block ? BLOCK_TYPE_MAP[block.type] : null;
  const name = block ? t[`block_${block.type}` as const] : '';
  const preview = block && draft ? { ...block, ...draft } : null;

  const pickStyle = (style: string) => {
    if (!def || !draft) return;
    const sizes = def.styles.find(entry => entry.key === style)?.sizes ?? [];
    setDraft({ style, size: sizes.includes(draft.size) ? draft.size : sizes[0] });
  };

  const pickSize = (size: HomeBlockSize) => {
    if (!block || !draft) return;
    setDraft({ style: styleForSize(block.type, draft.style, size), size });
  };

  const budget = data.budget;
  const limitCount = budget ? Object.values(budget.categoryLimits).filter(limit => limit > 0).length : 0;

  return (
    <GlassSheet
      isOpen={!!block}
      onClose={onClose}
      title={name}
      closeLabel={t.close}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-chip px-5 text-[15px] font-semibold text-neg"
          >
            <Trash2 size={18} aria-hidden="true" />
            {t.remove}
          </button>
          <button
            type="button"
            onClick={() => draft && onSave(draft)}
            className="h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent"
          >
            {t.save}
          </button>
        </div>
      }
    >
      {preview && def && draft && (
        <div className="flex flex-col gap-5">
          <div className="flex justify-center rounded-[28px] bg-chip p-3">
            <BlockPreview block={preview} data={data} scale={preview.size === 's' ? 0.9 : 0.86} />
          </div>

          {def.styles.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-muted">{t.styleLabel}</span>
              <Segmented
                ariaLabel={t.styleLabel}
                value={draft.style}
                onChange={pickStyle}
                options={def.styles.map(style => ({ value: style.key, label: t[`style_${style.key}` as keyof typeof t] as string }))}
              />
            </div>
          )}

          {sizesForType(def.type).length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-muted">{t.sizeLabel}</span>
              <Segmented
                ariaLabel={t.sizeLabel}
                value={draft.size}
                onChange={pickSize}
                options={sizesForType(def.type).map(size => ({ value: size, label: t[SIZE_KEYS[size]] }))}
              />
            </div>
          )}

          {def.type === 'budget' && (
            <div className="overflow-hidden rounded-[22px] bg-tile">
              {[
                [t.monthlyBudget, budget && budget.monthly > 0 ? money(budget.monthly, data.currency, data.language) : t.notSet],
                [t.categoryLimits, limitCount > 0 ? fill(t.limitsCount, { count: limitCount }) : t.notSet],
              ].map(([label, value], i) => (
                <button
                  key={label}
                  type="button"
                  onClick={onOpenBudgets}
                  className={`flex h-[52px] w-full items-center justify-between gap-3 px-4 text-[15px] ${i === 0 ? 'border-b border-hair' : ''}`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="flex items-center gap-1 text-muted">
                    {value}
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index <= 0}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-chip text-sm font-semibold disabled:opacity-40"
            >
              <ArrowUp size={16} aria-hidden="true" />
              {t.moveUp}
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index >= count - 1}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-chip text-sm font-semibold disabled:opacity-40"
            >
              <ArrowDown size={16} aria-hidden="true" />
              {t.moveDown}
            </button>
          </div>
        </div>
      )}
    </GlassSheet>
  );
};
