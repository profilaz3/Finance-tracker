/** Shared tab and People page copy. Lives with their lazy chunks, not the startup translation table. */
interface SharedStrings {
  owedToYou: string;
  toNames: string;
  andMore: string;
  moreComing: string;
  moreGoing: string;
  allSquare: string;
  activeOne: string;
  activeFew: string;
  activeMany: string;
  dayOf: string;
  spent: string;
  youreOwed: string;
  allPeople: string;
  earlier: string;
  inEvent: string;
  filterAll: string;
  filterOweYou: string;
  filterYouOwe: string;
  biggestFirst: string;
  aToZ: string;
  sortLabel: string;
  remind: string;
  remindText: string;
  copied: string;
  search: string;
  closeSearch: string;
  youOweThem: string;
  filterBy: string;
  paneLabel: string;
  paneEmpty: string;
  paneEmptyHint: string;
  peoplePaneEmpty: string;
  peoplePaneEmptyHint: string;
}

export const SHARED_STRINGS: Record<'en' | 'sr', SharedStrings> = {
  en: {
    owedToYou: 'Owed to you',
    toNames: 'to {names}',
    andMore: '{names} and {count} more',
    moreComing: 'About {amount} more coming to you',
    moreGoing: 'About {amount} more going out',
    allSquare: 'All square',
    activeOne: '{count} active event',
    activeFew: '{count} active events',
    activeMany: '{count} active events',
    dayOf: 'Day {day} of {total}',
    spent: '{amount} spent',
    youreOwed: "You're owed",
    allPeople: 'All people',
    earlier: 'Earlier',
    inEvent: '+{amount} in {name}',
    filterAll: 'All {count}',
    filterOweYou: 'Owe you {count}',
    filterYouOwe: 'You owe {count}',
    biggestFirst: 'Biggest first',
    aToZ: 'A to Z',
    sortLabel: 'Sort: {order}',
    remind: 'Remind',
    remindText: 'Hi {name}, a quick reminder about {amount} from our shared expenses. Thanks!',
    copied: 'Copied',
    search: 'Search people',
    closeSearch: 'Close search',
    youOweThem: 'You owe',
    filterBy: 'Show people',
    paneLabel: 'Open event or person',
    paneEmpty: 'Pick an event or a person',
    paneEmptyHint: 'Who paid what, who owes whom and how to settle up show up here.',
    peoplePaneEmpty: 'Pick a person',
    peoplePaneEmptyHint: 'What is open between you, since when and how it adds up show up here.',
  },
  sr: {
    owedToYou: 'Duguju ti',
    toNames: '{names}',
    andMore: '{names} i još {count}',
    moreComing: 'Oko {amount} više stiže tebi',
    moreGoing: 'Oko {amount} više duguješ',
    allSquare: 'Sve je izmireno',
    activeOne: '{count} aktivan događaj',
    activeFew: '{count} aktivna događaja',
    activeMany: '{count} aktivnih događaja',
    dayOf: 'Dan {day} od {total}',
    spent: 'potrošeno {amount}',
    youreOwed: 'Duguju ti',
    allPeople: 'Svi ljudi',
    earlier: 'Ranije',
    inEvent: '+{amount}, {name}',
    filterAll: 'Svi {count}',
    filterOweYou: 'Duguju ti {count}',
    filterYouOwe: 'Duguješ {count}',
    biggestFirst: 'Prvo najveći',
    aToZ: 'Od A do Ž',
    sortLabel: 'Redosled: {order}',
    remind: 'Podseti',
    remindText: 'Zdravo {name}, samo podsetnik za {amount} od zajedničkih troškova. Hvala!',
    copied: 'Kopirano',
    search: 'Pretraži ljude',
    closeSearch: 'Zatvori pretragu',
    youOweThem: 'Duguješ',
    filterBy: 'Prikaži ljude',
    paneLabel: 'Otvoren događaj ili osoba',
    paneEmpty: 'Izaberi događaj ili osobu',
    paneEmptyHint: 'Ovde se vidi ko je šta platio, ko kome duguje i kako da se poravnate.',
    peoplePaneEmpty: 'Izaberi osobu',
    peoplePaneEmptyHint: 'Ovde se vidi šta je otvoreno između vas, od kada i kako se sabira.',
  },
};
