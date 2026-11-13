import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../constants';

const SOURCE_FILES = [
  'constants.ts',
  'components/settings/DataSettings.tsx',
  'components/settings/AccountSettings.tsx',
  'components/settings/useSettingsViewState.tsx',
  'components/ReceiptScanModal.tsx',
  'utils/recurringUtils.ts',
  'components/ExportModal.tsx',
  'components/transactions/TransactionsToolbar.tsx',
  'components/transactions/TransactionsList.tsx',
  'utils/transactionFilters.ts',
  'scripts/cleanup-recurring-regressions.mjs',
  'scripts/recurring-regression.mjs',
  'scripts/transaction-crud-regression.mjs',
  'components/AuthView.tsx',
  'hooks/usePasswordRecovery.ts',
  'utils/authValidation.ts',
  'utils/formatters.ts',
  'utils/locale.ts',
] as const;

const readSource = (filePath: string): string =>
  readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');

describe('encoding contracts', () => {
  it('keeps guarded source files free of mojibake markers', () => {
    const offenders = SOURCE_FILES.flatMap((filePath) => {
      const source = readSource(filePath);
      return source
        .split(/\r?\n/)
        .flatMap((line, index) => {
          const hasMojibake = /[\u00c2-\u00c5\u00e2\uFFFD]/u.test(line);
          const hasC1Control = /[\u0080-\u009f]/u.test(line);

          return hasMojibake || hasC1Control
            ? [`${filePath}:${index + 1}: ${line.trim()}`]
            : [];
        });
    });

    expect(offenders).toEqual([]);
  });

  it('keeps Serbian translations in Latin script with real diacritics', () => {
    const offenders = Object.entries(TRANSLATIONS.sr).flatMap(([key, value]) => {
      const text = String(value);
      const hasCyrillic = /[\u0400-\u04ff]/u.test(text);
      const hasMojibake = /[\u00c2-\u00c5\u00e2\uFFFD\u0080-\u009f]/u.test(text);
      return hasCyrillic || hasMojibake ? [`${key}: ${text}`] : [];
    });

    expect(offenders).toEqual([]);
    expect(TRANSLATIONS.sr.addRecurringTransaction).toBe('Dodaj ponavljajuću transakciju');
    expect(TRANSLATIONS.sr.deleteRecurring).toBe('Obriši ponavljanje');
    expect(TRANSLATIONS.sr.backToEvents).toBe('Nazad na događaje');
  });
});
