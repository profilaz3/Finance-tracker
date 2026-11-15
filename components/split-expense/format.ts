import { formatPercent } from '../../utils/locale';

/** A split percentage without trailing zeros: "40%", "13.5%", "33.33%" (comma decimals in Serbian). */
export const formatSplitPercent = (value: number, language: 'en' | 'sr'): string => {
    const digits = Number.isInteger(value) ? 0 : Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 ? 1 : 2;
    return formatPercent(value, digits, language);
};
