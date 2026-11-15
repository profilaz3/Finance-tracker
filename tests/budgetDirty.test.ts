import { describe, expect, it } from 'vitest';
import { mergeBudgetDraft, sameBudget } from '../utils/budgetLimit';

describe('sameBudget', () => {
  it('treats a missing budget like one with no limits', () => {
    expect(sameBudget(null, { monthly: 0, categoryLimits: {} })).toBe(true);
    expect(sameBudget(undefined, null)).toBe(true);
  });

  it('ignores zero limits and key order', () => {
    expect(sameBudget(
      { monthly: 50000, categoryLimits: { food: 20000, fun: 0, travel: 10000 } },
      { monthly: 50000, categoryLimits: { travel: 10000, food: 20000 } },
    )).toBe(true);
  });

  it('notices a changed, added or removed limit', () => {
    const saved = { monthly: 50000, categoryLimits: { food: 20000 } };
    expect(sameBudget({ monthly: 60000, categoryLimits: { food: 20000 } }, saved)).toBe(false);
    expect(sameBudget({ monthly: 50000, categoryLimits: { food: 25000 } }, saved)).toBe(false);
    expect(sameBudget({ monthly: 50000, categoryLimits: { food: 20000, fun: 5000 } }, saved)).toBe(false);
    expect(sameBudget({ monthly: 50000, categoryLimits: {} }, saved)).toBe(false);
  });
});

describe('mergeBudgetDraft', () => {
  const saved = { monthly: 50000, categoryLimits: { food: 20000, teamTravel: 30000 } };

  it('keeps limits of categories the form did not show', () => {
    expect(mergeBudgetDraft(saved, { monthly: 60000, categoryLimits: { food: 25000 } }, new Set(['food', 'fun'])))
      .toEqual({ monthly: 60000, categoryLimits: { teamTravel: 30000, food: 25000 } });
  });

  it('lets the form remove a limit it showed', () => {
    expect(mergeBudgetDraft(saved, { monthly: 50000, categoryLimits: {} }, new Set(['food'])))
      .toEqual({ monthly: 50000, categoryLimits: { teamTravel: 30000 } });
  });

  it('returns null when nothing is left', () => {
    expect(mergeBudgetDraft(null, { monthly: 0, categoryLimits: {} }, new Set(['food']))).toBeNull();
  });
});
