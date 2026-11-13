import { describe, expect, it } from 'vitest';
import {
  computeSplitTotals,
  matchPersonName,
  normalizeName,
  receiptItemsForSplit,
  replacePersonId,
  SELF_ID,
  toggleItemPerson,
  validateAssignResult,
  type ItemAssignment,
  type SplitItem,
} from '../domain/receiptSplit';

const sumCents = (amounts: Record<string, number>) =>
  Object.values(amounts).reduce((sum, value) => sum + Math.round(value * 100), 0);

const people = [
  { id: 'p-alex', name: 'Alex' },
  { id: 'p-sam', name: 'Sam' },
  { id: 'p-marko', name: 'Marko Petrović' },
  { id: 'p-ana', name: 'Ana' },
  { id: 'p-nikola', name: 'Nikola' },
  { id: 'p-dj', name: 'Đorđe' },
];

describe('receiptItemsForSplit', () => {
  it('turns unit prices into line totals with stable ids', () => {
    expect(receiptItemsForSplit([
      { name: 'Pivo', price: 2.5, quantity: 3 },
      { name: 'Banane', price: 179.99, quantity: 0.754 },
    ])).toEqual([
      { id: 'i1', name: 'Pivo', quantity: 3, total: 7.5 },
      { id: 'i2', name: 'Banane', quantity: 0.754, total: 135.71 },
    ]);
  });
});

