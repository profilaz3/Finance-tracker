import { Currency } from '../types';
import {
    AppLanguage,
    formatMediumDate,
    formatMoney,
    formatRelativeTime,
    formatShortDate,
    getAppLanguage,
} from './locale';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getLocalCalendarDayTime = (date: Date): number => (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
);

/**
 * Locale-aware money formatting. `language` defaults to the app's current
 * language (see utils/locale.ts), so existing call sites follow the setting.
 */
export const formatCurrency = (amount: number, currency: Currency, language: AppLanguage = getAppLanguage()): string =>
    formatMoney(amount, currency, language);

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase() + value.slice(1);

export const getRelativeDate = (dateString: string, language: AppLanguage = getAppLanguage()): string => {
    const date = new Date(dateString);
    const diffDays = Math.floor((getLocalCalendarDayTime(new Date()) - getLocalCalendarDayTime(date)) / MS_PER_DAY);

    if (diffDays < 0) {
        return formatMediumDate(date, language);
    }

    if (diffDays < 7) return capitalize(formatRelativeTime(-diffDays, 'day', language));
    if (diffDays < 30) return capitalize(formatRelativeTime(-Math.floor(diffDays / 7), 'week', language));
    if (diffDays < 365) return capitalize(formatRelativeTime(-Math.floor(diffDays / 30), 'month', language));

    return formatMediumDate(date, language);
};

export const getShortDate = (dateString: string, language: AppLanguage = getAppLanguage()): string =>
    formatShortDate(dateString, language);
