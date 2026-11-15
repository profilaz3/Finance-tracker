/**
 * Strings that only the Activity screen uses. They live with its lazy chunk instead of constants.ts
 * so the startup bundle stays in budget (same pattern as components/home/headerStrings.ts).
 */
export interface ActivityStrings {
  spentIn: string;
  moneyIn: string;
  stripLabel: string;
  stripToday: string;
  selectEntries: string;
  exportEntries: string;
  printableReport: string;
  filters: string;
  filtersOn: string;
  quickPicks: string;
  anyWallet: string;
  category: string;
  anyCategory: string;
  dates: string;
  showOne: string;
  showFew: string;
  showMany: string;
  clearAll: string;
  removeFilter: string;
  dupOne: string;
  dupFew: string;
  dupMany: string;
  hide: string;
  search: string;
}

export const ACTIVITY_STRINGS: Record<'en' | 'sr', ActivityStrings> = {
  en: {
    spentIn: 'Spent in {month}',
    moneyIn: 'Money in',
    stripLabel: 'Spending each day this month. Open the calendar',
    stripToday: 'Today',
    selectEntries: 'Select entries',
    exportEntries: 'Export',
    printableReport: 'Printable report',
    filters: 'Filters',
    filtersOn: 'Filters, {count} on',
    quickPicks: 'Quick picks',
    anyWallet: 'Any wallet',
    category: 'Category',
    anyCategory: 'Any category',
    dates: 'Dates',
    showOne: 'Show {count} entry',
    showFew: 'Show {count} entries',
    showMany: 'Show {count} entries',
    clearAll: 'Clear all',
    removeFilter: 'Remove filter: {name}',
    dupOne: '{count} possible duplicate',
    dupFew: '{count} possible duplicates',
    dupMany: '{count} possible duplicates',
    hide: 'Hide',
    search: 'Search',
  },
  sr: {
    spentIn: 'Potrošeno, {month}',
    moneyIn: 'Priliv',
    stripLabel: 'Potrošnja po danima ovog meseca. Otvori kalendar',
    stripToday: 'Danas',
    selectEntries: 'Izaberi unose',
    exportEntries: 'Izvezi',
    printableReport: 'Izveštaj za štampu',
    filters: 'Filteri',
    filtersOn: 'Filteri, uključeno: {count}',
    quickPicks: 'Brzi izbor',
    anyWallet: 'Bilo koji novčanik',
    category: 'Kategorija',
    anyCategory: 'Bilo koja kategorija',
    dates: 'Datumi',
    showOne: 'Prikaži {count} unos',
    showFew: 'Prikaži {count} unosa',
    showMany: 'Prikaži {count} unosa',
    clearAll: 'Obriši sve',
    removeFilter: 'Ukloni filter: {name}',
    dupOne: '{count} mogući duplikat',
    dupFew: '{count} moguća duplikata',
    dupMany: '{count} mogućih duplikata',
    hide: 'Sakrij',
    search: 'Pretraga',
  },
};
