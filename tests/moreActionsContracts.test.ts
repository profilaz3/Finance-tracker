import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('long-press actions have a visible, keyboard-reachable alternative', () => {
  it.each(['components/TransactionItem.tsx', 'components/event-detail/ExpensesList.tsx'])(
    '%s renders a labelled "more actions" button and a menu',
    (path) => {
      const source = read(path);
      expect(source).toContain('aria-label={t.moreActions}');
      expect(source).toContain('aria-haspopup="menu"');
      expect(source).toContain('role="menu"');
      expect(source).toContain('role="menuitem"');
      expect(source).toContain('opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100');
      expect(source).toContain('useEscapeKey(');
    }
  );

  it('person cards open from a real button, so Enter and Space work', () => {
    const source = read('components/PeopleView.tsx');
    expect(source).toContain('<button type="button" onClick={onOpen}');
    expect(source).not.toContain('role="button"');
  });

  it('hover-revealed controls also appear on keyboard focus', () => {
    const files = [
      'components/PersonDetail.tsx',
      'components/event-detail/EventHeader.tsx',
      'components/CategorySettings.tsx',
      'components/EventCreationModal.tsx',
      'components/ReceiptScanModal.tsx',
      'components/AddPersonModal.tsx',
      'components/PeopleView.tsx',
    ];
    for (const file of files) {
      const lines = read(file).split('\n').filter(line => line.includes('sm:group-hover:opacity-100'));
      for (const line of lines) {
        expect(line, file).toMatch(/focus-visible:opacity-100|focus-within:opacity-100/);
      }
    }
  });

  it('adds the moreActions string to both languages', () => {
    const constants = read('constants.ts');
    expect(constants).toContain("moreActions: 'More actions'");
    expect(constants).toContain("moreActions: 'Više opcija'");
  });
});
