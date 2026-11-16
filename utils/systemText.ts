import { TRANSLATIONS } from '../constants';

type Language = keyof typeof TRANSLATIONS;
type SystemTextId =
  | 'sysCatInternalTransfer' | 'sysCatIncoming' | 'sysCatOutgoing'
  | 'sysSubPartialPayment' | 'sysSubFullSettlement' | 'sysSubBetweenAccounts' | 'sysSubTransferIn' | 'sysSubSettlement'
  | 'sysNoteSettled' | 'sysNotePartial' | 'sysNoteTransferFrom' | 'sysNoteTransferTo';

/**
 * The app writes some English text into data (system category names, settlement and transfer
 * notes, subcategories). Stored rows keep that text so sync and older clients are unaffected;
 * these helpers translate it on screen. Text the person typed or renamed is returned unchanged.
 */

const SYSTEM_CATEGORIES: Record<string, { defaultName: string; textId: SystemTextId }> = {
  'internal-transfer': { defaultName: 'Internal Transfer', textId: 'sysCatInternalTransfer' },
  'debt-repayment': { defaultName: 'Incoming', textId: 'sysCatIncoming' },
  'loan-repayment': { defaultName: 'Outgoing', textId: 'sysCatOutgoing' },
};

const SYSTEM_SUBCATEGORIES: Record<string, SystemTextId> = {
  'Partial Payment': 'sysSubPartialPayment',
  'Full Settlement': 'sysSubFullSettlement',
  'Between Accounts': 'sysSubBetweenAccounts',
  'Transfer In': 'sysSubTransferIn',
  Settlement: 'sysSubSettlement',
};

const NOTE_PATTERNS: { pattern: RegExp; textId: SystemTextId; field: 'currency' | 'name' }[] = [
  { pattern: /^Settled (EUR|USD|RSD) balance$/, textId: 'sysNoteSettled', field: 'currency' },
  { pattern: /^Partial settlement \((EUR|USD|RSD)\)$/, textId: 'sysNotePartial', field: 'currency' },
  { pattern: /^Transfer from (.+)$/, textId: 'sysNoteTransferFrom', field: 'name' },
  { pattern: /^Transfer to (.+)$/, textId: 'sysNoteTransferTo', field: 'name' },
];

const text = (language: Language, textId: SystemTextId): string => TRANSLATIONS[language][textId];

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);

/** Display name of a category: built-in system categories are translated unless renamed. */
export const localizeCategoryName = (category: { id: string; name: string }, language: Language): string => {
  const system = SYSTEM_CATEGORIES[category.id];
  return system && category.name === system.defaultName ? text(language, system.textId) : category.name;
};

/** Display text of a subcategory the app itself writes ("Partial Payment", "Between Accounts"...). */
export const localizeSubcategory = (subcategory: string | undefined, language: Language): string | undefined => {
  if (!subcategory) return subcategory;
  const textId = SYSTEM_SUBCATEGORIES[subcategory];
  return textId ? text(language, textId) : subcategory;
};

/** Display text of a transaction note: notes the app generated are translated, typed notes are not. */
export const localizeTransactionNote = (note: string | undefined, language: Language): string | undefined => {
  if (!note) return note;
  for (const { pattern, textId, field } of NOTE_PATTERNS) {
    const match = note.match(pattern);
    if (match) return fill(text(language, textId), { [field]: match[1] });
  }
  return note;
};
