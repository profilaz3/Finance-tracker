import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('edge-to-edge safe areas (M32)', () => {
  it('lets the Android WebView draw behind system bars and expose CSS insets', () => {
    const config = read('capacitor.config.ts');
    expect(config).toContain('SystemBars');
    expect(config).toContain("insetsHandling: 'css'");
    expect(config).toContain("initialViewportFitValueHint: 'cover'");
    expect(read('index.html')).toContain('viewport-fit=cover');
  });

  it('pads modal overlays with the safe-area utility instead of a flat p-4', () => {
    expect(read('src/theme.css')).toContain('@utility modal-safe-area');
    [
      'components/ConfirmDialog.tsx',
      'components/EditTransactionModal.tsx',
      'components/AddPersonModal.tsx',
      'components/ExportModal.tsx',
      'components/split-expense/SplitExpenseModal.tsx',
    ].forEach(path => {
      const source = read(path);
      expect(source, path).toContain('modal-safe-area');
      expect(source, path).not.toMatch(/fixed inset-0[^"]*\sp-4[\s"]/);
    });
  });

  it('keeps fixed chrome clear of the status bar and gesture bar', () => {
    const navigation = read('components/app/AppNavigation.tsx');
    expect(navigation).toContain('pb-[calc(env(safe-area-inset-bottom)+12px)]');
    expect(navigation).not.toContain('env(safe-area-inset-bottom,20px)');
    expect(read('components/Toast.tsx')).toContain('top-[calc(1rem+env(safe-area-inset-top))]');
    expect(read('components/transactions/TransactionsFab.tsx')).toContain('bottom-[calc(6rem+env(safe-area-inset-bottom))]');
    expect(read('App.tsx')).toContain('h-[env(safe-area-inset-top)] bg-surface');
  });
});

describe('desktop sync status (M33)', () => {
  it('renders the full SyncStatus in the desktop sidebar', () => {
    const navigation = read('components/app/AppNavigation.tsx');
    expect(navigation).toContain('<SyncStatus showDetails placement="above"');
  });

  it('gives the sync button an accessible name, expanded state and Escape to close', () => {
    const syncStatus = read('components/SyncStatus.tsx');
    expect(syncStatus).toContain('aria-label={getLabel()}');
    expect(syncStatus).toContain('aria-expanded=');
    expect(syncStatus).toContain('useEscapeKey(() => setShowPopup(false), isPopupOpen);');
  });
});
