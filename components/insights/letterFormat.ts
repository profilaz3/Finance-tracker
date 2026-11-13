import type { AppLanguage } from '../../utils/locale';
import { formatDate } from '../../utils/locale';
import { parseMonthId } from '../../domain/monthlyLetter';

/** "October" (en) / "oktobar" (sr). */
export const letterMonthName = (month: string, language: AppLanguage): string => {
  const key = parseMonthId(month);
  return key ? formatDate(new Date(key.year, key.month, 15), { month: 'long' }, language) : month;
};

/** "October 2026" (en) / "oktobar 2026." (sr). */
export const letterMonthLabel = (month: string, language: AppLanguage): string => {
  const key = parseMonthId(month);
  return key ? formatDate(new Date(key.year, key.month, 15), { month: 'long', year: 'numeric' }, language) : month;
};

export const fillTemplate = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(value), template);

/** Book-like reading face, from fonts the system already has. */
export const LETTER_SERIF = "'Iowan Old Style', 'Charter', 'Source Serif 4', 'Noto Serif', Georgia, 'Times New Roman', serif";

/** Warm paper that reads as a page in both light and dark themes. */
export const LETTER_PAPER = 'color-mix(in srgb, var(--paper-tile) 93%, #D9B77A)';
