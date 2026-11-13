import { describe, expect, it } from 'vitest';
import { planHistorySync } from '../hooks/useBackNavigation';

const entry = (view: 'dashboard' | 'transactions' | 'settings', depth: number) =>
  ({ financeNav: true as const, view, depth });

describe('planHistorySync', () => {
  it('adopts a foreign or empty history entry by replacing it', () => {
    expect(planHistorySync(null, entry('dashboard', 0))).toEqual({ type: 'replace', entry: entry('dashboard', 0) });
    expect(planHistorySync({ other: 1 }, entry('dashboard', 0)).type).toBe('replace');
  });

  it('does nothing when history already matches the screen', () => {
    expect(planHistorySync(entry('transactions', 1), entry('transactions', 1))).toEqual({ type: 'none' });
  });

  it('pushes one entry per view change', () => {
    expect(planHistorySync(entry('dashboard', 0), entry('transactions', 0))).toEqual({
      type: 'push',
      entries: [entry('transactions', 0)],
    });
  });

  it('pushes one entry per opened overlay so Back closes them one at a time', () => {
    expect(planHistorySync(entry('dashboard', 0), entry('dashboard', 2))).toEqual({
      type: 'push',
      entries: [entry('dashboard', 1), entry('dashboard', 2)],
    });
  });

  it('consumes history entries when overlays are closed from the UI', () => {
    expect(planHistorySync(entry('settings', 2), entry('settings', 0))).toEqual({ type: 'back', steps: 2 });
  });

  it('pushes instead of going back when the view changed at the same time', () => {
    // Navigating away also closes the person sheet; keep the new view reachable.
    expect(planHistorySync(entry('dashboard', 1), entry('settings', 0))).toEqual({
      type: 'push',
      entries: [entry('settings', 0)],
    });
  });
});
