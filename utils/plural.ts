import { getIntlLocale, type AppLanguage } from './locale';

export type PluralForm = 'one' | 'few' | 'other';

const rulesCache = new Map<string, Intl.PluralRules>();

/**
 * Plural form of a count in the app language. Serbian has three: 1, 21, 31 take `one`
 * ("1 član"), 2-4, 22-24 take `few` ("2 člana") and the rest `other` ("5 članova").
 * English only uses `one` and `other`.
 */
export const pluralForm = (count: number, language: AppLanguage): PluralForm => {
  const locale = getIntlLocale(language);
  let rules = rulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    rulesCache.set(locale, rules);
  }
  const form = rules.select(count);
  return form === 'one' || form === 'few' ? form : 'other';
};

/** Picks the template for the count and fills `{count}`. `few` falls back to `other`. */
export const pluralText = (
  count: number,
  language: AppLanguage,
  templates: { one: string; few?: string; other: string },
): string => {
  const form = pluralForm(count, language);
  const template = form === 'one' ? templates.one : form === 'few' ? templates.few ?? templates.other : templates.other;
  return template.replace(/\{count\}/g, String(count));
};
