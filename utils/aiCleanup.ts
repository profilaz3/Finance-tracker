/**
 * Shared, dependency-free contract for the `ai-cleanup` edge function: request limits, prompts'
 * fixed vocabularies and strict validation of model output. Imported by Deno and by the app.
 */

export const CLEANUP_BATCH_SIZE = 200;
export const MERCHANT_BATCH_SIZE = 60;
export const MAX_TEXT = 120;
export const MAX_NAME = 40;

export const SERVICE_TYPES = [
  'streaming', 'music', 'gym', 'phone', 'internet', 'software', 'cloud', 'insurance',
  'utilities', 'news', 'gaming', 'education', 'transport', 'membership', 'other',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface MerchantMeta {
  key: string;
  name: string;
  service: ServiceType;
}

export interface CleanupItemInput {
  id: string;
  text: string;
  type: 'income' | 'expense';
  /** Current category name, absent when the transaction is uncategorised. */
  category?: string;
  needsCategory?: boolean;
}

export interface CleanupItemResult {
  id: string;
  /** Clean merchant/service name when the text names one. */
  name?: string;
  /** Tidied text; absent when it is already fine. */
  note?: string;
  /** One of the provided categories of the item's type. */
  category?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One line of plain text: control characters and markup removed, spaces collapsed, bounded. */
export const cleanText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value
    .replace(/[\u0000-\u001f\u007f<>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return text.length > 0 ? text : undefined;
};

const listOf = (raw: unknown, field: string): Record<string, unknown>[] => {
  if (!isRecord(raw)) return [];
  const list = raw[field];
  return Array.isArray(list) ? list.filter(isRecord) : [];
};

/** Keeps only results for requested keys, with a bounded name and a known service type. */
export const validateMerchantMeta = (raw: unknown, keys: readonly string[]): MerchantMeta[] => {
  const allowed = new Set(keys);
  const seen = new Set<string>();
  const out: MerchantMeta[] = [];
  for (const entry of listOf(raw, 'items')) {
    const key = typeof entry.key === 'string' ? entry.key : '';
    if (!allowed.has(key) || seen.has(key)) continue;
    const name = cleanText(entry.name, MAX_NAME);
    if (!name) continue;
    const service = (SERVICE_TYPES as readonly string[]).includes(String(entry.service)) ? (entry.service as ServiceType) : 'other';
    seen.add(key);
    out.push({ key, name, service });
  }
  return out;
};

/**
 * Keeps only results whose id was sent, drops unchanged notes, and accepts a category only when
 * it is exactly (case-insensitively) one of the provided names of the item's type.
 */
export const validateCleanupResult = (
  raw: unknown,
  items: readonly CleanupItemInput[],
  categories: readonly { name: string; type: 'income' | 'expense' }[],
): CleanupItemResult[] => {
  const byId = new Map(items.map(item => [item.id, item]));
  const seen = new Set<string>();
  const out: CleanupItemResult[] = [];
  for (const entry of listOf(raw, 'items')) {
    const id = typeof entry.id === 'string' ? entry.id : '';
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    const result: CleanupItemResult = { id };
    const name = cleanText(entry.name, MAX_NAME);
    if (name) result.name = name;
    const note = cleanText(entry.note, MAX_TEXT);
    if (note && note !== item.text) result.note = note;
    if (typeof entry.category === 'string') {
      const wanted = entry.category.trim().toLowerCase();
      const match = categories.find(category => category.type === item.type && category.name.toLowerCase() === wanted);
      if (match && match.name !== item.category) result.category = match.name;
    }
    if (result.name || result.note || result.category) out.push(result);
  }
  return out;
};