describe('computeSplitTotals', () => {
  const items: SplitItem[] = [
    { id: 'i1', name: 'Beer', quantity: 1, total: 5 },
    { id: 'i2', name: 'Burger', quantity: 1, total: 12 },
    { id: 'i3', name: 'Fries', quantity: 1, total: 10 },
  ];

  it('splits items equally and sums exactly to the receipt total', () => {
    const assignments: ItemAssignment[] = [
      { itemId: 'i1', personIds: [SELF_ID] },
      { itemId: 'i2', personIds: ['p-alex'] },
      { itemId: 'i3', personIds: [SELF_ID, 'p-alex', 'p-sam'] },
    ];
    const result = computeSplitTotals({ items, assignments, receiptTotal: 27, currency: 'EUR', payerId: SELF_ID });
    expect(result.amounts).toEqual({ self: 8.34, 'p-alex': 15.33, 'p-sam': 3.33 });
    expect(sumCents(result.amounts)).toBe(2700);
    expect(result.adjustment).toBe(0);
  });

  it('puts the rounding remainder on the payer', () => {
    const assignments: ItemAssignment[] = [{ itemId: 'i3', personIds: [SELF_ID, 'p-alex', 'p-sam'] }];
    const one = [items[2]];
    const meFirst = computeSplitTotals({ items: one, assignments, receiptTotal: 10, currency: 'EUR', payerId: SELF_ID });
    expect(meFirst.amounts).toEqual({ self: 3.34, 'p-alex': 3.33, 'p-sam': 3.33 });
    const samPaid = computeSplitTotals({ items: one, assignments, receiptTotal: 10, currency: 'EUR', payerId: 'p-sam' });
    expect(samPaid.amounts).toEqual({ self: 3.33, 'p-alex': 3.33, 'p-sam': 3.34 });
  });

  it('spreads tax or a service charge proportionally', () => {
    const assignments: ItemAssignment[] = [
      { itemId: 'i1', personIds: [SELF_ID] },
      { itemId: 'i2', personIds: ['p-alex'] },
      { itemId: 'i3', personIds: ['p-sam'] },
    ];
    // 27 of items plus 10% service = 29.70
    const result = computeSplitTotals({ items, assignments, receiptTotal: 29.7, currency: 'EUR', payerId: SELF_ID });
    expect(result.amounts).toEqual({ self: 5.5, 'p-alex': 13.2, 'p-sam': 11 });
    expect(result.adjustment).toBe(2.7);
    expect(sumCents(result.amounts)).toBe(2970);
  });

  it('spreads a receipt-level discount proportionally and handles discount lines', () => {
    const withDiscountLine: SplitItem[] = [...items, { id: 'i4', name: 'Popust', quantity: 1, total: -3 }];
    const assignments: ItemAssignment[] = [
      { itemId: 'i1', personIds: [SELF_ID] },
      { itemId: 'i2', personIds: ['p-alex'] },
      { itemId: 'i3', personIds: [SELF_ID, 'p-alex'] },
      { itemId: 'i4', personIds: [SELF_ID, 'p-alex'] },
    ];
    const result = computeSplitTotals({ items: withDiscountLine, assignments, receiptTotal: 24, currency: 'EUR', payerId: SELF_ID });
    expect(result.amounts).toEqual({ self: 8.5, 'p-alex': 15.5 });

    const lower = computeSplitTotals({ items, assignments: assignments.slice(0, 3), receiptTotal: 21.6, currency: 'EUR', payerId: SELF_ID });
    expect(lower.amounts).toEqual({ self: 8, 'p-alex': 13.6 });
    expect(lower.adjustment).toBe(-5.4);
  });

  it('rounds RSD shares to whole dinars and lets the payer take the para', () => {
    const rsd: SplitItem[] = [
      { id: 'i1', name: 'Pivo', quantity: 2, total: 459.98 },
      { id: 'i2', name: 'Pljeskavica', quantity: 1, total: 890 },
      { id: 'i3', name: 'Salata', quantity: 1, total: 350.5 },
    ];
    const assignments: ItemAssignment[] = [
      { itemId: 'i1', personIds: [SELF_ID] },
      { itemId: 'i2', personIds: ['p-alex'] },
      { itemId: 'i3', personIds: [SELF_ID, 'p-alex', 'p-sam'] },
    ];
    const result = computeSplitTotals({ items: rsd, assignments, receiptTotal: 1700.48, currency: 'RSD', payerId: SELF_ID });
    expect(result.amounts['p-alex']).toBe(1007);
    expect(result.amounts['p-sam']).toBe(117);
    expect(Number.isInteger(result.amounts['p-alex'])).toBe(true);
    expect(sumCents(result.amounts)).toBe(170048);
    expect(result.amounts.self).toBe(576.48);
  });

  it('gives unassigned items to the payer and reports them', () => {
    const result = computeSplitTotals({
      items,
      assignments: [{ itemId: 'i2', personIds: ['p-alex'] }],
      receiptTotal: 27,
      currency: 'EUR',
      payerId: SELF_ID,
    });
    expect(result.unassignedItemIds).toEqual(['i1', 'i3']);
    expect(result.amounts).toEqual({ 'p-alex': 12, self: 15 });
  });

  it('keeps the remainder off a payer who had nothing', () => {
    const result = computeSplitTotals({
      items: [items[2]],
      assignments: [{ itemId: 'i3', personIds: ['p-alex', 'p-sam', 'p-ana'] }],
      receiptTotal: 10,
      currency: 'EUR',
      payerId: SELF_ID,
    });
    expect(result.amounts.self).toBeUndefined();
    expect(sumCents(result.amounts)).toBe(1000);
  });

  it('sums exactly over many random receipts', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const ids = [SELF_ID, 'a', 'b', 'c', 'd'];
    for (let run = 0; run < 300; run += 1) {
      const count = 1 + Math.floor(random() * 8);
      const randomItems: SplitItem[] = Array.from({ length: count }, (_, index) => ({
        id: `i${index}`,
        name: 'x',
        quantity: 1,
        total: Math.round(random() * 5000) / 100,
      }));
      const assignments = randomItems.map(item => ({
        itemId: item.id,
        personIds: ids.filter(() => random() > 0.5),
      }));
      const itemsSum = randomItems.reduce((sum, item) => sum + item.total, 0);
      const receiptTotal = Math.round(itemsSum * (0.85 + random() * 0.3) * 100) / 100;
      const currency = run % 2 ? 'RSD' : 'EUR';
      const result = computeSplitTotals({ items: randomItems, assignments, receiptTotal, currency, payerId: SELF_ID });
      expect(sumCents(result.amounts)).toBe(Math.round(receiptTotal * 100));
      if (currency === 'RSD') {
        for (const [id, value] of Object.entries(result.amounts)) {
          if (id !== SELF_ID && result.amounts[SELF_ID] !== undefined) expect(Number.isInteger(value)).toBe(true);
        }
      }
    }
  });
});

describe('assignment editing', () => {
  it('toggles a person on an item', () => {
    const start: ItemAssignment[] = [{ itemId: 'i1', personIds: [SELF_ID] }];
    expect(toggleItemPerson(start, 'i1', 'p-alex')[0].personIds).toEqual([SELF_ID, 'p-alex']);
    expect(toggleItemPerson(start, 'i1', SELF_ID)[0].personIds).toEqual([]);
    expect(toggleItemPerson(start, 'i2', 'p-sam')[1]).toEqual({ itemId: 'i2', personIds: ['p-sam'] });
  });

  it('resolves a new-person placeholder everywhere', () => {
    const result = replacePersonId(
      {
        assignments: [{ itemId: 'i1', personIds: ['new:Marko', SELF_ID] }],
        payerId: 'new:Marko',
        unknownNames: ['Marko'],
        notes: '',
        guessedItemIds: [],
      },
      'new:Marko',
      'p-marko',
    );
    expect(result.assignments[0].personIds).toEqual(['p-marko', SELF_ID]);
    expect(result.payerId).toBe('p-marko');
    expect(result.unknownNames).toEqual([]);
  });
});

