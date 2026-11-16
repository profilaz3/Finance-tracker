/** Keyboard shortcut copy. Lives with the lazy shortcuts chunk, not the startup translation table. */
export interface ShortcutStrings {
  title: string;
  intro: string;
  close: string;
  groupGeneral: string;
  groupGo: string;
  groupActivity: string;
  newEntry: string;
  addMenu: string;
  search: string;
  help: string;
  closeOpen: string;
  nextPrevious: string;
  edit: string;
}

export const SHORTCUT_STRINGS: Record<'en' | 'sr', ShortcutStrings> = {
  en: {
    title: 'Keyboard shortcuts',
    intro: 'They work anywhere outside a text field.',
    close: 'Close',
    groupGeneral: 'Anywhere',
    groupGo: 'Go to',
    groupActivity: 'Beside a list',
    newEntry: 'New expense',
    addMenu: 'Add menu (income, transfer, scan, split)',
    search: 'Search',
    help: 'This list',
    closeOpen: 'Close what is open',
    nextPrevious: 'Next or previous entry in Activity',
    edit: 'Edit what is open beside the list',
  },
  sr: {
    title: 'Prečice na tastaturi',
    intro: 'Rade svuda osim u polju za tekst.',
    close: 'Zatvori',
    groupGeneral: 'Svuda',
    groupGo: 'Idi na',
    groupActivity: 'Pored liste',
    newEntry: 'Novi trošak',
    addMenu: 'Meni za dodavanje (prihod, prenos, skeniranje, podela)',
    search: 'Pretraga',
    help: 'Ova lista',
    closeOpen: 'Zatvori ono što je otvoreno',
    nextPrevious: 'Sledeći ili prethodni unos u Aktivnosti',
    edit: 'Izmeni ono što je otvoreno pored liste',
  },
};
