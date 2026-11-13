import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '../types';
import {
  aiSuggestions,
  applyCleanup,
  buildCleanupPlan,
  combineSuggestions,
  habitSuggestions,
  keepsInformation,
  undoCleanup,
} from '../domain/cleanup';
import { cleanText, validateCleanupResult, validateMerchantMeta } from '../utils/aiCleanup';

const NOW = Date.parse('2026-11-13T12:00:00Z');
let seq = 0;
const tx = (note: string, categoryId: string, days: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${(seq += 1)}`,
  date: new Date(NOW - days * 86_400_000).toISOString(),
  amount: 10,
  currency: 'RSD',
  categoryId,
  accountId: 'cash',
  type: 'expense',
  note,
  ...extra,
});

const categories: Category[] = [
  { id: 'food', name: 'Groceries', type: 'expense', subcategories: [], color: '#000' },
  { id: 'fun', name: 'Entertainment', type: 'expense', subcategories: [], color: '#000' },
  { id: 'other', name: 'Other', type: 'expense', subcategories: [], color: '#000' },
  { id: 'pay', name: 'Salary', type: 'income', subcategories: [], color: '#000' },
  { id: 'internal-transfer', name: 'Internal Transfer', type: 'income', subcategories: [], color: '#000' },
];

describe('validateCleanupResult', () => {
  const items = [
    { id: 'n1', text: 'MAXI DOO 042', type: 'expense' as const, needsCategory: true },
    { id: 'n2', text: 'plata', type: 'income' as const, category: 'Salary' },
  ];
  const cats = categories.map(c => ({ name: c.name, type: c.type }));

  it('keeps known ids and categories of the right type only', () => {
    const raw = {
      items: [
        { id: 'n1', name: 'Maxi', note: 'Maxi', category: 'groceries' },
        { id: 'n2', category: 'Groceries' },
        { id: 'n9', name: 'Injected', note: 'x' },
        { id: 'n1', note: 'duplicate' },
        { id: 'n2', category: 'Made Up' },
      ],
    };
    expect(validateCleanupResult(raw, items, cats)).toEqual([{ id: 'n1', name: 'Maxi', note: 'Maxi', category: 'Groceries' }]);
  });

  it('drops unchanged notes, cleans markup and bounds length', () => {
    expect(validateCleanupResult({ items: [{ id: 'n2', note: 'plata' }] }, items, cats)).toEqual([]);
    expect(cleanText('  <b>Hi</b>\n there ', 120)).toBe('b Hi /b there');
    expect(cleanText('x'.repeat(500), 120)).toHaveLength(120);
    expect(validateCleanupResult('nonsense', items, cats)).toEqual([]);
  });

  it('validates merchant meta keys and service types', () => {
    const raw = { items: [{ key: 'netfliks', name: 'Netflix', service: 'streaming' }, { key: 'spotify', name: 'Spotify', service: 'pirate' }, { key: 'evil', name: 'x' }] };
    expect(validateMerchantMeta(raw, ['netfliks', 'spotify'])).toEqual([
      { key: 'netfliks', name: 'Netflix', service: 'streaming' },
      { key: 'spotify', name: 'Spotify', service: 'other' },
    ]);
  });
});

describe('keepsInformation', () => {
  it('lets a merchant name drop codes and legal suffixes', () => {
    expect(keepsInformation('MAXI DOO 042 BEOGRAD', 'Maxi', true)).toBe(true);
    expect(keepsInformation('NETFLIX.COM 8821', 'Netflix', true)).toBe(true);
  });
  it('rejects invented words', () => {
    expect(keepsInformation('Maxi', 'Lidl', true)).toBe(false);
    expect(keepsInformation('kafa sa anom', 'Kafa sa Markom', false)).toBe(false);
  });
  it('rejects notes that lose information', () => {
    expect(keepsInformation('rucak sa anom i markom u centru', 'Rucak', false)).toBe(false);
    expect(keepsInformation('kafa sa anom 4421', 'Kafa sa Anom', false)).toBe(true);
  });
});

describe('cleanup suggestions', () => {
  const history = [
    tx('Maxi', 'food', 3),
    tx('Maxi', 'food', 10),
    tx('MAXI DOO 042', 'food', 17),
    tx('maxi market', 'other', 20),
    tx('Maxi', 'fun', 24),
    tx('Maxi', 'food', 30),
    tx('kafa sa anom 4421', 'other', 5),
    tx('Cineplexx', 'other', 6),
    tx('Transfer', 'internal-transfer', 2, { type: 'income', transferId: 'x' }),
    tx('Maxi', 'food', 40),
    tx('Maxi', 'food', 45),
  ];

  it('suggests categories from habits, including a clear miscategorisation', () => {
    const habit = habitSuggestions(history, categories, NOW);
    const changes = habit.flatMap(s => s.changes);
    // "maxi market" (Other) -> Groceries; "Maxi" filed under Entertainment contradicts 6 of 7 visits.
    expect(changes.map(c => c.transactionId).sort()).toEqual([history[3].id, history[4].id].sort());
    expect(habit.find(s => s.before[0] === 'Other')).toMatchObject({ kind: 'category', source: 'habit', after: 'Groceries' });
    expect(habit.find(s => s.before[0] === 'Entertainment')).toMatchObject({ after: 'Groceries' });
  });

  it('plans distinct notes, skips transfers, and flags the ones still needing a category', () => {
    const habit = habitSuggestions(history, categories, NOW);
    const covered = new Set(habit.flatMap(s => s.changes.map(c => c.transactionId)));
    const plan = buildCleanupPlan(history, categories, covered);
    const items = plan.batches.flat();
    expect(items.map(i => i.text).sort()).toEqual(['Cineplexx', 'MAXI DOO 042', 'Maxi', 'kafa sa anom 4421', 'maxi market']);
    expect(items.find(i => i.text === 'Cineplexx')).toMatchObject({ needsCategory: true });
    expect(items.find(i => i.text === 'maxi market')?.needsCategory).toBeUndefined();
    expect(items.find(i => i.text === 'Maxi')).toMatchObject({ category: 'Groceries' });
  });

  it('turns model output into merge, note and category suggestions and applies/undoes them', () => {
    const habit = habitSuggestions(history, categories, NOW);
    const covered = new Set(habit.flatMap(s => s.changes.map(c => c.transactionId)));
    const plan = buildCleanupPlan(history, categories, covered);
    const id = (text: string) => plan.batches.flat().find(i => i.text === text)!.id;
    const results = [
      { id: id('MAXI DOO 042'), name: 'Maxi', note: 'Maxi' },
      { id: id('maxi market'), name: 'Maxi', note: 'Maxi' },
      { id: id('kafa sa anom 4421'), note: 'Kafa sa Anom' },
      { id: id('Cineplexx'), name: 'Cineplexx', category: 'Entertainment' },
      // Loses information: rejected.
      { id: id('Maxi'), note: 'Lidl' },
    ];
    const ai = aiSuggestions(results, plan, categories, covered);
    const merge = ai.find(s => s.kind === 'merge')!;
    expect(merge.after).toBe('Maxi');
    expect(merge.before.sort()).toEqual(['MAXI DOO 042', 'maxi market']);
    expect(merge.changes).toHaveLength(2);
    // "Maxi" itself was not returned (already tidy) and is not changed.
    expect(merge.changes.map(c => c.transactionId)).not.toContain(history[0].id);
    expect(ai.find(s => s.kind === 'note')).toMatchObject({ before: ['kafa sa anom 4421'], after: 'Kafa sa Anom' });
    expect(ai.find(s => s.kind === 'category')).toMatchObject({ after: 'Entertainment', context: 'Cineplexx' });

    const all = combineSuggestions(habit, ai);
    expect(all[0].kind).toBe('merge');

    const applied = applyCleanup(history, all);
    const byId = new Map(applied.updated.map(t => [t.id, t]));
    expect(byId.get(history[3].id)).toMatchObject({ note: 'Maxi', categoryId: 'food' });
    expect(byId.get(history[7].id)).toMatchObject({ categoryId: 'fun' });
    expect(byId.has(history[0].id)).toBe(false);
    expect(applied.originals.find(t => t.id === history[3].id)).toMatchObject({ note: 'maxi market', categoryId: 'other' });

    // The user edits one row after applying: undo leaves that row alone.
    const current = history.map(t => byId.get(t.id) ?? t).map(t => (t.id === history[7].id ? { ...t, note: 'Cineplexx Usce' } : t));
    const restored = undoCleanup(current, applied);
    expect(restored.map(t => t.id)).not.toContain(history[7].id);
    expect(restored.find(t => t.id === history[3].id)).toMatchObject({ note: 'maxi market', categoryId: 'other' });
    expect(restored).toHaveLength(applied.updated.length - 1);
  });

  it('makes a merge when the model only tidies one spelling of a known merchant', () => {
    const plan = buildCleanupPlan(history, categories, new Set());
    const id = plan.batches.flat().find(i => i.text === 'MAXI DOO 042')!.id;
    const [merge] = aiSuggestions([{ id, name: 'Maxi', note: 'Maxi' }], plan, categories, new Set());
    expect(merge).toMatchObject({ kind: 'merge', before: ['MAXI DOO 042'], after: 'Maxi' });
    expect(merge.changes).toHaveLength(1);
  });

  it('never changes anything without selected suggestions', () => {
    expect(applyCleanup(history, [])).toEqual({ updated: [], originals: [] });
  });
});
