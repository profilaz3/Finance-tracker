/** Calendar screen copy. Lives with the lazy CalendarView chunk, not the startup translation table. */
interface CalendarStrings {
  spent: string;
  moneyIn: string;
  due: string;
  showList: string;
  chooseMonth: string;
  prevYear: string;
  nextYear: string;
  todayDate: string;
  nothingOnDay: string;
  comingUp: string;
  allBills: string;
  nothingDue: string;
  scheduled: string;
}

export const CALENDAR_STRINGS: Record<'en' | 'sr', CalendarStrings> = {
  en: {
    spent: 'Spent',
    moneyIn: 'In',
    due: 'Due',
    showList: 'Show as list',
    chooseMonth: 'Choose a month, now {month}',
    prevYear: 'Previous year',
    nextYear: 'Next year',
    todayDate: 'Today, {date}',
    nothingOnDay: 'Nothing on this day',
    comingUp: 'Coming up',
    allBills: 'All bills',
    nothingDue: 'Nothing due in the next 30 days',
    scheduled: 'Scheduled',
  },
  sr: {
    spent: 'Potrošeno',
    moneyIn: 'Priliv',
    due: 'Dospeva',
    showList: 'Prikaži kao listu',
    chooseMonth: 'Izaberi mesec, sada {month}',
    prevYear: 'Prethodna godina',
    nextYear: 'Sledeća godina',
    todayDate: 'Danas, {date}',
    nothingOnDay: 'Ništa za ovaj dan',
    comingUp: 'Uskoro',
    allBills: 'Svi računi',
    nothingDue: 'Ništa ne dospeva u narednih 30 dana',
    scheduled: 'Zakazano',
  },
};
