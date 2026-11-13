import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

// One delete pattern: single items are removed with an Undo toast, cascading or
// account-level deletes ask first through ConfirmDialog. No native window.confirm.
describe('delete confirmation pattern', () => {
  it.each([
    'components/CategorySettings.tsx',
    'components/AccountItem.tsx',
    'components/PersonDetail.tsx',
    'components/event-detail/EventHeader.tsx',
    'components/event-detail/ExpensesList.tsx',
    'components/settings/AccountSettings.tsx',
    'hooks/useEventHandlers.ts',
    'hooks/usePeopleHandlers.ts',
  ])('%s does not use window.confirm', (path) => {
    expect(read(path)).not.toContain('window.confirm');
  });

  it.each([
    ['components/AccountItem.tsx', 't.deleteWalletTitle'],
    ['components/PersonDetail.tsx', 't.deletePersonTitle'],
    ['components/event-detail/EventHeader.tsx', 't.deleteEventTitle'],
    ['components/settings/AccountSettings.tsx', 't.deleteUserAccountTitle'],
  ])('%s confirms the cascading delete with ConfirmDialog', (path, titleKey) => {
    const source = read(path);
    expect(source).toContain('<ConfirmDialog');
    expect(source).toContain('type="danger"');
    expect(source).toContain(`title={${titleKey}}`);
  });

  it('single-item category and shared expense deletes offer Undo', () => {
    const people = read('hooks/usePeopleHandlers.ts');
    expect(people).toContain('addToast(t.categoryDeleted');
    expect(people).toContain('syncManager.syncCategory(deleted)');

    const events = read('hooks/useEventHandlers.ts');
    expect(events).toContain('addToast(t.sharedExpenseDeleted');
    expect(events).toContain('syncManager.syncSharedExpense(deleted)');
  });

  it('the standalone ConfirmDialog is portalled and stops backdrop clicks from reaching parent modals', () => {
    const source = read('components/ConfirmDialog.tsx');
    expect(source).toContain('return createPortal(');
    expect(source).toContain('onClick={(e) => { e.stopPropagation(); onCancel(); }}');
  });
});
