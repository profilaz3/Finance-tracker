import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('toast contracts', () => {
  it('uses collision-free ids and a stable addToast', () => {
    const hook = readFileSync('hooks/useToasts.ts', 'utf8');
    const app = readFileSync('App.tsx', 'utf8');

    expect(hook).toContain('crypto.randomUUID()');
    expect(hook).not.toContain('Date.now()');
    expect(hook).toContain('const addToast = useCallback<AddToast>');
    expect(hook).toContain('const dismissToast = useCallback(');
    expect(hook).toContain('useMemo(() => ({ toasts, addToast, dismissToast })');
    expect(app).toContain('useToasts()');
    expect(app).not.toContain('toast-${Date.now()}');
  });

  it('animates the toast countdown with CSS instead of a state interval', () => {
    const toast = readFileSync('components/Toast.tsx', 'utf8');

    expect(toast).not.toContain('setInterval');
    expect(toast).toContain('toast-progress');
  });

  it('memoizes the confirm dialog context value', () => {
    const confirmDialog = readFileSync('components/ConfirmDialog.tsx', 'utf8');

    expect(confirmDialog).toContain('const contextValue = useMemo(() => ({ confirm }), [confirm]);');
    expect(confirmDialog).not.toContain('value={{ confirm }}');
  });
});
