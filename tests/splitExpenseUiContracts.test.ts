import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('split expense UI contracts', () => {
  it('does not keep a separate myPortion prop on the form', () => {
    const types = readFileSync('components/split-expense/types.ts', 'utf8');
    const form = readFileSync('components/split-expense/useSplitForm.ts', 'utf8');

    expect(types).not.toContain('myPortion: string;');
    expect(types).not.toContain('setMyPortion');
    expect(form).not.toContain('setMyPortion');
  });

  it('keeps the category, wallet and date behind "I paid" only', () => {
    const modal = readFileSync('components/split-expense/SplitExpenseModal.tsx', 'utf8');

    expect(modal).toMatch(/\{iPaid\s*\?\s*<SplitDetails/);
    expect(modal).toContain('{s.debtOnly}');
  });

  it('does not keep the old per-recipient amounts for "someone paid"', () => {
    const modal = readFileSync('components/split-expense/SplitExpenseModal.tsx', 'utf8');
    const types = readFileSync('components/split-expense/types.ts', 'utf8');

    expect(modal).not.toContain('recipients={');
    expect(types).not.toContain('Recipient');
  });

  it('marks split picker avatars as decorative so labels are not announced twice', () => {
    const people = readFileSync('components/split-expense/SplitPeople.tsx', 'utf8');
    const hero = readFileSync('components/split-expense/SplitHero.tsx', 'utf8');

    expect(people).not.toContain('alt={person.name}');
    expect(hero).not.toContain('alt={person.name}');
    expect(people).toContain('aria-hidden="true"');
    expect(hero).toContain('aria-hidden="true"');
  });

  it('marks shared expense avatars as decorative so picker labels stay clean', () => {
    const sharedExpenseModal = readFileSync('components/SharedExpenseModal.tsx', 'utf8');

    expect(sharedExpenseModal).not.toContain('alt={person.name}');
    expect(sharedExpenseModal).toContain('aria-hidden="true"');
  });
});
