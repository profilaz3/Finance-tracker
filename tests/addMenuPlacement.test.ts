import { describe, expect, it } from 'vitest';
import { placeAddMenu, type AnchorRect } from '../components/app/addMenuPlacement';

const rect = (left: number, top: number, width: number, height: number): AnchorRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe('placeAddMenu', () => {
  const phone = { width: 390, height: 844 };
  // The mobile + sits right of the tab bar, 12px above the bottom edge.
  const navPlus = rect(317, 770, 62, 62);

  it('rises above the mobile + and lines up with its right edge', () => {
    const placement = placeAddMenu(navPlus, phone);
    expect(placement).toEqual({
      direction: 'up',
      right: 11,
      bottom: 86,
      width: 363,
      maxHeight: 742,
      fab: navPlus,
    });
  });

  it('lifts above an on-screen keyboard that covers the + button', () => {
    const placement = placeAddMenu(navPlus, phone, 320);
    expect(placement.direction).toBe('up');
    if (placement.direction !== 'up') return;
    expect(placement.bottom).toBe(332);
    expect(placement.maxHeight).toBe(844 - 332 - 16);
  });

  it('drops below a wide button near the top and draws no round close button', () => {
    const desktop = { width: 1280, height: 800 };
    const sidebarAdd = rect(16, 72, 188, 44);
    expect(placeAddMenu(sidebarAdd, desktop)).toEqual({
      direction: 'down',
      left: 16,
      top: 124,
      width: 380,
      maxHeight: 800 - 124 - 16,
    });
  });

  it('keeps a dropped menu inside a narrow viewport', () => {
    const placement = placeAddMenu(rect(300, 40, 80, 40), { width: 360, height: 640 });
    expect(placement).toMatchObject({ direction: 'down', left: 16, width: 328 });
  });

  it('only treats round buttons as the + to cover', () => {
    const wide = placeAddMenu(rect(200, 700, 160, 48), phone);
    expect(wide).toMatchObject({ direction: 'up', fab: null });
  });

  it('falls back to the bottom right corner without an anchor', () => {
    expect(placeAddMenu(null, phone)).toMatchObject({ direction: 'up', right: 16, bottom: 16, fab: null });
  });
});
