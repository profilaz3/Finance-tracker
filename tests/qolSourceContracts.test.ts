import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(path, 'utf8');

describe('QOL source contracts', () => {
  it('wires dashboard quick actions, template shortcuts, and repeat handler through the app router', () => {
    const dashboard = readSource('components/DashboardView.tsx');
    const router = readSource('components/app/AppViewRouter.tsx');

    expect(dashboard).toContain('DashboardQuickActions');
    expect(dashboard).toContain('DashboardTemplateShortcuts');
    expect(dashboard).toContain('getRepeatLastCandidate');
    expect(dashboard).toContain('selectDashboardTemplates');
    expect(dashboard).toContain('onRepeatTransaction?: (transaction: Transaction) => void');

    expect(router).toContain('createRepeatTransactionDraft');
    expect(router).toContain('onRepeatTransaction={(transaction) => {');
    expect(router).toContain('const incomeDraft = createTransactionDraft');
    expect(router).toContain('eventId ? { ...incomeDraft, eventId } : incomeDraft');
  });

  it('wires transaction common filters and duplicate hints into the transactions view', () => {
    const transactionsView = readSource('components/TransactionsView.tsx');
    const toolbar = readSource('components/transactions/TransactionsToolbar.tsx');

    expect(transactionsView).toContain('detectDuplicateTransactionGroups');
    expect(transactionsView).toContain('getCommonTransactionFilters');
    expect(transactionsView).toContain('DuplicateHintBanner');
    expect(transactionsView).toContain('filterCategory');

    expect(toolbar).toContain('CommonFilterChips');
    expect(toolbar).toContain('commonFilters');
    expect(toolbar).toContain('activeCommonFilterIds');
  });

  it('adds batch-delete safety summary and safe undo action', () => {
    const transactionsView = readSource('components/TransactionsView.tsx');
    const handlers = readSource('hooks/useTransactionHandlers.ts');

    expect(transactionsView).toContain('batchDeleteSafetySummary');
    expect(transactionsView).toContain('safeToUndoCount');
    expect(transactionsView).toContain('unsafeCount');

    expect(handlers).toContain('restoreBatchDeletedTransactions');
    expect(handlers).toContain('canUndoBatchDelete');
    expect(handlers).toContain('Batch restored');
  });
});
