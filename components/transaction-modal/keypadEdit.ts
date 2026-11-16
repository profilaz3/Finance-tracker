/** A key on the amount keypad: a digit, the decimal mark, a sum sign or delete. */
export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'decimal' | '+' | '−' | '×' | '÷' | 'back';

export const KEYPAD_SIGNS = ['+', '−', '×', '÷'] as const;

const isSign = (char: string | undefined) => !!char && /[+\-−×xX*÷/]/.test(char);

/**
 * What a keypad press does to the amount text, at the selection: digits and signs go in, a second
 * sign in a row replaces the first, the decimal mark (the app language's) only once per number and
 * after a digit ("0," when the number is empty), a lone leading zero gives way to the next digit,
 * and delete removes the selection or the character before the caret.
 */
export const keypadEdit = (
  text: string,
  start: number,
  end: number,
  key: KeypadKey,
  language: 'en' | 'sr',
): { text: string; caret: number } => {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const before = text.slice(0, from);
  const after = text.slice(to);
  const put = (insert: string, keep = before) => ({ text: keep + insert + after, caret: keep.length + insert.length });

  if (key === 'back') {
    if (to > from) return { text: before + after, caret: from };
    if (from === 0) return { text, caret: 0 };
    return { text: text.slice(0, from - 1) + after, caret: from - 1 };
  }

  // The number the caret is in: from the last sign before it (the selection is replaced).
  const numberStart = Math.max(...[...before].map((char, index) => (isSign(char) && index > 0 ? index + 1 : 0)), 0);
  const current = before.slice(numberStart);

  if (key === 'decimal') {
    const mark = language === 'sr' ? ',' : '.';
    const numberEnd = after.search(/[+\-−×xX*÷/]/);
    const rest = numberEnd === -1 ? after : after.slice(0, numberEnd);
    if (current.includes(mark) || rest.includes(mark)) return { text, caret: from };
    return put(current === '' || current === '-' ? `0${mark}` : mark);
  }

  if ((KEYPAD_SIGNS as readonly string[]).includes(key)) {
    // A sum needs a number first; a sign right after another one replaces it.
    if (before === '' || before === '-') return { text, caret: from };
    if (isSign(before[before.length - 1])) return put(key, before.slice(0, -1));
    return put(key);
  }

  if (current === '0') return put(key, before.slice(0, -1));
  return put(key);
};
