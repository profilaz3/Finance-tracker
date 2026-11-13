import { describe, expect, it } from 'vitest';
import {
  boundFacts,
  checkLetterGrounding,
  collectAllowedNumbers,
  groundLetter,
  groundSentence,
  normalizeLetterText,
  numberReadings,
  sanitizeDashes,
  splitSentences,
  stripUngroundedSentences,
  ungroundedNumbers,
} from '../domain/letterGrounding';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const NBSP = String.fromCharCode(0x00a0);

const facts = {
  month: 'October 2026',
  spent: '€1,730',
  previousMonthSpent: '€680',
  spendingVsPreviousMonth: { direction: 'up', percent: '154%' },
  averageMonthlySpending: { amount: '€640', months: 2 },
  oneOffs: [{ name: 'Gigatron laptop', amount: '€900', date: '20 October' }],
  sr: `1.730${NBSP}€`,
  small: '€12.50',
};
const allowed = collectAllowedNumbers(facts);

describe('number grounding', () => {
  it('reads numbers under both separator conventions', () => {
    expect(numberReadings('1,730')).toEqual([1730]);
    expect(numberReadings('1.730')).toEqual([1730]);
    expect(numberReadings('1,234.56')).toEqual([1234.56]);
    expect(numberReadings('1.730,50')).toContain(1730.5);
    expect(numberReadings('12,5')).toContain(12.5);
  });

  it('accepts figures copied from the facts in any locale spelling', () => {
    expect(ungroundedNumbers('You spent €1,730 in October 2026.', allowed)).toEqual([]);
    expect(ungroundedNumbers('Potrošio si 1.730 € u oktobru 2026.', allowed)).toEqual([]);
    expect(ungroundedNumbers('That is 154% more, against 2 months of €640.', allowed)).toEqual([]);
    expect(ungroundedNumbers('The laptop on 20 October cost €900.', allowed)).toEqual([]);
    expect(ungroundedNumbers('Coffee was 12,50 €.', allowed)).toEqual([]);
    // Whole-number rounding of a given figure restates it.
    expect(ungroundedNumbers('About €13 on coffee.', allowed)).toEqual([]);
  });

  it('rejects numbers the facts do not contain', () => {
    expect(ungroundedNumbers('You spent €1,731.', allowed)).toEqual(['1,731']);
    expect(ungroundedNumbers('Up 155% from 3 months ago.', allowed)).toEqual(['155', '3']);
    expect(ungroundedNumbers('You saved €1,050.', allowed)).toEqual(['1,050']);
  });

  it('splits sentences without breaking numbers apart', () => {
    expect(splitSentences('You spent €1,730.50 here. Then 12.5% more! Fine')).toEqual([
      'You spent €1,730.50 here.',
      'Then 12.5% more!',
      'Fine',
    ]);
  });

  it('drops only the sentences that carry an invented number', () => {
    const result = stripUngroundedSentences('You spent €1,730. That is €1,050 more than usual. Nice month.', allowed);
    expect(result.text).toBe('You spent €1,730. Nice month.');
    expect(result.removed).toEqual(['1,050']);
  });

  it('grounds a whole letter: strips sentences, drops empty sections, replaces a bad title', () => {
    const letter = {
      title: 'Your 31st month',
      sections: [
        { heading: 'At a glance', body: 'You spent €1,730 in October 2026. That was 7 times more.' },
        { heading: 'Odd', body: 'You bought 4 coats.' },
        { heading: '9 things', body: 'Fine.' },
      ],
    };
    expect(checkLetterGrounding(letter, allowed).ungrounded).toEqual(['31', '7', '4', '9']);
    const grounded = groundLetter(letter, allowed, 'October 2026');
    expect(grounded.title).toBe('October 2026');
    expect(grounded.sections).toEqual([{ heading: 'At a glance', body: 'You spent €1,730 in October 2026.' }]);
  });

  it('keeps a grounded sentence and drops one that is too thin or ungrounded', () => {
    expect(groundSentence('Mostly the €900 laptop from Gigatron.', allowed)).toBe('Mostly the €900 laptop from Gigatron.');
    expect(groundSentence('A €901 laptop.', allowed)).toBeNull();
    expect(groundSentence(42, allowed)).toBeNull();
  });
});

describe('dashes and shape', () => {
  it('replaces em and en dashes with commas, and ranges with hyphens', () => {
    expect(sanitizeDashes(`A calm month ${EM} mostly groceries.`)).toBe('A calm month, mostly groceries.');
    expect(sanitizeDashes(`From 10${EN}14 October${EN}a trip.`)).toBe('From 10-14 October, a trip.');
    expect(sanitizeDashes(`Done ${EM}.`)).toBe('Done.');
    expect(sanitizeDashes(`${EM} Start`)).toBe('Start');
  });

  it('normalizes the model reply and strips markdown and dashes', () => {
    const letter = normalizeLetterText({
      title: `**October** ${EM} a calm one`,
      sections: [{ heading: '# Glance', body: `Spent €1,730 ${EN} more than usual.` }, { heading: '', body: 'x' }, 'junk'],
    });
    expect(letter).toEqual({ title: 'October, a calm one', sections: [{ heading: 'Glance', body: 'Spent €1,730, more than usual.' }] });
    expect(normalizeLetterText({ title: 'x', sections: [] })).toBeNull();
    expect(normalizeLetterText('nope')).toBeNull();
  });

  it('bounds untrusted facts', () => {
    const bounded = boundFacts({
      ok: 'a'.repeat(500),
      list: Array.from({ length: 40 }, (_, index) => index),
      'bad key': 1,
      deep: { a: { b: { c: { d: { e: { f: 1 } } } } } },
      fn: () => 1,
      n: Number.NaN,
      tick: 'x`y',
    }) as Record<string, unknown>;
    expect((bounded.ok as string).length).toBe(140);
    expect(bounded.list).toHaveLength(12);
    expect(bounded).not.toHaveProperty(['bad key']);
    expect(bounded).not.toHaveProperty('fn');
    expect(bounded).not.toHaveProperty('n');
    expect(bounded.tick).toBe('x y');
    expect(JSON.stringify(bounded.deep)).not.toContain('"f"');
  });
});
