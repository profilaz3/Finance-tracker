import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { CalendarCheck, ChevronLeft, ChevronRight, Minus, Plus, User } from 'lucide-react';
import type { Account, AppState, Event, HomeBlock, HomeBlockType, HomeHeader } from '../../types';
import { isSameMonth, monthKeyOf, shiftMonth, type MonthKey } from '../../domain/home';
import { addBlock, moveBlock, removeBlock, resolveHomeLayout, updateBlock } from '../../domain/homeLayout';
import { blocksShownInHeader, resolveHomeHeader, shownStats } from '../../domain/homeHeader';
import { getIntlLocale } from '../../utils/locale';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';
import { useBackLayer } from '../../hooks/useBackLayer';
import { BlockContent, HAS_INNER_ACTIONS, tileAction } from './blocks';
import { BlockGallerySheet } from './BlockGallerySheet';
import { BlockSettingsSheet } from './BlockSettingsSheet';
import { HeaderSettingsSheet } from './HeaderSettingsSheet';
import { HomeHero, activeFace, headerContext } from './HomeHero';
import { HEADER_STRINGS } from './headerStrings';
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
  onHeaderChange: (header: HomeHeader) => void;
  onOpenProfile: () => void;
  /** The team workspace on screen; absent for personal. */
  activeTeam?: { name: string; color?: string };
  /** Toast with an action (used for "Block removed · Undo"). */
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info', action?: { label: string; onClick: () => void }) => void;
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
  onHeaderChange,
  onOpenProfile,
  activeTeam,
  onToast,
}) => {
  const [month, setMonth] = useState<MonthKey>(() => monthKeyOf(new Date()));
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [headerSheetOpen, setHeaderSheetOpen] = useState(false);
  const header = resolveHomeHeader(state.homeHeader);
  const layout = resolveHomeLayout(state.homeLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // Style and size of removed blocks, so adding one back (or Undo) keeps how it looked.
  const removedLooksRef = useRef(new Map<HomeBlockType, Pick<HomeBlock, 'style' | 'size'>>());
  const data = useHomeData({ state, month, netWorth, getAccountBalance, activeEvent });
  const { t, language } = data;
  const isCurrentMonth = isSameMonth(month, monthKeyOf(new Date()));
  const drag = useBlockDrag(layout, onLayoutChange, editing);
  // What the header shows is not repeated below it. While customizing, those blocks stay (dimmed
  // and tagged) so they can still be moved or removed.
  const context = headerContext(data);
  const inHeader = new Set(blocksShownInHeader(activeFace(header, data), shownStats(header.stats, context), context.walletIds));
  const shownLayout = editing ? layout : layout.filter(block => !inHeader.has(block.type));
  const h = HEADER_STRINGS[language];

  const monthName = new Intl.DateTimeFormat(getIntlLocale(language), {
    month: 'long',
    ...(month.year !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  }).format(new Date(month.year, month.month, 1));

  const settingsIndex = layout.findIndex(block => block.id === settingsId);
  const settingsBlock = settingsIndex >= 0 ? layout[settingsIndex] : null;

  // Both sheets sit above Customize home in the back history, and close when editing ends.
  useBackLayer('home-block-gallery', galleryOpen, () => setGalleryOpen(false));
  useBackLayer('home-block-settings', settingsBlock !== null, () => setSettingsId(null));
  useBackLayer('home-header-settings', headerSheetOpen, () => setHeaderSheetOpen(false));
  useEffect(() => {
    if (editing) return;
    setGalleryOpen(false);
    setSettingsId(null);
    setHeaderSheetOpen(false);
  }, [editing]);

  const handleRemove = (block: HomeBlock) => {
    const index = layout.findIndex(entry => entry.id === block.id);
    removedLooksRef.current.set(block.type, { style: block.style, size: block.size });
    onLayoutChange(removeBlock(layout, block.id));
    onToast?.(fill(t.blockRemoved, { name: t[`block_${block.type}` as const] }), 'info', {
      label: t.undo,
      onClick: () => {
        const current = layoutRef.current;
        if (current.some(entry => entry.id === block.id)) return;
        const next = current.slice();
        next.splice(Math.min(Math.max(index, 0), next.length), 0, block);
        onLayoutChange(next);
      },
    });
  };

  const handleAdd = (type: HomeBlockType) => {
    const added = addBlock(layout, type);
    const look = removedLooksRef.current.get(type);
    const result = look ? { block: { ...added.block, ...look }, layout: updateBlock(added.layout, added.block.id, look) } : added;
    onLayoutChange(result.layout);
    setGalleryOpen(false);
    onEditingChange(true);
    requestAnimationFrame(() => {
      document.querySelector(`[data-block-id="${result.block.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const profile = state.userProfile;

  // Drawn on the header colour: translucent white controls, white text.
  const onColour = 'bg-white/[0.14] ring-1 ring-inset ring-white/[0.18] backdrop-blur-md';
  const topBar = (
    <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
      {editing ? (
        <>
          <span className="min-w-0 truncate pl-1 text-[17px] font-bold tracking-[-0.2px]">{t.customizeHome}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onEditingChange(false)}
            className="flex h-11 shrink-0 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-[#14171A]"
          >
            {t.done}
          </button>
        </>
      ) : (
        <>
          <div className={clsx(onColour, 'flex h-11 shrink-0 items-center rounded-full')}>
            <button
              type="button"
              onClick={() => setMonth(prev => shiftMonth(prev, -1))}
              aria-label={t.prevMonth}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/75"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span aria-live="polite" className="min-w-[64px] whitespace-nowrap text-center text-[15px] font-semibold capitalize">
              {monthName}
            </span>
            {/* Home has nothing to show for months that have not started. */}
            <button
              type="button"
              onClick={() => setMonth(prev => shiftMonth(prev, 1))}
              disabled={isCurrentMonth}
              aria-label={t.nextMonth}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/75 disabled:opacity-30"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => setMonth(monthKeyOf(new Date()))}
              aria-label={t.backToThisMonth}
              title={t.backToThisMonth}
              className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-[13px] font-semibold text-[#14171A]"
            >
              <CalendarCheck size={17} aria-hidden="true" />
              <span className="hidden min-[480px]:inline">{t.backToThisMonth}</span>
            </button>
          )}
          <div className="flex-1" />
          {activeTeam && (
            <button
              type="button"
              onClick={onOpenProfile}
              aria-label={`${t.workspace}: ${activeTeam.name}`}
              title={t.workspaceSwitch}
              className={clsx(onColour, 'flex h-11 min-w-0 max-w-[40vw] items-center gap-2 rounded-full pl-1.5 pr-3.5')}
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ring-1 ring-white/40"
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
            className={clsx(onColour, 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-[3px]')}
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
    </div>
  );

  return (
    <div className="mx-auto max-w-[920px] pb-6">
      <HomeHero
        data={data}
        header={header}
        actions={actions}
        editing={editing}
        topBar={topBar}
        onChangeHeader={() => setHeaderSheetOpen(true)}
      />

      <div className="screen-sheet">
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
          className="grid grid-flow-row-dense grid-cols-2 gap-3 px-1 lg:grid-cols-4"
        >
          {shownLayout.map(block => {
            const name = t[`block_${block.type}` as const];
            const hidden = inHeader.has(block.type);
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
                    {/* The block's own buttons stay inert under a full-size overlay button (no nested buttons). */}
                    <div aria-hidden="true" inert className={clsx('pointer-events-none flex w-full', hidden && 'opacity-45 saturate-50')}>
                      {content}
                    </div>
                    <button
                      type="button"
                      aria-label={hidden ? `${fill(t.editBlockNamed, { name })}. ${h.inHeaderHint}` : fill(t.editBlockNamed, { name })}
                      onPointerDown={drag.onPointerDown(block.id)}
                      onClick={() => {
                        if (drag.consumeDrag()) return;
                        setSettingsId(block.id);
                      }}
                      className="absolute inset-0 touch-manipulation select-none rounded-[26px] [-webkit-touch-callout:none]"
                    />
                    {/* 26px badge, 44px hit area centred on it. */}
                    <button
                      type="button"
                      aria-label={fill(t.removeBlockNamed, { name })}
                      onClick={() => handleRemove(block)}
                      className="absolute -left-[15px] -top-[15px] z-10 flex h-11 w-11 items-center justify-center rounded-full"
                    >
                      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#8E8E93] text-white shadow-md">
                        <Minus size={16} strokeWidth={3} aria-hidden="true" />
                      </span>
                    </button>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-md"
                    >
                      {SIZE_TAG[block.size]}
                    </span>
                    {hidden && (
                      <span
                        aria-hidden="true"
                        title={h.inHeaderHint}
                        className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-md"
                      >
                        {h.inHeader}
                      </span>
                    )}
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

      {editing && (
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          className="mx-1 mt-3 flex h-14 w-[calc(100%-0.5rem)] items-center justify-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-accent/50 text-[15px] font-semibold text-accent"
        >
          <Plus size={18} aria-hidden="true" />
          {t.addBlock}
        </button>
      )}

      {!editing && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => {
              onEditingChange(true);
              // The header is the first slot: start editing from the top.
              document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="h-10 rounded-full bg-chip px-4 text-sm font-semibold text-muted"
          >
            {t.customizeHome}
          </button>
        </div>
      )}
      </div>

      <HeaderSettingsSheet
        isOpen={headerSheetOpen}
        header={header}
        data={data}
        onClose={() => setHeaderSheetOpen(false)}
        onSave={next => {
          onHeaderChange(next);
          setHeaderSheetOpen(false);
        }}
      />

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
          if (settingsBlock) handleRemove(settingsBlock);
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
