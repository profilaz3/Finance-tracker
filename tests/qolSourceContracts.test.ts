import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../constants';

const readSource = (path: string) => readFileSync(path, 'utf8');

describe('QOL source contracts', () => {
  it('wires Home quick add and the Add sheet template shortcuts through the app router', () => {
    const router = readSource('components/app/AppViewRouter.tsx');
    const addSheet = readSource('components/app/AddSheet.tsx');

    expect(addSheet).toContain('selectDashboardTemplates');
    expect(addSheet).toContain('onUseTemplate(template.id)');
    expect(router).toContain('useTemplate: handleUseTemplate');
    expect(router).toContain('addEntry: onOpenAdd');
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

    expect(handlers).toContain('restoreTransactions(deletedTransactions');
    expect(handlers).toContain('getTranslations(state.language).batchRestored');
    expect(TRANSLATIONS.en.batchRestored).toBe('Batch restored');
  });
});
