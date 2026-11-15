/**
 * Where the Add menu sits. It grows out of the button that opened it: from a button in the lower
 * half of the screen (the mobile + next to the tab bar, the desktop corner +) the ways to add rise
 * above it, right-aligned with it; from a button near the top (the desktop sidebar "Add entry")
 * they drop below it as a small card.
 */

export interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type AddMenuPlacement =
  | {
      direction: 'up';
      right: number;
      bottom: number;
      width: number;
      maxHeight: number;
      /** The round + it rose from: the menu draws its close button over it. */
      fab: AnchorRect | null;
    }
  | { direction: 'down'; left: number; top: number; width: number; maxHeight: number };

const GUTTER = 16;
const GAP = 12;
const UP_MAX_WIDTH = 400;
const DOWN_WIDTH = 380;
/** A round button: about square and no wider than the 62px nav +. */
const isRoundButton = (rect: AnchorRect) => Math.abs(rect.width - rect.height) < 4 && rect.width <= 72;

/**
 * @param keyboard Height of the on-screen keyboard over the layout viewport (0 when closed or
 *   when the page resizes for it instead).
 */
export const placeAddMenu = (
  rect: AnchorRect | null,
  viewport: { width: number; height: number },
  keyboard = 0,
): AddMenuPlacement => {
  const { width: vw, height: vh } = viewport;
  if (!rect || rect.top + rect.height / 2 > vh / 2) {
    const right = rect ? Math.max(8, Math.round(vw - rect.right)) : GUTTER;
    const bottom = Math.max(rect ? Math.round(vh - rect.top + GAP) : GUTTER, keyboard + GAP);
    return {
      direction: 'up',
      right,
      bottom,
      width: Math.max(0, Math.min(UP_MAX_WIDTH, vw - right - GUTTER)),
      maxHeight: Math.max(0, vh - bottom - GUTTER),
      fab: rect && isRoundButton(rect) ? rect : null,
    };
  }
  const width = Math.min(DOWN_WIDTH, vw - GUTTER * 2);
  const top = Math.round(rect.bottom + 8);
  return {
    direction: 'down',
    left: Math.round(Math.min(Math.max(rect.left, GUTTER), vw - width - GUTTER)),
    top,
    width,
    maxHeight: Math.max(0, vh - top - GUTTER - keyboard),
  };
};

/** The button to grow from: the one that was tapped, else whichever Add button is on screen. */
export const findAddTrigger = (anchor: HTMLElement | null): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  const candidates = [anchor, ...Array.from(document.querySelectorAll<HTMLElement>('[data-add-trigger]'))];
  return candidates.find((el): el is HTMLElement => !!el && el.isConnected && el.getClientRects().length > 0) ?? null;
};
