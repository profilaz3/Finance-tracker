import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Minus, Plus, User } from 'lucide-react';
import type { Account, AppState, Event, HomeBlock, HomeBlockType } from '../../types';
import { isSameMonth, monthKeyOf, shiftMonth, type MonthKey } from '../../domain/home';
import { addBlock, moveBlock, removeBlock, resolveHomeLayout, updateBlock } from '../../domain/homeLayout';
import { getIntlLocale } from '../../utils/locale';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';
import { lgStyle } from '../ui/LiquidGlassDefs';
import { BlockContent, HAS_INNER_ACTIONS, tileAction } from './blocks';
import { BlockGallerySheet } from './BlockGallerySheet';
import { BlockSettingsSheet } from './BlockSettingsSheet';
import { fill, initials } from './parts';
import { useHomeData, type HomeActions } from './useHomeData';

interface HomeViewProps {
  state: AppState;
  netWorth: number;
  getAccountBalance: (account: Account) => number;
  activeEvent?: Event;
  actions: HomeActions;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onLayoutChange: (layout: HomeBlock[]) => void;
  onOpenProfile: () => void;
  /** The team workspace on screen; absent for personal. */
  activeTeam?: { name: string; color?: string };
}

const LONG_PRESS_MS = 350;
const MOVE_TOLERANCE = 8;

const SIZE_TAG: Record<HomeBlock['size'], string> = { s: 'S', m: 'M', l: 'L' };

/** Long-press a tile in edit mode, then drag: the layout reorders live under the finger. */
function useBlockDrag(layout: HomeBlock[], onLayoutChange: (layout: HomeBlock[]) => void, enabled: boolean) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const pressRef = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const lastTargetRef = useRef<string | null>(null);
  const draggedRef = useRef(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const cancelPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  const endDrag = useCallback(() => {
    cancelPress();
    lastTargetRef.current = null;
    setDraggingId(null);
  }, []);

  useEffect(() => {
    if (!enabled) endDrag();
  }, [enabled, endDrag]);

  // Touch scrolling has to be cancelled from a non-passive listener; React's are passive.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !draggingId) return;
    const block = (event: TouchEvent) => event.preventDefault();
    grid.addEventListener('touchmove', block, { passive: false });
    return () => grid.removeEventListener('touchmove', block);
  }, [draggingId]);

  const onPointerDown = (id: string) => (event: React.PointerEvent) => {
    if (!enabled || event.button !== 0) return;
    draggedRef.current = false;
    cancelPress();
    const timer = window.setTimeout(() => {
      draggedRef.current = true;
      lastTargetRef.current = id;
      setDraggingId(id);
      vibrate(HAPTIC_PATTERNS.light);
    }, LONG_PRESS_MS);
    pressRef.current = { id, x: event.clientX, y: event.clientY, timer };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const press = pressRef.current;
    if (press && !draggingId) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
      return;
    }
    if (!draggingId) return;
    const target = document
      .elementsFromPoint(event.clientX, event.clientY)
      .map(element => (element as HTMLElement).closest?.('[data-block-id]') as HTMLElement | null)
      .find(element => element && gridRef.current?.contains(element));
    const targetId = target?.dataset.blockId;
    if (!targetId || targetId === lastTargetRef.current) return;
    lastTargetRef.current = targetId;
    if (targetId === draggingId) return;
    const current = layoutRef.current;
    const from = current.findIndex(entry => entry.id === draggingId);
    const to = current.findIndex(entry => entry.id === targetId);
    if (from < 0 || to < 0) return;
    onLayoutChange(moveBlock(current, from, to));
    vibrate(HAPTIC_PATTERNS.light);
  };

  /** True once when the press that just ended turned into a drag: swallow its click. */
  const consumeDrag = () => {
    const dragged = draggedRef.current;
    draggedRef.current = false;
    return dragged;
  };

  return {
    gridRef,
    draggingId,
    onPointerDown,
    gridHandlers: {
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onPointerLeave: () => { if (!draggingId) cancelPress(); },
    },
    consumeDrag,
  };
}

