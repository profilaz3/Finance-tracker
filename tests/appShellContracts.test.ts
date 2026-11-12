import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(path, 'utf8');

const readUseMemoObject = (source: string, constName: string) => {
  const match = source.match(
    new RegExp(`const\\s+${constName}\\s*=\\s*useMemo\\(\\s*\\(\\)\\s*=>\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)\\s*,\\s*\\[([^\\]]*)\\]\\s*\\)\\s*;`)
  );

  expect(match, `${constName} should be a useMemo object with explicit dependencies`).not.toBeNull();

  return {
    body: match?.[1] ?? '',
    dependencies: (match?.[2] ?? '')
      .split(',')
      .map(dependency => dependency.trim())
      .filter(Boolean),
  };
};

describe('app shell contracts', () => {
  it('closes every app shell modal when closeAllModals runs', () => {
    const modals = readSource('hooks/useModals.ts');
    const closeAllModalsBody = modals.match(/const closeAllModals = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/)?.[1] ?? '';

    [
      'setIsEditModalOpen(false)',
      'setIsReceiptModalOpen(false)',
      'setIsSplitModalOpen(false)',
      'setIsAddPersonModalOpen(false)',
      'setIsEventCreationModalOpen(false)',
      'setIsReceiptScanModalOpen(false)',
      'setIsSplitExpenseModalOpen(false)',
      'setIsUserProfileModalOpen(false)',
    ].forEach(call => {
      expect(closeAllModalsBody).toContain(call);
    });
  });

  it('uses dependency-aware keyboard shortcut handlers in App.tsx', () => {
    const app = readSource('App.tsx');
    const shortcutHandlers = readUseMemoObject(app, 'shortcutHandlers');

    expect(app).not.toMatch(/useKeyboardShortcuts\(\s*useMemo\(\s*\(\)\s*=>\s*\(\{[\s\S]*?\}\)\s*,\s*\[\s*\]\s*\)\s*\)/);
    expect(app).toContain('const handleOpenAddTransaction = useCallback(');
    expect(app).toContain('useKeyboardShortcuts(shortcutHandlers);');
    expect(shortcutHandlers.body).toMatch(/\bonNewTransaction\s*:\s*\(\)\s*=>\s*handleOpenAddTransaction\(\s*\)/);
    expect(shortcutHandlers.body).toMatch(/\bonEscape\s*:\s*\(\)\s*=>\s*modals\.closeAllModals\(\s*\)/);
    expect(shortcutHandlers.dependencies).toEqual(
      expect.arrayContaining(['handleOpenAddTransaction', 'modals.closeAllModals'])
    );
  });

  it('labels mobile app navigation controls for assistive tech and tooltips', () => {
    const navigation = readSource('components/app/AppNavigation.tsx');
    const bottomNavItem = navigation.match(/const BottomNavItem:[\s\S]*?\n};/)?.[0] ?? '';

    expect(bottomNavItem).toContain('aria-label={label}');
    expect(bottomNavItem).toContain('title={label}');
    [
      ['dashboard', 'LayoutDashboardIcon'],
      ['transactions', 'ListIcon'],
      ['events', 'MapPinIcon'],
      ['calendar', 'CalendarIcon'],
      ['analytics', 'PieChartIcon'],
      ['insights', 'SparklesIcon'],
      ['settings', 'SettingsIcon'],
    ].forEach(([view, icon]) => {
      expect(navigation).toContain(
        `<BottomNavItem view="${view}" icon={${icon}} label={labels.${view}} currentView={currentView} onNavigate={onNavigate} />`
      );
    });
  });
});
