import { useCallback, useRef } from 'react';
import type React from 'react';
import { shouldIgnoreSwipeStart } from '../utils/swipeGuard';

/** 1 = forward (finger moves left, next page), -1 = back (finger moves right). */
export type SwipeDirection = 1 | -1;

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPRING_BACK = 'cubic-bezier(0.34, 1.3, 0.64, 1)';
const AXIS_SLOP = 8;
const COMMIT_RATIO = 0.25;
const FLING_VELOCITY = 0.45; // px per ms
const OUT_MS = 150;
/** Space between the current page and the live neighbour while dragging. */
export const PAGE_GAP = 12;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Each element remembers its latest animation so a stale cleanup never cancels a newer one.
const tokens = new WeakMap<HTMLElement, number>();
const nextToken = (el: HTMLElement): number => {
  const token = (tokens.get(el) ?? 0) + 1;
  tokens.set(el, token);
  return token;
};

/** Removes inline motion so a transformed page never becomes the containing block of fixed dialogs. */
const clearMotion = (el: HTMLElement) => {
  el.style.transition = '';
  el.style.transform = '';
  el.style.opacity = '';
  el.style.willChange = '';
};

const settle = (el: HTMLElement, ms: number) => {
  const token = nextToken(el);
  const finish = () => {
    if (tokens.get(el) === token) clearMotion(el);
  };
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== el || event.propertyName !== 'transform') return;
    el.removeEventListener('transitionend', onEnd);
    finish();
  };
  el.addEventListener('transitionend', onEnd);
  window.setTimeout(() => {
    el.removeEventListener('transitionend', onEnd);
    finish();
  }, ms + 80);
};

/** Drops any leftover inline motion (and cancels pending cleanups) on a page that has settled. */
export function resetPageMotion(el: HTMLElement | null | undefined): void {
  if (!el) return;
  nextToken(el);
  clearMotion(el);
}

/** Rubber band past the first or last page, like a native scroll edge. */
const rubberBand = (dx: number, limit = 140): number => {
  const sign = Math.sign(dx);
  const distance = Math.abs(dx);
  return sign * (1 - 1 / ((distance * 0.55) / limit + 1)) * limit;
};

/** Slides a freshly shown page in from the side the user swiped or navigated toward. */
export function playPageEnter(el: HTMLElement | null | undefined, dir: SwipeDirection): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    nextToken(el);
    clearMotion(el);
    return;
  }
  const width = el.offsetWidth || window.innerWidth;
  el.style.transition = 'none';
  el.style.willChange = 'transform, opacity';
  el.style.transform = `translate3d(${dir * Math.min(width * 0.24, 110)}px, 0, 0)`;
  el.style.opacity = '0';
  void el.offsetWidth; // commit the start frame before transitioning
  el.style.transition = `transform 440ms ${EASE_OUT}, opacity 260ms ease-out`;
  el.style.transform = 'translate3d(0, 0, 0)';
  el.style.opacity = '1';
  settle(el, 440);
}

interface SwipePagerOptions {
  /** The element that follows the finger. */
  getTarget: () => HTMLElement | null | undefined;
  /** Boundary for the swipe guard's scrollable-ancestor walk. */
  getRoot?: () => Element | null;
  canGo: (dir: SwipeDirection) => boolean;
  /** `live` is true when the neighbour already slid fully in and should become the page in place. */
  onCommit: (dir: SwipeDirection, live: boolean) => void;
  enabled?: boolean;
  /** Stop the touch from reaching an outer pager (nested pagers, e.g. a settings page). */
  isolate?: boolean;
  /**
   * Live neighbour: asked to render the page that lies in `dir` (or to drop it, with null).
   * Return true when a neighbour will be shown; the current page then slides without fading.
   */
  onPeek?: (dir: SwipeDirection | null) => boolean;
  /** The rendered neighbour for `dir`, once it is in the document. */
  getPeek?: (dir: SwipeDirection) => HTMLElement | null | undefined;
}

interface Gesture {
  x0: number;
  y0: number;
  axis: 'x' | null;
  dx: number;
  lastX: number;
  lastT: number;
  velocity: number;
  el: HTMLElement | null;
  width: number;
  /** Direction the neighbour was last requested for; 0 before the axis locks. */
  peekDir: SwipeDirection | 0;
  hasPeek: boolean;
  seq: number;
}

/**
 * Interactive horizontal paging: the page tracks the finger, rubber-bands at the ends,
 * and either completes the slide (distance or fling) or springs back.
 */
