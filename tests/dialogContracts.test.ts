import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const DIALOG_COMPONENTS = [
  'components/AddPersonModal.tsx',
  'components/EventCreationModal.tsx',
  'components/ExportModal.tsx',
  'components/ImagePickerSheet.tsx',
  'components/PersonDetail.tsx',
  'components/transaction-details/TransactionDetailsSheet.tsx',
  'components/ReceiptScanModal.tsx',
  'components/ShareEventModal.tsx',
  'components/SharedExpenseModal.tsx',
  'components/SplitModal.tsx',
  'components/split-expense/SplitExpenseModal.tsx',
  'components/ConfirmDialog.tsx',
];

describe('dialog semantics', () => {
  it.each(DIALOG_COMPONENTS)('%s uses useDialog and labels the panel by its heading', (path) => {
    const source = read(path);
    expect(source).toContain('useDialog(');
    expect(source).toContain('{...dialogProps}');
    expect(source).toContain('id={titleId}');
  });

  it('useDialog wires role, aria-modal, aria-labelledby, focus trap and Escape', () => {
    const source = read('hooks/useFocusTrap.ts');
    expect(source).toContain("role: 'dialog'");
    expect(source).toContain("'aria-modal': true");
    expect(source).toContain("'aria-labelledby': titleId");
    expect(source).toContain('useFocusTrap(isOpen');
    expect(source).toContain('useEscapeKey(onClose');
  });

  it('confirm dialogs are alertdialogs that default to Cancel for destructive actions', () => {
    const source = read('components/ConfirmDialog.tsx');
    expect(source).toContain('role="alertdialog"');
    expect(source).toContain('autoFocus={isDanger}');
    expect(source).not.toContain('"flex-1 py-3 text-on-primary');
    expect(source).toContain("buttonText: 'text-on-error'");
  });
});
