import type { RecurringTransaction } from '../types';
import { isDue } from './recurringUtils';
import { getTranslations } from './i18n';
import { getIntlLocale } from './locale';

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const normalizeDateOnly = (referenceDate: Date): Date =>
  new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

const pluralRulesCache = new Map<string, Intl.PluralRules>();

const getDayLabel = (days: number, language: 'en' | 'sr'): string => {
  const locale = getIntlLocale(language);
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  const t = getTranslations(language);
  return rules.select(days) === 'one' ? t.dayUnitOne : t.dayUnitOther;
};

const formatDayCount = (template: string, days: number, language: 'en' | 'sr'): string =>
  template
    .replace('{count}', String(days))
    .replace('{unit}', getDayLabel(days, language));

export const countDueRecurringTransactions = (
  recurringTransactions: RecurringTransaction[],
  referenceDate: Date = new Date()
): number => recurringTransactions.filter(recurring => isDue(recurring, referenceDate)).length;

export const getRecurringStatus = (
  recurring: RecurringTransaction,
  language: 'en' | 'sr',
  referenceDate: Date = new Date()
) => {
  const nextDueDate = parseDateOnly(recurring.nextDue);
  const today = normalizeDateOnly(referenceDate);
  const daysUntil = Math.round((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntil < 0;
  const isDueToday = daysUntil === 0;

  const t = getTranslations(language);
  let countdownText: string;
  if (isDueToday) {
    countdownText = t.today;
  } else if (isOverdue) {
    countdownText = formatDayCount(t.recurringOverdue, Math.abs(daysUntil), language);
  } else {
    countdownText = formatDayCount(t.recurringDueIn, daysUntil, language);
  }

  return {
    nextDueDate,
    daysUntil,
    isOverdue,
    isDueToday,
    countdownText,
  };
}
