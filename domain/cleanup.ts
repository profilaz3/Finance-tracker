import type { Category, Transaction } from '../types';
import { CLEANUP_BATCH_SIZE, MAX_TEXT, type CleanupItemInput, type CleanupItemResult } from '../utils/aiCleanup';
import { buildMerchantMemory, findMerchant, merchantTokens, normalizeMerchant, usualChoice, wordMatches } from './merchantMemory';

/**
 * "Clean up with AI": a reviewable list of proposals (merchant spellings, categories, tidier
 * notes). Habits from history decide categories first; the model only sees what is left.
 * Nothing here mutates state; apply and undo are explicit and reversible.
 */

export type CleanupKind = 'merge' | 'category' | 'note';

export interface CleanupChange {
  transactionId: string;
  note?: string;
  categoryId?: string;
}

export interface CleanupSuggestion {
  id: string;
  kind: CleanupKind;
  source: 'habit' | 'ai';
  /** Merge: the spellings being merged. Category: the old category name. Note: the old note. */
  before: string[];
  after: string;
  /** What the suggestion is about (category suggestions: the merchant or note). */
  context?: string;
  changes: CleanupChange[];
}

// Categories the app manages itself (transfers, settle-up legs): never touched.
const SYSTEM_CATEGORIES = new Set(['internal-transfer', 'debt-repayment', 'loan-repayment']);
const UNCATEGORISED_NAMES = /^(other|others|misc|miscellaneous|uncategori[sz]ed|ostalo|razno|bez kategorije|ostale)$/i;

const MAX_ITEMS = CLEANUP_BATCH_SIZE * 5;

export const isUncategorised = (transaction: Transaction, categories: readonly Category[]): boolean => {
  if (!transaction.categoryId) return true;
  const category = categories.find(c => c.id === transaction.categoryId);
  return !category || UNCATEGORISED_NAMES.test(category.name.trim());
};

/** Transactions the clean-up may touch. */
export const cleanupCandidates = (transactions: readonly Transaction[]): Transaction[] =>
  transactions.filter(
    t =>
      !t.transferId &&
      !SYSTEM_CATEGORIES.has(t.categoryId) &&
      !t.id.startsWith('rec:') &&
      (t.type === 'expense' || t.type === 'income'),
  );

const categoryName = (categories: readonly Category[], id: string) => categories.find(c => c.id === id)?.name ?? '';

/** Category ids the user can pick for a type, excluding system and catch-all categories. */
const pickable = (categories: readonly Category[], type: Transaction['type']) =>
  categories.filter(c => c.type === type && !SYSTEM_CATEGORIES.has(c.id) && !UNCATEGORISED_NAMES.test(c.name.trim()));

/**
 * Local pass: categories from the user's own habits. Uncategorised charges at a shop with a clear
 * habit get that category; a charge that contradicts a strong habit (4+ visits, 80 %+ one
 * category, under 20 % for its current one) is flagged as miscategorised.
 */
export const habitSuggestions = (
  transactions: readonly Transaction[],
  categories: readonly Category[],
  now = Date.now(),
): CleanupSuggestion[] => {
  // Habits come from categorised rows only, so "Other" never looks like a habit.
  const memory = buildMerchantMemory(transactions.filter(t => !isUncategorised(t, categories)), now);
  const groups = new Map<string, CleanupSuggestion>();
  for (const transaction of cleanupCandidates(transactions)) {
    const text = transaction.receiptData?.merchant || transaction.note;
    if (!text) continue;
    const usual = usualChoice(memory, text);
    if (!usual || usual.categoryId === transaction.categoryId) continue;
    const target = categories.find(c => c.id === usual.categoryId);
    if (!target || target.type !== transaction.type || !pickable(categories, transaction.type).includes(target)) continue;

    if (!isUncategorised(transaction, categories)) {
      const entry = findMerchant(memory, text);
      if (!entry || entry.count < 4 || usual.share < 0.8) continue;
      let total = 0;
      for (const value of entry.categories.values()) total += value.score;
      const current = entry.categories.get(transaction.categoryId)?.score ?? 0;
      if (total <= 0 || current / total >= 0.2) continue;
    }

    const key = `habit|${normalizeMerchant(usual.merchant)}|${transaction.categoryId}|${target.id}`;
    let suggestion = groups.get(key);
    if (!suggestion) {
      suggestion = {
        id: key,
        kind: 'category',
        source: 'habit',
        before: [categoryName(categories, transaction.categoryId)],
        after: target.name,
        context: usual.merchant,
        changes: [],
      };
      groups.set(key, suggestion);
    }
    suggestion.changes.push({ transactionId: transaction.id, categoryId: target.id });
  }
  return [...groups.values()];
};

