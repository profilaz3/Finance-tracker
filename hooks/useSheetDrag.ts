import { useRef } from 'react';
import type React from 'react';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';

const SLOP = 6;
const SPRING_BACK = 'cubic-bezier(0.34, 1.3, 0.64, 1)';
/** How much of the backdrop is left when the sheet is pulled its full height down. */
const SCRIM_MIN = 0.15;

/**
 * The sheet's backdrop: a `.paper-scrim` sibling of the drag wrapper, or the overlay itself when
 * the overlay is the scrim. It fades through `--scrim-k` (see theme.css) rather than opacity, so
 * the sheet's own exit animation, which owns the opacity, carries on from the faded level.
 */
const findScrim = (wrap: HTMLElement): HTMLElement | null => {
  const parent = wrap.parentElement;
  if (!parent) return null;
  const sibling = parent.querySelector<HTMLElement>(':scope > .paper-scrim');
  if (sibling && sibling !== wrap) return sibling;
  return parent.classList.contains('paper-scrim') ? parent : null;
};

const clearScrim = (scrim: HTMLElement) => {
  scrim.removeAttribute('data-scrim-drag');
  scrim.style.removeProperty('--scrim-k');
  scrim.style.removeProperty('transition');
};

interface Drag {
  x0: number;
  y0: number;
  dy: number;
  lastY: number;
  lastT: number;
  velocity: number;
  active: boolean;
  scroller: HTMLElement | null;
  scrim: HTMLElement | null;
  height: number;
}

/**
 * Pull a bottom sheet down to dismiss it, like a native sheet.
 *
 * Wrap the sheet in an element with `wrapRef` (the wrapper moves, so the sheet's own
 * enter/exit animation continues from wherever the finger let go). Spread `handleProps` on
 * the grabber/header, and `contentProps` on the scrolling body: the body only pulls the sheet
 * when it is scrolled to the top.
 */
export function useSheetDrag(onClose: () => void) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const reset = (wrap: HTMLDivElement, scrim: HTMLElement | null) => {
    wrap.style.transition = `transform 460ms ${SPRING_BACK}`;
    wrap.style.transform = 'translate3d(0, 0, 0)';
    if (scrim) {
      scrim.style.transition = '--scrim-k 300ms ease-out';
      scrim.style.setProperty('--scrim-k', '1');
    }
    window.setTimeout(() => {
      if (drag.current?.active) return;
      wrap.style.transition = '';
      wrap.style.transform = '';
      wrap.style.willChange = '';
      if (scrim) clearScrim(scrim);
    }, 480);
  };

  const start = (event: React.TouchEvent<HTMLElement>, fromContent: boolean) => {
    drag.current = null;
    if (event.touches.length !== 1) return;
    const scroller = fromContent ? event.currentTarget : null;
    if (scroller && scroller.scrollTop > 0) return;
    const touch = event.touches[0];
    drag.current = {
      x0: touch.clientX,
      y0: touch.clientY,
      dy: 0,
      lastY: touch.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      active: false,
      scroller,
      scrim: null,
      height: 0,
    };
  };

  const move = (event: React.TouchEvent<HTMLElement>) => {
    const d = drag.current;
    const wrap = wrapRef.current;
    const touch = event.touches[0];
    if (!d || !wrap || !touch) return;
    const dy = touch.clientY - d.y0;
    const dx = touch.clientX - d.x0;
    if (!d.active) {
      if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
      // Only a downward pull, and only while the body is at its top.
      if (dy <= 0 || Math.abs(dx) > dy || (d.scroller && d.scroller.scrollTop > 0)) {
        drag.current = null;
        return;
      }
      d.active = true;
      wrap.style.transition = 'none';
      wrap.style.willChange = 'transform';
      d.height = (wrap.firstElementChild as HTMLElement | null)?.offsetHeight || 400;
      d.scrim = findScrim(wrap);
      if (d.scrim) {
        d.scrim.style.transition = 'none';
        d.scrim.setAttribute('data-scrim-drag', '');
      }
    }
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.velocity = 0.7 * ((touch.clientY - d.lastY) / dt) + 0.3 * d.velocity;
    d.lastY = touch.clientY;
    d.lastT = event.timeStamp;
    d.dy = Math.max(0, dy);
    // Pulling up past the resting point resists a little.
    const offset = dy >= 0 ? dy : -Math.sqrt(-dy) * 2;
    wrap.style.transform = `translate3d(0, ${offset}px, 0)`;
    if (d.scrim) {
      const progress = Math.min(1, Math.max(0, offset) / d.height);
      d.scrim.style.setProperty('--scrim-k', (1 - (1 - SCRIM_MIN) * progress).toFixed(3));
    }
  };

  const end = (cancelled: boolean) => {
    const d = drag.current;
    drag.current = null;
    const wrap = wrapRef.current;
    if (!d?.active || !wrap) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const dismiss = !cancelled && (d.dy > Math.min(150, d.height * 0.3) || (d.velocity > 0.5 && d.dy > 30));
    if (dismiss) {
      vibrate(HAPTIC_PATTERNS.light);
      // Leave the wrapper and the faded backdrop where the finger released; the sheet's exit
      // slides and fades on from there.
      onCloseRef.current();
      const scrim = d.scrim;
      // A sheet that stays mounted after closing must not keep the faded backdrop.
      if (scrim) window.setTimeout(() => clearScrim(scrim), 1000);
      return;
    }
    reset(wrap, d.scrim);
  };

  const touchHandlers = (fromContent: boolean) => ({
    onTouchStart: (event: React.TouchEvent<HTMLElement>) => start(event, fromContent),
    onTouchMove: move,
    onTouchEnd: () => end(false),
    onTouchCancel: () => end(true),
  });

  return {
    wrapRef,
    handleProps: {
      ...touchHandlers(false),
      onClickCapture: (event: React.MouseEvent) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
    },
    contentProps: touchHandlers(true),
  };
}
