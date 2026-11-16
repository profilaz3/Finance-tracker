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
  paneLabel: string;
  paneEmpty: string;
  paneEmptyHint: string;
  paneKeys: string;
  changeCategory: string;
  changeCategoryHint: string;
  movedOne: string;
  movedFew: string;
  movedMany: string;
  movedNone: string;
  skippedNote: string;
  showTable: string;
  showList: string;
  sortBy: string;
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
    paneLabel: 'Entry details',
    paneEmpty: 'Pick an entry',
    paneEmptyHint: 'Its details, receipt and who owes what show up here.',
    paneKeys: 'Use ↑ and ↓ to go through the list, Esc to close.',
    changeCategory: 'Change category',
    changeCategoryHint: 'Transfers and repayments keep theirs.',
    movedOne: '{count} entry moved to {name}',
    movedFew: '{count} entries moved to {name}',
    movedMany: '{count} entries moved to {name}',
    movedNone: 'Nothing to change',
    skippedNote: '{count} skipped: transfers, repayments or the other kind',
    showTable: 'Show as a table',
    showList: 'Show as a list',
    sortBy: 'Sort by {column}',
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
    paneLabel: 'Detalji unosa',
    paneEmpty: 'Izaberi unos',
    paneEmptyHint: 'Ovde se vide detalji, račun i ko kome duguje.',
    paneKeys: 'Strelicama ↑ i ↓ ideš kroz listu, Esc zatvara.',
    changeCategory: 'Promeni kategoriju',
    changeCategoryHint: 'Prenosi i otplate zadržavaju svoju.',
    movedOne: '{count} unos premešten u {name}',
    movedFew: '{count} unosa premeštena u {name}',
    movedMany: '{count} unosa premešteno u {name}',
    movedNone: 'Nema šta da se promeni',
    skippedNote: 'Preskočeno {count}: prenosi, otplate ili druga vrsta',
    showTable: 'Prikaži kao tabelu',
    showList: 'Prikaži kao listu',
    sortBy: 'Poređaj po: {column}',
  },
};
