import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldIgnoreSwipeStart } from '../utils/swipeGuard';

// Minimal Element stand-in: the guard only uses closest, parentElement, scrollWidth,
// clientWidth and getComputedStyle(overflowX).
class FakeElement {
  parentElement: FakeElement | null = null;
  scrollWidth = 100;
  clientWidth = 100;
  overflowX = 'visible';
  constructor(private readonly matches: string[] = []) {}
  closest(selector: string): FakeElement | null {
    const selectors = selector.split(',').map(part => part.trim());
    for (let el: FakeElement | null = this; el; el = el.parentElement) {
      if (el.matches.some(match => selectors.includes(match))) return el;
    }
    return null;
  }
}

const chain = (...elements: FakeElement[]) => {
  for (let index = 0; index < elements.length - 1; index += 1) {
    elements[index].parentElement = elements[index + 1];
  }
  return elements;
};

describe('shouldIgnoreSwipeStart', () => {
  beforeEach(() => {
    vi.stubGlobal('Element', FakeElement);
    vi.stubGlobal('window', {
      getComputedStyle: (element: FakeElement) => ({ overflowX: element.overflowX }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows swipes on ordinary content', () => {
    const [target, , root] = chain(new FakeElement(), new FakeElement(), new FakeElement());
    expect(shouldIgnoreSwipeStart(target as unknown as Element, root as unknown as Element)).toBe(false);
  });

  it('ignores swipes inside opted-out regions, charts and form controls', () => {
    const [chart, , root] = chain(new FakeElement(), new FakeElement(['[data-no-swipe]']), new FakeElement());
    expect(shouldIgnoreSwipeStart(chart as unknown as Element, root as unknown as Element)).toBe(true);

    const [slider, , root2] = chain(new FakeElement(['input']), new FakeElement(), new FakeElement());
    expect(shouldIgnoreSwipeStart(slider as unknown as Element, root2 as unknown as Element)).toBe(true);
  });

  it('ignores swipes that start in a horizontally scrollable row', () => {
    const row = new FakeElement();
    row.overflowX = 'auto';
    row.scrollWidth = 400;
    row.clientWidth = 300;
    const [chip, , root] = chain(new FakeElement(), row, new FakeElement());
    expect(shouldIgnoreSwipeStart(chip as unknown as Element, root as unknown as Element)).toBe(true);
  });

  it('does not treat a row that fits as scrollable', () => {
    const row = new FakeElement();
    row.overflowX = 'auto';
    const [chip, , root] = chain(new FakeElement(), row, new FakeElement());
    expect(shouldIgnoreSwipeStart(chip as unknown as Element, root as unknown as Element)).toBe(false);
  });

  it('is wired into the main swipe handler', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const pager = readFileSync('hooks/useSwipePager.ts', 'utf8');
    expect(pager).toContain('shouldIgnoreSwipeStart(event.target, opts.getRoot?.() ?? null)');
    expect(app).toContain('getRoot: () => mainRef.current');
    expect(app).toContain('{...swipeHandlers}');
  });
});
