import type { Currency } from '../types.ts';

/**
 * Splitting a scanned receipt between people.
 *
 * The AI (edge function `assign-split`) only decides who had what. Everything with money is done
 * here, in integer cents, so the per-person totals always add up to the receipt total exactly.
 * This module has no runtime imports: the edge function imports it too.
 */

/** The user. People ids come from `state.people`; unknown names travel as `new:<Name>` until resolved. */
export const SELF_ID = 'self';
export const NEW_PERSON_PREFIX = 'new:';

export interface SplitItem {
  id: string;
  name: string;
  quantity: number;
  /** Line total (unit price times quantity) in major units. Discount lines are negative. */
  total: number;
}

export interface ItemAssignment {
  itemId: string;
  /** `self`, a person id, or `new:<Name>` for a name the user still has to pick or add. */
  personIds: string[];
}

export interface AssignResult {
  assignments: ItemAssignment[];
  payerId: string;
  /** Names from the instruction that match nobody in the people list. */
  unknownNames: string[];
  notes: string;
  /** Items the model left out; they were given to everyone mentioned so the user can review them. */
  guessedItemIds: string[];
}

export interface SplitPerson {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------

const toCents = (amount: number): number => Math.round((Number.isFinite(amount) ? amount : 0) * 100);
const fromCents = (cents: number): number => cents / 100;

/** Smallest amount a share is rounded to: whole dinars for RSD, cents otherwise. */
export const roundingStepCents = (currency: Currency | string): number => (currency === 'RSD' ? 100 : 1);

/** Receipt lines in the shape the split needs; ids are stable per position. */
export const receiptItemsForSplit = (items: { name: string; price: number; quantity: number }[]): SplitItem[] =>
  items.map((item, index) => ({
    id: `i${index + 1}`,
    name: item.name,
    quantity: item.quantity,
    total: fromCents(toCents(item.price * item.quantity)),
  }));

export interface SplitTotalsInput {
  items: SplitItem[];
  assignments: ItemAssignment[];
  /** What was actually paid. Any difference to the item sum (tax, discount, rounding) is spread proportionally. */
  receiptTotal: number;
  currency: Currency | string;
  /** Gets the rounding remainder (when they have a share at all). */
  payerId: string;
}

export interface SplitTotals {
  /** Per participant, in major units; the values sum to `receiptTotal` exactly. */
  amounts: Record<string, number>;
  /** Participants in first-seen order. */
  order: string[];
  /** receiptTotal minus the sum of item lines, spread over the shares. */
  adjustment: number;
  /** Items with nobody on them; their cost goes to the payer. */
  unassignedItemIds: string[];
}

/**
 * Per-person totals. Each item is split equally among its people; the gap between the item lines and
 * the receipt total is spread in proportion to each share; shares are rounded to the currency step and
 * the payer absorbs the rounding remainder (or the largest share, when the payer had nothing).
 */
export const computeSplitTotals = ({ items, assignments, receiptTotal, currency, payerId }: SplitTotalsInput): SplitTotals => {
  const byItem = new Map(assignments.map(entry => [entry.itemId, [...new Set(entry.personIds)]]));
  const raw = new Map<string, number>();
  const order: string[] = [];
  const add = (personId: string, cents: number) => {
    if (!raw.has(personId)) {
      raw.set(personId, 0);
      order.push(personId);
    }
    raw.set(personId, (raw.get(personId) ?? 0) + cents);
  };

  const unassignedItemIds: string[] = [];
  let itemsCents = 0;
  for (const item of items) {
    const cents = toCents(item.total);
    itemsCents += cents;
    const people = byItem.get(item.id) ?? [];
    if (people.length === 0) {
      unassignedItemIds.push(item.id);
      add(payerId, cents);
      continue;
    }
    for (const personId of people) add(personId, cents / people.length);
  }

  const totalCents = toCents(receiptTotal);
  const adjustmentCents = totalCents - itemsCents;
  const rawSum = [...raw.values()].reduce((sum, value) => sum + value, 0);

  // Exact (fractional) target per person after the proportional adjustment.
  const exact = new Map<string, number>();
  if (order.length === 0) {
    exact.set(payerId, totalCents);
    order.push(payerId);
  } else if (rawSum > 0) {
    for (const id of order) exact.set(id, (raw.get(id) ?? 0) * (totalCents / rawSum));
  } else {
    // Nothing positive to weigh by (all lines zero or discounts): the payer takes the gap.
    for (const id of order) exact.set(id, raw.get(id) ?? 0);
    exact.set(payerId, (exact.get(payerId) ?? 0) + adjustmentCents);
    if (!order.includes(payerId)) order.push(payerId);
  }

  const absorber = exact.has(payerId) && Math.abs(exact.get(payerId) ?? 0) > 0
    ? payerId
    : order.reduce((best, id) => ((exact.get(id) ?? 0) > (exact.get(best) ?? 0) ? id : best), order[0]);

  const step = roundingStepCents(currency);
  const rounded = new Map<string, number>();
  let othersCents = 0;
  for (const id of order) {
    if (id === absorber) continue;
    const cents = Math.round((exact.get(id) ?? 0) / step) * step;
    rounded.set(id, cents);
    othersCents += cents;
  }
  rounded.set(absorber, totalCents - othersCents);

  const amounts: Record<string, number> = {};
  for (const id of order) amounts[id] = fromCents(rounded.get(id) ?? 0);
  return { amounts, order, adjustment: fromCents(adjustmentCents), unassignedItemIds };
};

/** Puts `personId` on or off one item. */
export const toggleItemPerson = (assignments: ItemAssignment[], itemId: string, personId: string): ItemAssignment[] => {
  const existing = assignments.find(entry => entry.itemId === itemId);
  if (!existing) return [...assignments, { itemId, personIds: [personId] }];
  return assignments.map(entry =>
    entry.itemId !== itemId
      ? entry
      : {
          ...entry,
          personIds: entry.personIds.includes(personId)
            ? entry.personIds.filter(id => id !== personId)
            : [...entry.personIds, personId],
        },
  );
};

/** Swaps a placeholder (`new:Marko`) or any id for another everywhere, payer included. */
export const replacePersonId = (result: AssignResult, from: string, to: string): AssignResult => ({
  ...result,
  payerId: result.payerId === from ? to : result.payerId,
  assignments: result.assignments.map(entry => ({
    ...entry,
    personIds: [...new Set(entry.personIds.map(id => (id === from ? to : id)))],
  })),
  unknownNames: from.startsWith(NEW_PERSON_PREFIX)
    ? result.unknownNames.filter(name => name !== from.slice(NEW_PERSON_PREFIX.length))
    : result.unknownNames,
});

// ---------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

/** Lowercase latin without diacritics, with spelling variants folded (Alex = Aleks, Maya = Maja). */
export const normalizeName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, char => CYRILLIC[char] ?? char)
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(/q/g, 'k')
    .replace(/y/g, 'j')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Name comparison key: "Đorđe" is often typed "Djordje" or "Dorde". */
