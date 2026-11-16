import { TRANSLATIONS } from '../constants';

type Language = keyof typeof TRANSLATIONS;

/**
 * Event expense categories are stored as fixed English names (constants/expenseCategories.ts,
 * mapSharedExpenseRow's 'Activities' default). Rows keep the stored name; this only translates it
 * for display. Any other name (a user category of a linked transaction) is returned unchanged.
 */
const EVENT_CATEGORY_KEYS = {
  Activities: 'eventCatActivities',
  Hotel: 'eventCatHotel',
  Transport: 'eventCatTransport',
  Restaurants: 'eventCatRestaurants',
  Groceries: 'eventCatGroceries',
  Shopping: 'eventCatShopping',
} as const;

export const localizeEventExpenseCategory = (name: string | undefined, language: Language): string => {
  if (!name) return '';
  const key = EVENT_CATEGORY_KEYS[name as keyof typeof EVENT_CATEGORY_KEYS];
  return key ? TRANSLATIONS[language][key] : name;
};
