import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('split expense UI contracts', () => {
  it('does not keep a separate myPortion prop in CommonFields', () => {
    const commonFields = readFileSync('components/split-expense/CommonFields.tsx', 'utf8');
    const types = readFileSync('components/split-expense/types.ts', 'utf8');

    expect(commonFields).not.toContain('myPortion');
    expect(commonFields).not.toContain('setMyPortion');
    expect(types).not.toContain('myPortion: string;');
    expect(types).not.toContain('setMyPortion: (val: string) => void;');
  });

  it('keeps note, category, and account fields behind i_paid mode only', () => {
    const commonFields = readFileSync('components/split-expense/CommonFields.tsx', 'utf8');

    expect(commonFields).toContain('{t.currency}');
    const noteIndex = commonFields.indexOf('{t.note}');
    const categoryIndex = commonFields.indexOf('{t.category}');
    const accountIndex = commonFields.indexOf('{t.account}');
    const gateIndex = commonFields.lastIndexOf("{mode === 'i_paid' && (", noteIndex);

    expect(noteIndex).toBeGreaterThan(-1);
    expect(categoryIndex).toBeGreaterThan(noteIndex);
    expect(accountIndex).toBeGreaterThan(categoryIndex);
    expect(gateIndex).toBeGreaterThan(-1);
  });

  it('does not pass an unused recipients prop into TheyPaidSection', () => {
    const modal = readFileSync('components/split-expense/SplitExpenseModal.tsx', 'utf8');
    const section = readFileSync('components/split-expense/TheyPaidSection.tsx', 'utf8');
    const types = readFileSync('components/split-expense/types.ts', 'utf8');

    expect(modal).not.toContain('recipients={recipients}');
    expect(section).not.toContain('recipients,');
    expect(types).not.toContain('recipients: Recipient[];');
  });

  it('marks split picker avatars as decorative so labels are not announced twice', () => {
    const iPaidSection = readFileSync('components/split-expense/IPaidSection.tsx', 'utf8');
    const theyPaidSection = readFileSync('components/split-expense/TheyPaidSection.tsx', 'utf8');

    expect(iPaidSection).not.toContain('alt={person.name}');
    expect(theyPaidSection).not.toContain('alt={person.name}');
    expect(iPaidSection).toContain('aria-hidden="true"');
    expect(theyPaidSection).toContain('aria-hidden="true"');
  });

  it('marks shared expense avatars as decorative so picker labels stay clean', () => {
    const sharedExpenseModal = readFileSync('components/SharedExpenseModal.tsx', 'utf8');

    expect(sharedExpenseModal).not.toContain('alt={person.name}');
    expect(sharedExpenseModal).toContain('aria-hidden="true"');
  });
});
