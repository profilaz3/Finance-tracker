import { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, usePresence, useReducedMotion } from 'motion/react';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GrowFrame {
  x: number;
  y: number;
  scale: number;
  clipPath: string;
}

const ROW_RADIUS = 18;
export const CARD_RADIUS = 32;
export const FULL_CLIP = `inset(0px 0px 0px 0px round ${CARD_RADIUS}px)`;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Where the card starts (and ends) so that it covers exactly the tapped row: moved onto the row's
 * centre, scaled evenly to the row's width (so text never squashes), and clipped to a band as tall
 * as the row. Animating from here to the identity grows the row into the card.
 */
export const growFrame = (card: Box, row: Box): GrowFrame => {
  const scale = Math.min(1, Math.max(0.55, row.width / card.width));
  const x = row.left + row.width / 2 - (card.left + card.width / 2);
  const y = row.top + row.height / 2 - (card.top + card.height / 2);
  const band = Math.min(card.height, row.height / scale);
  const inset = Math.max(0, (card.height - band) / 2);
  return {
    x: round(x),
    y: round(y),
    scale: round(scale),
    clipPath: `inset(${round(inset)}px 0px ${round(inset)}px 0px round ${round(ROW_RADIUS / scale)}px)`,
  };
};

/** The row's box while it is on screen; a row that scrolled away or unmounted gets a plain fade. */
const visibleBox = (element: Element | null): Box | null => {
  if (!element?.isConnected || typeof window === 'undefined') return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/** The card's box at rest: offsets ignore transforms, so this holds even mid-animation. */
const restBox = (card: HTMLElement): Box => {
  const parent = card.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { left: parent.left + card.offsetLeft, top: parent.top + card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
};

const GROW = { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.9 };
const SHRINK = { duration: 0.24, ease: [0.3, 0, 0.2, 1] as const };

/**
 * Grows the card out of `origin` on mount and shrinks it back on exit (inside AnimatePresence).
 * The card renders hidden (`opacity: 0`) and the content fades in once the card has room, so the
 * row turns into a blank card first and its details appear after. Returns refs for both and
 * whether the card is still present (false while it animates out).
 */
export const useGrowFromOrigin = (origin: Element | null) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isPresent, safeToRemove] = usePresence();
  const reduceMotion = useReducedMotion();
  const originRef = useRef(origin);
  originRef.current = origin;

  useLayoutEffect(() => {
    const card = cardRef.current;
    const content = contentRef.current;
    if (!card || !content) return;
    const row = reduceMotion ? null : visibleBox(originRef.current);
    if (!row) {
      animate(card, { opacity: [0, 1], scale: reduceMotion ? 1 : [0.94, 1] }, reduceMotion ? { duration: 0.15 } : GROW);
      return;
    }
    const from = growFrame(restBox(card), row);
    // Set the start frame before the first paint so the card never flashes in its final place.
    card.style.clipPath = from.clipPath;
    content.style.opacity = '0';
    animate(card, { x: [from.x, 0], y: [from.y, 0], scale: [from.scale, 1], clipPath: [from.clipPath, FULL_CLIP] }, GROW)
      .then(() => {
        if (cardRef.current) cardRef.current.style.clipPath = '';
      });
    animate(card, { opacity: [0.4, 1] }, { duration: 0.12 });
    animate(content, { opacity: [0, 1] }, { duration: 0.18, delay: 0.08 });
    // Measured once on mount: the start frame depends on the first layout only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isPresent) return;
    const card = cardRef.current;
    const content = contentRef.current;
    if (!card || !content) {
      safeToRemove?.();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      safeToRemove?.();
    };
    // In case an animation never settles (tab hidden), the card still leaves.
    const fallback = window.setTimeout(finish, 600);
    const row = reduceMotion ? null : visibleBox(originRef.current);
    if (!row) {
      animate(card, { opacity: 0, scale: reduceMotion ? 1 : 0.96 }, { duration: 0.15 }).then(finish);
      return () => window.clearTimeout(fallback);
    }
    const to = growFrame(restBox(card), row);
    if (!card.style.clipPath) card.style.clipPath = FULL_CLIP;
    animate(content, { opacity: 0 }, { duration: 0.08 });
    animate(card, { x: to.x, y: to.y, scale: to.scale, clipPath: to.clipPath }, SHRINK).then(finish);
    animate(card, { opacity: 0 }, { duration: 0.1, delay: 0.14 });
    return () => window.clearTimeout(fallback);
  }, [isPresent, safeToRemove, reduceMotion]);

  return { cardRef, contentRef, isPresent };
};