const matchKey = (value: string): string => normalizeName(value).replace(/dj/g, 'd');

// Serbian noun endings (instrumental, dative, genitive, accusative, vocative, possessive), longest first.
const SERBIAN_ENDINGS = ['ovima', 'evima', 'ovom', 'evom', 'ama', 'ima', 'om', 'em', 'ov', 'ev', 'in', 'u', 'a', 'e', 'i', 'o'];

/** Base forms a (possibly declined) Serbian name could come from: "alexom" gives "aleks", "marku" gives "mark". */
const nameStems = (word: string): string[] => {
  const stems = new Set([word]);
  for (const ending of SERBIAN_ENDINGS) {
    if (word.length - ending.length >= 2 && word.endsWith(ending)) stems.add(word.slice(0, -ending.length));
  }
  return [...stems];
};

/** A person's name forms: full name, first name, and the stem without a final vowel (Marko, Ana, Nikola). */
const personForms = (name: string): string[] => {
  const full = matchKey(name);
  const first = full.split(' ')[0] ?? '';
  const forms = new Set([full, first].filter(Boolean));
  for (const form of [...forms]) {
    if (/[aeio]$/.test(form) && form.length >= 3) forms.add(form.slice(0, -1));
  }
  return [...forms];
};

/** Classic edit distance, capped (only small names are compared). */
const editDistance = (a: string, b: string): number => {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
};

/**
 * Finds the person a spoken or typed name refers to, handling Serbian cases ("Alexom", "Samu",
 * "Marka"), diacritics and Cyrillic, and one-letter typos in longer names. Ambiguous matches return null.
 */