export interface CleanupPlan {
  /** Items for the model, in batches of CLEANUP_BATCH_SIZE. */
  batches: CleanupItemInput[][];
  /** Item id -> transactions with that exact note. */
  members: Map<string, Transaction[]>;
}

/** Distinct notes to send (most recent first), marking the ones still without a category. */
export const buildCleanupPlan = (
  transactions: readonly Transaction[],
  categories: readonly Category[],
  coveredByHabit: ReadonlySet<string>,
): CleanupPlan => {
  const byText = new Map<string, Transaction[]>();
  const sorted = [...cleanupCandidates(transactions)].sort((a, b) => b.date.localeCompare(a.date));
  for (const transaction of sorted) {
    const text = transaction.note?.trim();
    if (!text || text.length > MAX_TEXT) continue;
    const key = `${transaction.type}|${text}`;
    const list = byText.get(key);
    if (list) list.push(transaction);
    else if (byText.size < MAX_ITEMS) byText.set(key, [transaction]);
  }
  const items: CleanupItemInput[] = [];
  const members = new Map<string, Transaction[]>();
  let n = 0;
  for (const list of byText.values()) {
    const id = `n${(n += 1)}`;
    const first = list[0];
    const uncategorised = list.filter(t => isUncategorised(t, categories));
    const categorised = list.find(t => !isUncategorised(t, categories));
    items.push({
      id,
      text: first.note!.trim(),
      type: first.type === 'income' ? 'income' : 'expense',
      ...(categorised ? { category: categoryName(categories, categorised.categoryId) } : {}),
      ...(uncategorised.some(t => !coveredByHabit.has(t.id)) ? { needsCategory: true } : {}),
    });
    members.set(id, list);
  }
  const batches: CleanupItemInput[][] = [];
  for (let i = 0; i < items.length; i += CLEANUP_BATCH_SIZE) batches.push(items.slice(i, i + CLEANUP_BATCH_SIZE));
  return { batches, members };
};

const letters = (value: string) => merchantTokens(value);

/**
 * A tidied note may drop codes and filler, but not information: every word it keeps must come from
 * the original (spelling-folded, case endings allowed), and a note that is more than a merchant name
 * must keep most of its words.
 */
export const keepsInformation = (before: string, after: string, merchantOnly: boolean): boolean => {
  const old = letters(before);
  const next = letters(after);
  if (next.length === 0) return old.length === 0;
  const fromOriginal = (word: string) => old.some(o => wordMatches(o, word) || wordMatches(word, o));
  if (!next.every(fromOriginal)) return false;
  if (merchantOnly) return true;
  const kept = old.filter(o => next.some(w => wordMatches(o, w) || wordMatches(w, o))).length;
  return kept >= Math.ceil(old.length * 0.75);
};