export const HomeView: React.FC<HomeViewProps> = ({
  state,
  netWorth,
  getAccountBalance,
  activeEvent,
  actions,
  editing,
  onEditingChange,
  onLayoutChange,
  onOpenProfile,
  activeTeam,
}) => {
  const [month, setMonth] = useState<MonthKey>(() => monthKeyOf(new Date()));
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const layout = resolveHomeLayout(state.homeLayout);
  const data = useHomeData({ state, month, netWorth, getAccountBalance, activeEvent });
  const { t, language } = data;
  const isCurrentMonth = isSameMonth(month, monthKeyOf(new Date()));
  const drag = useBlockDrag(layout, onLayoutChange, editing);

  const monthName = new Intl.DateTimeFormat(getIntlLocale(language), {
    month: 'long',
    ...(month.year !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  }).format(new Date(month.year, month.month, 1));

  const settingsIndex = layout.findIndex(block => block.id === settingsId);
  const settingsBlock = settingsIndex >= 0 ? layout[settingsIndex] : null;

  const handleAdd = (type: HomeBlockType) => {
    const result = addBlock(layout, type);
    onLayoutChange(result.layout);
    setGalleryOpen(false);
    onEditingChange(true);
    requestAnimationFrame(() => {
      document.querySelector(`[data-block-id="${result.block.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const profile = state.userProfile;

  return (
    <div className="mx-auto max-w-[920px] pb-6">
      <header className="flex h-[60px] items-center gap-2 px-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              style={lgStyle('lg-pill')}
              className="glass flex h-11 items-center gap-1.5 rounded-full pl-3.5 pr-4 text-[15px] font-semibold"
            >
              <Plus size={18} aria-hidden="true" />
              {t.addBlock}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onEditingChange(false)}
              className="glass-accent flex h-11 items-center rounded-full px-5 text-[15px] font-semibold"
            >
              {t.done}
            </button>
          </>
        ) : (
          <>
            <div style={lgStyle('lg-pill')} className="glass flex h-11 items-center rounded-full px-1">
              <button
                type="button"
                onClick={() => setMonth(prev => shiftMonth(prev, -1))}
                aria-label={t.prevMonth}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span aria-live="polite" className="min-w-[64px] px-0.5 text-center text-[15px] font-semibold capitalize">
                {monthName}
              </span>
              <button
                type="button"
                onClick={() => setMonth(prev => shiftMonth(prev, 1))}
                aria-label={t.nextMonth}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => setMonth(monthKeyOf(new Date()))}
                className="h-9 rounded-full bg-accent-soft px-3 text-[13px] font-semibold text-accent"
              >
                {t.backToThisMonth}
              </button>
            )}
            <div className="flex-1" />
            {activeTeam && (
              <button
                type="button"
                onClick={onOpenProfile}
                aria-label={`${t.workspace}: ${activeTeam.name}`}
                title={t.workspaceSwitch}
                className="glass flex h-11 min-w-0 max-w-[40vw] items-center gap-2 rounded-full pl-1.5 pr-3.5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: activeTeam.color || '#0891B2' }}
                >
                  {activeTeam.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="truncate text-[14px] font-semibold">{activeTeam.name}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenProfile}
              aria-label={t.profileMenu}
              aria-haspopup="dialog"
              style={lgStyle('lg-round')}
              className="glass flex h-11 w-11 items-center justify-center rounded-full p-[3px]"
            >
              {profile ? (
                <span
                  className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[14px] font-bold text-white"
                  style={{ background: profile.color }}
                >
                  {/^(data:|http)/.test(profile.avatar ?? '')
                    ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                    : profile.avatar || initials(profile.name)}
                </span>
              ) : (
                <User size={20} aria-hidden="true" />
              )}
            </button>
          </>
        )}
      </header>

      {editing && (
        <p className="mx-auto mb-3 mt-1 w-fit rounded-full bg-chip px-3.5 py-1.5 text-center text-[13px] font-medium text-muted">
          {t.editHint}
        </p>
      )}

      {layout.length === 0 ? (
        <div className="paper-tile mx-1 mt-2 flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="text-[19px] font-bold">{t.homeEmpty}</span>
          <span className="text-sm text-muted">{t.homeEmptyHint}</span>
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="mt-3 flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent"
          >
            <Plus size={18} aria-hidden="true" />
            {t.addBlock}
          </button>
        </div>
      ) : (
        <div
          ref={drag.gridRef}
          {...drag.gridHandlers}
          {...(editing ? { 'data-no-swipe': '' } : {})}
          onContextMenu={editing ? event => event.preventDefault() : undefined}
          className="grid grid-flow-row-dense grid-cols-2 gap-3 px-1 md:grid-cols-4"
        >
          {layout.map(block => {
            const name = t[`block_${block.type}` as const];
            const dragging = drag.draggingId === block.id;
            const action = tileAction(block, data, actions);
            const content = <BlockContent block={block} data={data} actions={actions} />;
            return (
              <div
                key={block.id}
                data-block-id={block.id}
                className={clsx(
                  'relative flex',
                  block.size === 's' ? 'col-span-1 min-h-[172px]' : 'col-span-2',
                  editing && !dragging && 'home-wiggle',
                  dragging && 'z-10 scale-[1.04] opacity-90 drop-shadow-2xl transition-transform',
                )}
              >
                {editing ? (
                  <>
                    <button
                      type="button"
                      aria-label={fill(t.editBlockNamed, { name })}
                      onPointerDown={drag.onPointerDown(block.id)}
                      onClick={() => {
                        if (drag.consumeDrag()) return;
                        setSettingsId(block.id);
                      }}
                      className="flex w-full touch-manipulation select-none rounded-[26px] text-left [-webkit-touch-callout:none]"
                    >
                      <span aria-hidden="true" inert className="pointer-events-none flex w-full">
                        {content}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={fill(t.removeBlockNamed, { name })}
                      onClick={() => onLayoutChange(removeBlock(layout, block.id))}
                      className="absolute -left-1.5 -top-1.5 z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#8E8E93] text-white shadow-md"
                    >
                      <Minus size={16} strokeWidth={3} aria-hidden="true" />
                    </button>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-md"
                    >
                      {SIZE_TAG[block.size]}
                    </span>
                  </>
                ) : action && !HAS_INNER_ACTIONS(block) ? (
                  <button type="button" onClick={action} className="flex w-full rounded-[26px] text-left">
                    {content}
                  </button>
                ) : (
                  <div className="flex w-full">{content}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!editing && layout.length > 0 && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => onEditingChange(true)}
            className="h-10 rounded-full bg-chip px-4 text-sm font-semibold text-muted"
          >
            {t.customizeHome}
          </button>
        </div>
      )}

      <BlockGallerySheet isOpen={galleryOpen} onClose={() => setGalleryOpen(false)} onAdd={handleAdd} data={data} />
      <BlockSettingsSheet
        block={settingsBlock}
        index={settingsIndex}
        count={layout.length}
        data={data}
        onClose={() => setSettingsId(null)}
        onSave={changes => {
          if (settingsBlock) onLayoutChange(updateBlock(layout, settingsBlock.id, changes));
          setSettingsId(null);
        }}
        onMove={delta => onLayoutChange(moveBlock(layout, settingsIndex, settingsIndex + delta))}
        onRemove={() => {
          if (settingsBlock) onLayoutChange(removeBlock(layout, settingsBlock.id));
          setSettingsId(null);
        }}
        onOpenBudgets={() => {
          setSettingsId(null);
          actions.openBudgets();
        }}
      />
    </div>
  );
};
