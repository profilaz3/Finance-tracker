import { describe, expect, it } from 'vitest';
import { hasAmountOperator, parseAmountExpression } from '../utils/amountExpression';
import { keypadEdit } from '../components/transaction-modal/keypadEdit';

describe('parseAmountExpression', () => {
  it('reads plain amounts exactly like parseAmountInput', () => {
    expect(parseAmountExpression('1500', 'en')).toBe(1500);
    expect(parseAmountExpression('1.500', 'sr')).toBe(1500);
    expect(parseAmountExpression('1500,50', 'sr')).toBe(1500.5);
    expect(parseAmountExpression('-20', 'en')).toBe(-20);
    expect(parseAmountExpression('', 'en')).toBeUndefined();
    expect(parseAmountExpression('abc', 'en')).toBeUndefined();
  });

  it('adds, subtracts, multiplies and divides with × and ÷ first', () => {
    expect(parseAmountExpression('1500+320', 'en')).toBe(1820);
    expect(parseAmountExpression('1500 − 300', 'en')).toBe(1200);
    expect(parseAmountExpression('4×350', 'en')).toBe(1400);
    expect(parseAmountExpression('100+4×350', 'en')).toBe(1500);
    expect(parseAmountExpression('3000÷4', 'en')).toBe(750);
    expect(parseAmountExpression('10/3', 'en')).toBe(3.33);
    expect(parseAmountExpression('2*3', 'en')).toBe(6);
    expect(parseAmountExpression('2x3', 'en')).toBe(6);
  });

  it('reads each number in the app language', () => {
    expect(parseAmountExpression('1.200,50+300', 'sr')).toBe(1500.5);
    expect(parseAmountExpression('1,200.50+300', 'en')).toBe(1500.5);
    expect(parseAmountExpression('0,1+0,2', 'sr')).toBe(0.3);
  });

  it('ignores a trailing sign and keeps a leading minus', () => {
    expect(parseAmountExpression('1500+', 'en')).toBe(1500);
    expect(parseAmountExpression('1500×', 'en')).toBe(1500);
    expect(parseAmountExpression('-20+50', 'en')).toBe(30);
  });

  it('refuses broken sums and division by zero', () => {
    expect(parseAmountExpression('1500++3', 'en')).toBeUndefined();
    expect(parseAmountExpression('5÷0', 'en')).toBeUndefined();
    expect(parseAmountExpression('5+a', 'en')).toBeUndefined();
  });

  it('tells a sum from a signed amount', () => {
    expect(hasAmountOperator('1500+320')).toBe(true);
    expect(hasAmountOperator('-20')).toBe(false);
    expect(hasAmountOperator('1.500,50')).toBe(false);
  });
});

describe('keypadEdit', () => {
  const press = (keys: Parameters<typeof keypadEdit>[3][], language: 'en' | 'sr' = 'sr', start = '') =>
    keys.reduce((text, key) => keypadEdit(text, text.length, text.length, key, language).text, start);

  it('types digits, a decimal mark in the app language and signs', () => {
    expect(press(['1', '5', '0', '0', '+', '3', '2', '0'])).toBe('1500+320');
    expect(press(['1', '2', 'decimal', '5'])).toBe('12,5');
    expect(press(['1', '2', 'decimal', '5'], 'en')).toBe('12.5');
  });

  it('keeps one decimal mark per number and starts a bare one with 0', () => {
    expect(press(['decimal', '5'])).toBe('0,5');
    expect(press(['1', 'decimal', '2', 'decimal', '3'])).toBe('1,23');
    expect(press(['1', 'decimal', '2', '+', 'decimal', '5'])).toBe('1,2+0,5');
  });

  it('replaces a sign typed right after another and ignores a sign first', () => {
    expect(press(['+'])).toBe('');
    expect(press(['5', '+', '×', '2'])).toBe('5×2');
  });

  it('drops a lone leading zero', () => {
    expect(press(['0', '5'])).toBe('5');
    expect(press(['5', '+', '0', '7'])).toBe('5+7');
    expect(press(['0', 'decimal', '0', '5'])).toBe('0,05');
  });

  it('deletes the character before the caret or the selection, and replaces a selection', () => {
    expect(press(['1', '2', '3', 'back'])).toBe('12');
    expect(keypadEdit('', 0, 0, 'back', 'en')).toEqual({ text: '', caret: 0 });
    expect(keypadEdit('2971', 0, 4, 'back', 'en')).toEqual({ text: '', caret: 0 });
    expect(keypadEdit('2971', 0, 4, '5', 'en')).toEqual({ text: '5', caret: 1 });
    expect(keypadEdit('1500', 2, 2, '9', 'en')).toEqual({ text: '15900', caret: 3 });
  });
});
