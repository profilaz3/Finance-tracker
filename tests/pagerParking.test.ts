import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Swipe neighbours are mounted ahead of time ("parked") so a swipe only reveals them.
// These guard the parts that keep hidden pages invisible, unreachable and cheap.
describe('pager parking contracts', () => {
  const router = readFileSync('components/app/AppViewRouter.tsx', 'utf8');
  const app = readFileSync('App.tsx', 'utf8');
  const css = readFileSync('src/theme.css', 'utf8');

  it('hides parked pages without adding scroll range', () => {
    const rule = css.slice(css.indexOf('[data-pager-park]:not([data-pager-peek]) {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('visibility: hidden');
    expect(body).toContain('height: 0');
    expect(body).toContain('overflow: clip');
  });

  it('keeps non-current pages out of focus order and the accessibility tree', () => {
    expect(router).toContain("aria-hidden={role === 'current' ? undefined : true}");
    expect(router).toContain("inert={role === 'current' ? undefined : true}");
    expect(router).toContain("data-pager-park={role === 'parked' ? view : undefined}");
  });

  it('defers updates to parked pages and parks in transitions', () => {
    expect(router).toContain('useDeferredValue(content)');
    expect(router).toContain('startTransition(() => setParked(next))');
  });

  it('parks only on phones, without reduced motion, once the app is idle', () => {
    expect(app).toContain("matchMedia?.('(min-width: 768px), (prefers-reduced-motion: reduce)')");
    expect(app).toContain('requestIdleCallback(run');
    expect(app).toContain('peekControlRef.current?.park(');
  });
});
