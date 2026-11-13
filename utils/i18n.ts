import { TRANSLATIONS } from '../constants';
import { getAppLanguage, type AppLanguage } from './locale';

export type Translations = (typeof TRANSLATIONS)[AppLanguage];
export type TranslationKey = keyof typeof TRANSLATIONS['en'];

/**
 * Translation table for the given language (defaults to the language the app
 * shell last set via `setAppLanguage`). Use this in hooks, class components and
 * other places that do not receive `language` as a prop.
 */
export const getTranslations = (language: AppLanguage = getAppLanguage()): Translations =>
    TRANSLATIONS[language] ?? TRANSLATIONS.en;