describe('matchPersonName', () => {
  it('folds case, diacritics, Cyrillic and spelling variants', () => {
    expect(normalizeName('Đorđe Šćekić')).toBe('djordje scekic');
    expect(normalizeName('Алекс')).toBe('aleks');
    expect(normalizeName('Alex')).toBe('aleks');
    expect(matchPersonName('Dorde', people)?.id).toBe('p-dj');
    expect(matchPersonName('Ђорђе', people)?.id).toBe('p-dj');
    expect(matchPersonName('aleks', people)?.id).toBe('p-alex');
  });

  it('understands Serbian cases', () => {
    expect(matchPersonName('Alexom', people)?.id).toBe('p-alex');
    expect(matchPersonName('Aleksu', people)?.id).toBe('p-alex');
    expect(matchPersonName('Samu', people)?.id).toBe('p-sam');
    expect(matchPersonName('Samom', people)?.id).toBe('p-sam');
    expect(matchPersonName('Marka', people)?.id).toBe('p-marko');
    expect(matchPersonName('Markom', people)?.id).toBe('p-marko');
    expect(matchPersonName('Ani', people)?.id).toBe('p-ana');
    expect(matchPersonName('Anom', people)?.id).toBe('p-ana');
    expect(matchPersonName('Nikolom', people)?.id).toBe('p-nikola');
    expect(matchPersonName('Đorđu', people)?.id).toBe('p-dj');
  });

  it('matches first names, full names and small typos, and refuses guesses', () => {
    expect(matchPersonName('marko petrovic', people)?.id).toBe('p-marko');
    expect(matchPersonName('Nicola', people)?.id).toBe('p-nikola');
    expect(matchPersonName('Jelena', people)).toBeNull();
    expect(matchPersonName('', people)).toBeNull();
    expect(matchPersonName('Ana', [{ id: '1', name: 'Ana' }, { id: '2', name: 'Ana Ilić' }])?.id).toBe('1');
    expect(matchPersonName('Ana', [{ id: '1', name: 'Ana Jović' }, { id: '2', name: 'Ana Ilić' }])).toBeNull();
  });
});

describe('validateAssignResult', () => {
  const items = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }];

  it('keeps valid ids and resolves names the model used instead of ids', () => {
    const result = validateAssignResult(
      {
        assignments: [
          { itemId: 'i1', personIds: ['self'] },
          { itemId: 'i2', personIds: ['Alexom'] },
          { itemId: 'i3', personIds: ['self', 'p-alex', 'p-sam', 'p-sam'] },
        ],
        payerId: 'p-alex',
        unknownNames: [],
        notes: 'ok',
      },
      items,
      people,
    );
    expect(result).toEqual({
      assignments: [
        { itemId: 'i1', personIds: ['self'] },
        { itemId: 'i2', personIds: ['p-alex'] },
        { itemId: 'i3', personIds: ['self', 'p-alex', 'p-sam'] },
      ],
      payerId: 'p-alex',
      unknownNames: [],
      notes: 'ok',
      guessedItemIds: [],
    });
  });

  it('drops unknown items, fills missing ones and reports unknown names', () => {
    const result = validateAssignResult(
      {
        assignments: [
          { itemId: 'i9', personIds: ['self'] },
          { itemId: 'i1', personIds: ['new:Jelena', 'self'] },
          { itemId: 'i1', personIds: ['p-sam'] },
          { itemId: 'i2', personIds: ['0f4c2a1e-0000-4000-8000-000000000000'] },
        ],
        unknownNames: ['Jelena', 'Samu'],
      },
      items,
      people,
    );
    expect(result?.assignments).toEqual([
      { itemId: 'i1', personIds: ['new:Jelena', 'self'] },
      { itemId: 'i2', personIds: ['self', 'new:Jelena'] },
      { itemId: 'i3', personIds: ['self', 'new:Jelena'] },
    ]);
    expect(result?.guessedItemIds).toEqual(['i2', 'i3']);
    expect(result?.unknownNames).toEqual(['Jelena']);
    expect(result?.payerId).toBe('self');
  });

  it('rejects unusable answers', () => {
    expect(validateAssignResult(null, items, people)).toBeNull();
    expect(validateAssignResult({ assignments: 'all' }, items, people)).toBeNull();
    expect(validateAssignResult({ assignments: [] }, [], people)).toBeNull();
  });
});