/** Turns validated model results into merge, note and category suggestions. */
export const aiSuggestions = (
  results: readonly CleanupItemResult[],
  plan: CleanupPlan,
  categories: readonly Category[],
  coveredByHabit: ReadonlySet<string>,
): CleanupSuggestion[] => {
  const suggestions: CleanupSuggestion[] = [];
  type MerchantGroup = { names: Map<string, number>; items: { text: string; list: Transaction[] }[] };
  const merchantGroups = new Map<string, MerchantGroup>();
  const noteChanges: { text: string; after: string; list: Transaction[] }[] = [];

  for (const result of results) {
    const list = plan.members.get(result.id);
    if (!list) continue;
    const text = list[0].note!.trim();
    const merchantOnly = Boolean(result.name) && normalizeMerchant(result.name) === normalizeMerchant(result.note ?? text);
    const after = result.note ?? text;

    if (merchantOnly && result.name && keepsInformation(text, result.name, true)) {
      const key = normalizeMerchant(result.name);
      if (key.length >= 2) {
        const group: MerchantGroup = merchantGroups.get(key) ?? { names: new Map(), items: [] };
        group.names.set(result.name, (group.names.get(result.name) ?? 0) + list.length);
        group.items.push({ text, list });
        merchantGroups.set(key, group);
      }
    } else if (after !== text && keepsInformation(text, after, false)) {
      noteChanges.push({ text, after, list });
    }

    if (result.category) {
      const target = pickable(categories, list[0].type).find(c => c.name === result.category);
      if (target) {
        const affected = list.filter(t =>
          t.categoryId !== target.id && (isUncategorised(t, categories) ? !coveredByHabit.has(t.id) : true),
        );
        if (affected.length > 0) {
          const from = affected[0].categoryId;
          suggestions.push({
            id: `ai-category|${result.id}|${target.id}`,
            kind: 'category',
            source: 'ai',
            before: [categoryName(categories, from)],
            after: target.name,
            context: result.name ?? text,
            changes: affected.map(t => ({ transactionId: t.id, categoryId: target.id })),
          });
        }
      }
    }
  }

  // Notes the model left alone ("Maxi" is already tidy) still belong to their merchant: they make
  // "MAXI DOO 042 -> Maxi" a merge, and an odd existing spelling ("MAXI") joins the canonical one.
  const answered = new Set(results.map(result => result.id));
  for (const [id, list] of plan.members) {
    if (answered.has(id)) continue;
    const text = list[0].note!.trim();
    const group = merchantGroups.get(normalizeMerchant(text));
    if (group) group.items.push({ text, list });
  }

  for (const [key, group] of merchantGroups) {
    // Most-used clean name wins ("Maxi" over "MAXI").
    const canonical = [...group.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const changing = group.items.filter(item => item.text !== canonical);
    if (changing.length === 0) continue;
    const spellings = group.items.map(item => item.text);
    suggestions.push({
      id: `${spellings.length > 1 ? 'merge' : 'note'}|${key}`,
      kind: spellings.length > 1 ? 'merge' : 'note',
      source: 'ai',
      before: changing.map(item => item.text),
      after: canonical,
      changes: changing.flatMap(item => item.list.map(t => ({ transactionId: t.id, note: canonical }))),
    });
  }

  for (const change of noteChanges) {
    suggestions.push({
      id: `note|${change.text}`,
      kind: 'note',
      source: 'ai',
      before: [change.text],
      after: change.after,
      changes: change.list.map(t => ({ transactionId: t.id, note: change.after })),
    });
  }

  const order: Record<CleanupKind, number> = { merge: 0, category: 1, note: 2 };
  return suggestions.sort((a, b) => order[a.kind] - order[b.kind] || b.changes.length - a.changes.length);
};

/** Habit suggestions win over model ones for the same transaction's category. */
export const combineSuggestions = (habit: CleanupSuggestion[], ai: CleanupSuggestion[]): CleanupSuggestion[] => {
  const habitIds = new Set(habit.flatMap(s => s.changes.map(c => c.transactionId)));
  const filtered = ai
    .map(s =>
      s.kind === 'category' ? { ...s, changes: s.changes.filter(c => !habitIds.has(c.transactionId)) } : s,
    )
    .filter(s => s.changes.length > 0);
  return [...filtered.filter(s => s.kind === 'merge'), ...habit, ...filtered.filter(s => s.kind !== 'merge')];
};

export interface AppliedCleanup {
  /** Rows as written. */
  updated: Transaction[];
  /** The same rows before the change, for undo. */
  originals: Transaction[];
}

/** Applies the selected suggestions' changes; rows that would not change are left out. */
export const applyCleanup = (transactions: readonly Transaction[], suggestions: readonly CleanupSuggestion[]): AppliedCleanup => {
  const patch = new Map<string, CleanupChange>();
  for (const suggestion of suggestions) {
    for (const change of suggestion.changes) {
      const current = patch.get(change.transactionId) ?? { transactionId: change.transactionId };
      if (change.note !== undefined) current.note = change.note;
      if (change.categoryId !== undefined) current.categoryId = change.categoryId;
      patch.set(change.transactionId, current);
    }
  }
  const updated: Transaction[] = [];
  const originals: Transaction[] = [];
  for (const transaction of transactions) {
    const change = patch.get(transaction.id);
    if (!change) continue;
    const next: Transaction = {
      ...transaction,
      ...(change.note !== undefined ? { note: change.note } : {}),
      ...(change.categoryId !== undefined ? { categoryId: change.categoryId } : {}),
    };
    if (next.note === transaction.note && next.categoryId === transaction.categoryId) continue;
    updated.push(next);
    originals.push(transaction);
  }
  return { updated, originals };
};

/**
 * Undo: restores note and category of rows still as the clean-up left them. Rows edited since
 * (or deleted) are kept as they are, so undo never overwrites newer work.
 */
export const undoCleanup = (current: readonly Transaction[], applied: AppliedCleanup): Transaction[] => {
  const byId = new Map(current.map(t => [t.id, t]));
  const restored: Transaction[] = [];
  applied.updated.forEach((written, index) => {
    const now = byId.get(written.id);
    const original = applied.originals[index];
    if (!now || now.note !== written.note || now.categoryId !== written.categoryId) return;
    restored.push({ ...now, note: original.note, categoryId: original.categoryId });
  });
  return restored;
};

/** Transactions per suggestion, for the review list. */
export const suggestionCount = (suggestion: CleanupSuggestion): number =>
  new Set(suggestion.changes.map(change => change.transactionId)).size;
