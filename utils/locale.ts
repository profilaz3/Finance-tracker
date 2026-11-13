import type { Currency } from '../types';

/**
 * Locale layer: maps the app language to an Intl locale and exposes
 * locale-aware date/number/money formatters.
 *
 * - `en` -> `en-GB`: the app's audience is in Serbia / the eurozone, so
 *   day-month order ("13 Nov 2026") and a 24-hour clock match what users
 *   expect, while keeping English wording.
 * - `sr` -> `sr-Latn-RS`: Serbian in Latin script (plain `sr` defaults to
 *   Cyrillic in CLDR), Serbian grouping/decimal separators ("1.234,50").
 *
 * Money always uses `currencyDisplay: 'narrowSymbol'` so USD renders as "$"
 * rather than "US$" in both locales; EUR is "€" and RSD stays "RSD".
 */

export type AppLanguage = 'en' | 'sr';

export const INTL_LOCALES: Record<AppLanguage, string> = {
    en: 'en-GB',
    sr: 'sr-Latn-RS',
};

let currentLanguage: AppLanguage = 'en';

/** Called by the app shell whenever the selected language changes. */
export const setAppLanguage = (language: AppLanguage): void => {
    currentLanguage = language === 'sr' ? 'sr' : 'en';
};

export const getAppLanguage = (): AppLanguage => currentLanguage;

export const getIntlLocale = (language: AppLanguage = currentLanguage): string =>
    INTL_LOCALES[language] ?? INTL_LOCALES.en;

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

const getNumberFormat = (locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat => {
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = numberFormatCache.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, options);
        numberFormatCache.set(key, formatter);
    }
    return formatter;
};

const getDateFormat = (locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = dateFormatCache.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, options);
        dateFormatCache.set(key, formatter);
    }
    return formatter;
};

const toDate = (value: Date | string | number): Date =>
    value instanceof Date ? value : new Date(value);

/** Money with currency symbol, e.g. "€1,234.50" (en) / "1.234,50 €" (sr). */
export const formatMoney = (
    amount: number,
    currency: Currency,
    language: AppLanguage = currentLanguage,
    options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string => {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const minimumFractionDigits = options.minimumFractionDigits ?? 2;
    const maximumFractionDigits = Math.max(options.maximumFractionDigits ?? 2, minimumFractionDigits);
    try {
        return getNumberFormat(getIntlLocale(language), {
            style: 'currency',
            currency,
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits,
            maximumFractionDigits,
        }).format(safeAmount);
    } catch {
        return `${safeAmount.toFixed(maximumFractionDigits)} ${currency}`;
    }
};

/** Plain number with locale grouping/decimal separators. */
export const formatNumber = (
    value: number,
    options: Intl.NumberFormatOptions = {},
    language: AppLanguage = currentLanguage
): string => {
    const safeValue = Number.isFinite(value) ? value : 0;
    return getNumberFormat(getIntlLocale(language), options).format(safeValue);
};

/** Generic date formatting; returns '' for invalid dates. */
export const formatDate = (
    value: Date | string | number,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
    language: AppLanguage = currentLanguage
): string => {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return getDateFormat(getIntlLocale(language), options).format(date);
};

/** "13 Nov" (en) / "13. nov" (sr) */
export const formatShortDate = (value: Date | string | number, language: AppLanguage = currentLanguage): string =>
    formatDate(value, { day: 'numeric', month: 'short' }, language);

/** "13 Nov 2026" (en) / "13. nov 2026." (sr) */
export const formatMediumDate = (value: Date | string | number, language: AppLanguage = currentLanguage): string =>
    formatDate(value, { day: 'numeric', month: 'short', year: 'numeric' }, language);

/** "November 2026" (en) / "novembar 2026." (sr) */
export const formatMonthYear = (value: Date | string | number, language: AppLanguage = currentLanguage): string =>
    formatDate(value, { month: 'long', year: 'numeric' }, language);

/** "13 Nov 2026, 14:05" (en) / "13. 11. 2026. 14:05" (sr) */
export const formatDateTime = (value: Date | string | number, language: AppLanguage = currentLanguage): string =>
    formatDate(value, { dateStyle: 'medium', timeStyle: 'short' }, language);

/** "14:05" in both languages. */
export const formatTime = (value: Date | string | number, language: AppLanguage = currentLanguage): string =>
    formatDate(value, { hour: '2-digit', minute: '2-digit' }, language);

/** Relative time, e.g. "3 days ago" / "pre 3 dana". */
export const formatRelativeTime = (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    language: AppLanguage = currentLanguage
): string => new Intl.RelativeTimeFormat(getIntlLocale(language), { numeric: 'auto' }).format(value, unit);
