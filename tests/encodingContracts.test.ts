import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
] as const;

const EXPECTED_TRANSLITERATIONS: Record<string, string[]> = {
  'components/ExportModal.tsx': [
    'Prilagodeni period',
    'Ukljuci podatke o eventima',
    'Otkazi',
  ],
  'utils/transactionFilters.ts': [
    'Juce',
  ],
  'components/transactions/TransactionsToolbar.tsx': [
    'Pretrazi transakcije...',
  ],
  'components/transactions/TransactionsList.tsx': [
    'Dodajte prvu transakciju da biste poceli sa pracenjem',
  ],
  'components/settings/DataSettings.tsx': [
    'Ponavljajuce transakcije',
    'Mesecno',
    'Godisnje',
    'Trosak',
    'Racun',
    'Pocinje',
    'Otkazi',
    'Nema ponavljajucih transakcija',
    'Dodajte pretplate ili redovne racune',
  ],
  'components/settings/AccountSettings.tsx': [
    'Da li ste sigurni da zelite da obrisete nalog? Ova radnja se ne moze ponistiti.',
    'Obrisi nalog',
  ],
  'components/settings/useSettingsViewState.tsx': [
    'Novcanici',
  ],
  'components/ReceiptScanModal.tsx': [
    'Greska pri snimanju',
    'Greska pri ucitavanju',
    'Nije moguce procitati racun. Pokusajte ponovo.',
    'Serverski AI kljuc nije ispravno podesen',
    'Previse zahteva. Sacekajte malo.',
    'Greska u mrezi. Proverite internet.',
    'Greska pri skeniranju. Pokusajte ponovo.',
    'Ucitavanje slike...',
    'Ucitavanje...',
    'Dodaj sliku racuna',
    'Dodaj Sliku Racuna',
  ],
  'utils/recurringUtils.ts': [
    'Mesecno',
    'Godisnje',
  ],
  'scripts/cleanup-recurring-regressions.mjs': [
    'podesavanja',
  ],
  'scripts/recurring-regression.mjs': [
    'podesavanja',
    'dodaj ponavljajucu transakciju',
  ],
};

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

  it('keeps Serbian UI strings in the established ASCII transliteration style', () => {
    for (const [filePath, expectedStrings] of Object.entries(EXPECTED_TRANSLITERATIONS)) {
      const source = readSource(filePath);

      for (const expectedString of expectedStrings) {
        expect(source, `${filePath} should contain ${expectedString}`).toContain(expectedString);
      }
    }
  });
});
