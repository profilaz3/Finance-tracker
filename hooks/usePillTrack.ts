import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { hapticSelection } from '../utils/haptics';

const SPRING = 'cubic-bezier(0.34, 1.32, 0.64, 1)';
const DRAG_SLOP = 6;

interface Drag {
  x0: number;
  y0: number;
  pointerId: number;
  active: boolean;
  grabOffset: number;
  hot?: number;
}

/**
 * A sliding selection pill for segmented tracks (switches, the tab bar).
 * The pill glides between items, and can be dragged with a finger or mouse:
 * it lifts, follows the pointer, and drops onto the nearest item.
 *
 * Mark each selectable child with `data-pill-item`. The track must be `relative`.
 */
export function usePillTrack(selectedIndex: number, onSelectIndex: (index: number) => void) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const selectedRef = useRef(selectedIndex);
  selectedRef.current = selectedIndex;
  const onSelectRef = useRef(onSelectIndex);
  onSelectRef.current = onSelectIndex;
  const placedOnce = useRef(false);

  const items = useCallback(
    (): HTMLElement[] => Array.from(trackRef.current?.querySelectorAll<HTMLElement>('[data-pill-item]') ?? []),
    [],
  );

  const setHot = useCallback((index: number | null) => {
    items().forEach((item, i) => {
      if (i === index) item.setAttribute('data-pill-hot', '');
      else item.removeAttribute('data-pill-hot');
    });
  }, [items]);

  const placeAt = useCallback((index: number, animate: boolean) => {
    const pill = pillRef.current;
    if (!pill) return;
    const item = items()[index];
    if (!item || item.offsetWidth === 0) {
      pill.style.opacity = '0';
      return;
    }
    pill.style.transition = animate ? `transform 460ms ${SPRING}, width 460ms ${SPRING}, opacity 160ms ease-out` : 'none';
    pill.style.width = `${item.offsetWidth}px`;
    pill.style.transform = `translate3d(${item.offsetLeft}px, 0, 0)`;
    pill.style.opacity = '1';
  }, [items]);

  const place = useCallback((animate: boolean) => placeAt(selectedRef.current, animate), [placeAt]);

  useLayoutEffect(() => {
    place(placedOnce.current);
    placedOnce.current = true;
  }, [selectedIndex, place]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!drag.current?.active) place(false);
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [place]);

  const nearestIndex = (centerX: number): number => {
    let best = 0;
    let bestDistance = Infinity;
    items().forEach((item, i) => {
      const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - centerX);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || selectedRef.current < 0) return;
    const pill = pillRef.current;
    const track = trackRef.current;
    if (!pill || !track) return;
    const pillLeft = items()[selectedRef.current]?.offsetLeft ?? 0;
    const pointerX = event.clientX - track.getBoundingClientRect().left;
    const width = pill.offsetWidth;
    // Grabbing the pill keeps the finger where it touched; elsewhere the pill centers under it.
    const onPill = pointerX >= pillLeft && pointerX <= pillLeft + width;
    drag.current = {
      x0: event.clientX,
      y0: event.clientY,
      pointerId: event.pointerId,
      active: false,
      grabOffset: onPill ? pointerX - pillLeft : width / 2,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const pill = pillRef.current;
    const track = trackRef.current;
    if (!d || !pill || !track || event.pointerId !== d.pointerId) return;
    const dx = event.clientX - d.x0;
    if (!d.active) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      if (Math.abs(dx) < Math.abs(event.clientY - d.y0)) {
        drag.current = null;
        return;
      }
      d.active = true;
      track.setPointerCapture?.(event.pointerId);
      track.setAttribute('data-pill-dragging', '');
    }
    const list = items();
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    const width = pill.offsetWidth;
    const pointerX = event.clientX - track.getBoundingClientRect().left;
    const min = first.offsetLeft;
    const max = last.offsetLeft + last.offsetWidth - width;
    const raw = pointerX - d.grabOffset;
    // Soft edges: past the ends the pill resists instead of stopping dead.
    const x = raw < min ? min - Math.sqrt(min - raw) * 2 : raw > max ? max + Math.sqrt(raw - max) * 2 : raw;
    pill.style.transition = 'transform 60ms linear';
    pill.style.transform = `translate3d(${x}px, 0, 0) scale(1.06)`;
    const hot = nearestIndex(x + width / 2);
    if (hot !== d.hot) {
      if (d.hot !== undefined) hapticSelection();
      d.hot = hot;
    }
    setHot(hot);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    drag.current = null;
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!d || !d.active || !track || !pill) return;
    track.removeAttribute('data-pill-dragging');
    track.releasePointerCapture?.(event.pointerId);
    setHot(null);
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (cancelled) {
      place(true);
      return;
    }
    const matrix = new DOMMatrixReadOnly(getComputedStyle(pill).transform);
    const index = nearestIndex(matrix.m41 + pill.offsetWidth / 2);
    placeAt(index, true);
    if (index !== selectedRef.current) {
      hapticSelection();
      onSelectRef.current(index);
    }
  };

  const trackProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => endDrag(event, false),
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => endDrag(event, true),
    onClickCapture: (event: React.MouseEvent) => {
      if (!suppressClick.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return { trackRef, pillRef, trackProps };
}