export const matchPersonName = <P extends SplitPerson>(name: string, people: P[]): P | null => {
  const query = matchKey(name);
  if (!query) return null;
  const candidates = nameStems(query.split(' ')[0] ?? query);
  const fullQuery = query.includes(' ') ? [query] : [];

  const score = (person: P): number => {
    const forms = personForms(person.name);
    if (forms[0] === query) return 4;
    if (fullQuery.some(full => forms.includes(full))) return 4;
    if (forms.includes(candidates[0])) return 3;
    if (candidates.some(stem => forms.includes(stem))) return 2;
    if (candidates[0].length >= 5 && forms.some(form => form.length >= 5 && editDistance(candidates[0], form) <= 1)) return 1;
    return 0;
  };

  let best: P | null = null;
  let bestScore = 0;
  let tie = false;
  for (const person of people) {
    const value = score(person);
    if (value > bestScore) {
      best = person;
      bestScore = value;
      tie = false;
    } else if (value > 0 && value === bestScore) {
      tie = true;
    }
  }
  return tie ? null : best;
};

// ---------------------------------------------------------------------------------------------
// Model output
// ---------------------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanName = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : '';

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Validates the model's answer against the request: item ids must exist, people must be `self`,
 * known ids, or names (resolved fuzzily, else kept as `new:<Name>` placeholders and reported as unknown).
 * Every item ends up assigned: items the model skipped go to everyone mentioned and are flagged.
 * Returns null when the answer is unusable.
 */
export const validateAssignResult = (raw: unknown, items: Pick<SplitItem, 'id'>[], people: SplitPerson[]): AssignResult | null => {
  if (!isRecord(raw) || !Array.isArray(raw.assignments)) return null;
  const itemIds = new Set(items.map(item => item.id));
  const byId = new Map(people.map(person => [person.id, person]));
  const unknown = new Map<string, string>(); // normalized -> display

  const resolve = (value: unknown): string | null => {
    const text = cleanName(value);
    if (!text) return null;
    const lowered = text.toLowerCase();
    if (lowered === SELF_ID || lowered === 'me' || lowered === 'ja' || lowered === 'mene' || lowered === 'meni') return SELF_ID;
    if (byId.has(text)) return text;
    const name = lowered.startsWith(NEW_PERSON_PREFIX) ? text.slice(NEW_PERSON_PREFIX.length).trim() : text;
    if (!name) return null;
    const match = matchPersonName(name, people);
    if (match) return match.id;
    const key = normalizeName(name);
    if (!key || /^[0-9a-f-]{8,}$/i.test(name)) return null; // an invented id, not a name
    if (!unknown.has(key)) unknown.set(key, titleCase(name));
    return `${NEW_PERSON_PREFIX}${unknown.get(key)}`;
  };

  for (const name of Array.isArray(raw.unknownNames) ? raw.unknownNames.slice(0, 10) : []) resolve(name);

  const assignments: ItemAssignment[] = [];
  const seen = new Set<string>();
  for (const entry of raw.assignments) {
    if (!isRecord(entry)) continue;
    const itemId = typeof entry.itemId === 'string' ? entry.itemId : '';
    if (!itemIds.has(itemId) || seen.has(itemId) || !Array.isArray(entry.personIds)) continue;
    const personIds = [...new Set(entry.personIds.slice(0, 30).map(resolve).filter((id): id is string => Boolean(id)))];
    if (personIds.length === 0) continue;
    seen.add(itemId);
    assignments.push({ itemId, personIds });
  }

  const payerId = resolve(raw.payerId) ?? SELF_ID;
  const everyone = [...new Set([SELF_ID, ...assignments.flatMap(entry => entry.personIds)])];
  const guessedItemIds: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    guessedItemIds.push(item.id);
    assignments.push({ itemId: item.id, personIds: everyone });
  }
  if (assignments.length === 0) return null;

  // Keep only placeholders still in use (a name may have been listed but resolved elsewhere).
  const used = new Set([payerId, ...assignments.flatMap(entry => entry.personIds)]);
  const unknownNames = [...unknown.values()].filter(name => used.has(`${NEW_PERSON_PREFIX}${name}`));

  return {
    assignments: items.map(item => assignments.find(entry => entry.itemId === item.id)!).filter(Boolean),
    payerId,
    unknownNames,
    notes: typeof raw.notes === 'string' ? raw.notes.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300) : '',
    guessedItemIds,
  };
};