export function useSwipePager(options: SwipePagerOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const gesture = useRef<Gesture | null>(null);
  const seq = useRef(0);
  // A live commit is sliding the neighbour in; a new touch must not grab the pages mid-flight.
  const committing = useRef(false);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const opts = optionsRef.current;
    gesture.current = null;
    if (opts.enabled === false) return;
    if (opts.isolate) event.stopPropagation();
    if (committing.current) return;
    if (event.touches.length !== 1) return;
    if (shouldIgnoreSwipeStart(event.target, opts.getRoot?.() ?? null)) return;
    const touch = event.touches[0];
    gesture.current = {
      x0: touch.clientX,
      y0: touch.clientY,
      axis: null,
      dx: 0,
      lastX: touch.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      el: null,
      width: 0,
      peekDir: 0,
      hasPeek: false,
      seq: ++seq.current,
    };
  }, []);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    const opts = optionsRef.current;
    if (opts.isolate) event.stopPropagation();
    const g = gesture.current;
    if (!g) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - g.x0;
    const dy = touch.clientY - g.y0;

    if (!g.axis) {
      if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.15) {
        gesture.current = null; // a vertical scroll: let it be
        return;
      }
      g.axis = 'x';
      g.el = opts.getTarget() ?? null;
      if (g.el) {
        nextToken(g.el);
        g.width = g.el.offsetWidth || window.innerWidth;
        g.el.style.transition = 'none';
        g.el.style.willChange = 'transform, opacity';
      }
    }

    const dt = event.timeStamp - g.lastT;
    if (dt > 0) g.velocity = 0.7 * ((touch.clientX - g.lastX) / dt) + 0.3 * g.velocity;
    g.lastX = touch.clientX;
    g.lastT = event.timeStamp;
    g.dx = dx;

    if (!g.el) return;
    const dir: SwipeDirection = dx < 0 ? 1 : -1;
    const canGo = opts.canGo(dir);
    if (dir !== g.peekDir && opts.onPeek && !prefersReducedMotion()) {
      g.peekDir = dir;
      if (canGo) {
        g.hasPeek = opts.onPeek(dir);
      } else {
        opts.onPeek(null);
        g.hasPeek = false;
      }
    }
    const offset = canGo ? dx : rubberBand(dx);
    g.el.style.transform = `translate3d(${offset}px, 0, 0)`;
    if (g.hasPeek) {
      // The neighbour rides alongside, so the page itself stays fully opaque.
      g.el.style.opacity = '1';
      const peek = opts.getPeek?.(dir);
      if (peek) {
        peek.style.transition = 'none';
        peek.style.transform = `translate3d(${offset + dir * (g.width + PAGE_GAP)}px, 0, 0)`;
      }
    } else {
      g.el.style.opacity = String(1 - Math.min(0.3, (Math.abs(offset) / (g.width || 1)) * 0.45));
    }
  }, []);

  const finish = useCallback((cancelled: boolean) => {
    const opts = optionsRef.current;
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;
    const el = g.el;
    const width = g.width || window.innerWidth;
    const dir: SwipeDirection = g.dx < 0 ? 1 : -1;
    const fling = Math.abs(g.velocity) > FLING_VELOCITY && Math.sign(g.velocity) === Math.sign(g.dx) && Math.abs(g.dx) > 24;
    const commit = !cancelled && opts.canGo(dir) && (Math.abs(g.dx) > width * COMMIT_RATIO || fling);

    const peek = g.hasPeek ? opts.getPeek?.(dir) ?? null : null;

    if (commit && peek && el) {
      // Live commit: the neighbour finishes sliding in and becomes the page in place.
      const remaining = Math.max(0, width + PAGE_GAP - Math.abs(g.dx));
      const ms = Math.round(Math.min(320, Math.max(170, remaining / Math.max(Math.abs(g.velocity), 1.1))));
      const token = nextToken(el);
      el.style.transition = `transform ${ms}ms ${EASE_OUT}`;
      el.style.transform = `translate3d(${-dir * (width + PAGE_GAP)}px, 0, 0)`;
      el.style.opacity = '1';
      peek.style.transition = `transform ${ms}ms ${EASE_OUT}`;
      peek.style.transform = 'translate3d(0, 0, 0)';
      committing.current = true;
      window.setTimeout(() => {
        committing.current = false;
        opts.onCommit(dir, true);
        window.setTimeout(() => {
          if (tokens.get(el) === token) clearMotion(el);
        }, 0);
      }, ms);
      return;
    }

    if (commit) {
      const reduced = prefersReducedMotion();
      const token = el ? nextToken(el) : 0;
      if (el && !reduced) {
        el.style.transition = `transform ${OUT_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${OUT_MS}ms linear`;
        el.style.transform = `translate3d(${-dir * width * 0.45}px, 0, 0)`;
        el.style.opacity = '0';
      }
      window.setTimeout(() => {
        opts.onCommit(dir, false);
        // If the slid-out element stays in the document (an in-page back), reset it unless an
        // enter animation has already taken it over.
        window.setTimeout(() => {
          if (el && tokens.get(el) === token) clearMotion(el);
        }, 0);
      }, reduced ? 0 : OUT_MS - 20);
      return;
    }

    if (el) {
      // With a neighbour alongside, an overshooting spring would open a gap on the far side.
      const ease = g.hasPeek ? EASE_OUT : SPRING_BACK;
      const ms = g.hasPeek ? 380 : 480;
      el.style.transition = `transform ${ms}ms ${ease}, opacity 220ms ease-out`;
      el.style.transform = 'translate3d(0, 0, 0)';
      el.style.opacity = '1';
      settle(el, ms);
      if (peek && g.peekDir) {
        peek.style.transition = `transform ${ms}ms ${ease}`;
        peek.style.transform = `translate3d(${g.peekDir * (width + PAGE_GAP)}px, 0, 0)`;
      }
    }
    if (g.hasPeek || g.peekDir) {
      const mySeq = g.seq;
      // Drop the neighbour once it is out of view, unless a newer gesture has started.
      window.setTimeout(() => {
        if (seq.current === mySeq) opts.onPeek?.(null);
      }, g.hasPeek ? 400 : 0);
    }
  }, []);

  const onTouchEnd = useCallback((event: React.TouchEvent) => {
    if (optionsRef.current.isolate) event.stopPropagation();
    finish(false);
  }, [finish]);

  const onTouchCancel = useCallback((event: React.TouchEvent) => {
    if (optionsRef.current.isolate) event.stopPropagation();
    finish(true);
  }, [finish]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
