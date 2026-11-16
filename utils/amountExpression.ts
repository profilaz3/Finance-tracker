import { parseAmountInput } from './numberInput';

/** Sum signs an amount may contain: the keypad's + − × ÷ and their keyboard spellings. */
const OPERATOR_PATTERN = /([+\-−×xX*÷/])/;

/** The text holds a sum ("1500+320"), not just an amount (a leading sign does not count). */
export const hasAmountOperator = (value: string): boolean =>
  OPERATOR_PATTERN.test(value.replace(/[\s  ']/g, '').slice(1));

const operatorOf = (sign: string): '+' | '-' | '*' | '/' =>
  sign === '+' ? '+' : sign === '-' || sign === '−' ? '-' : sign === '÷' || sign === '/' ? '/' : '*';

/**
 * An amount that may be a short sum ("1500+320", "4×350", "1.200,50 − 300"): × and ÷ go before
 * + and −, and each number is read with `parseAmountInput` in the app language. A trailing sign is
 * ignored while the person types ("1500+" is 1500). Returns undefined for unreadable text or a
 * division by zero; a sum is rounded to cents.
 */
export const parseAmountExpression = (value: string, language?: 'en' | 'sr'): number | undefined => {
  if (!hasAmountOperator(value)) return parseAmountInput(value, language);
  let parts = value.replace(/[\s  ']/g, '').split(OPERATOR_PATTERN);
  // A leading sign belongs to the first number; a trailing sign waits for the next one.
  if (parts[0] === '' && (parts[1] === '-' || parts[1] === '−' || parts[1] === '+')) {
    parts = [`${parts[1] === '+' ? '' : '-'}${parts[2] ?? ''}`, ...parts.slice(3)];
  }
  if (parts.length > 1 && parts[parts.length - 1] === '') parts = parts.slice(0, -2);

  const numbers: number[] = [];
  const operators: ('+' | '-' | '*' | '/')[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 2 === 1) {
      operators.push(operatorOf(parts[index]));
      continue;
    }
    const number = parseAmountInput(parts[index], language);
    if (number === undefined) return undefined;
    numbers.push(number);
  }

  // × and ÷ first, folding into the running term; then the terms are added up.
  const terms: number[] = [numbers[0]];
  for (let index = 0; index < operators.length; index += 1) {
    const operator = operators[index];
    const next = numbers[index + 1];
    if (operator === '*') terms[terms.length - 1] *= next;
    else if (operator === '/') {
      if (next === 0) return undefined;
      terms[terms.length - 1] /= next;
    } else terms.push(operator === '-' ? -next : next);
  }
  const total = terms.reduce((sum, term) => sum + term, 0);
  return Number.isFinite(total) ? Math.round((total + Number.EPSILON) * 100) / 100 : undefined;
};
