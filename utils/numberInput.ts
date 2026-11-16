const parseFiniteNumber = (value: string): number | undefined => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

export const parseRequiredNumberInput = (value: string): number => {
  return parseFiniteNumber(value) ?? 0;
};

export const parseOptionalNumberInput = (value: string): number | undefined => {
  return parseFiniteNumber(value);
};

/**
 * Parses an amount typed by a person: "1500", "1500,50", "1.500,50", "1,500.50", "1 500,50", "-20".
 * With both separators the last one is the decimal mark, and a repeated mark is a thousands
 * separator. A single mark followed by exactly three digits is ambiguous ("1.500"): it follows the
 * app language, so it is a thousands separator when it is the language's grouping mark (dot in
 * Serbian, comma in English) and a decimal mark otherwise. Returns undefined for empty or
 * unreadable text, so callers can show an error instead of guessing.
 */
export const parseAmountInput = (value: string, language?: 'en' | 'sr'): number | undefined => {
  let text = value.replace(/[\s\u00a0\u202f']/g, '').replace(/^\u2212/, '-');
  if (!text) return undefined;
  if (!/^[-+]?[\d.,]+$/.test(text)) return undefined;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalMark = lastComma > lastDot ? ',' : '.';
    const thousandsMark = decimalMark === ',' ? '.' : ',';
    text = text.split(thousandsMark).join('');
    if (text.split(decimalMark).length > 2) return undefined;
    text = text.replace(decimalMark, '.');
  } else if (lastComma !== -1 || lastDot !== -1) {
    const mark = lastComma !== -1 ? ',' : '.';
    const parts = text.split(mark);
    const groupingMark = language === 'sr' ? '.' : language === 'en' ? ',' : undefined;
    const looksGrouped = parts.length === 2 && mark === groupingMark && /^\d{3}$/.test(parts[1]) && /\d/.test(parts[0]);
    text = parts.length > 2 || looksGrouped ? parts.join('') : parts.join('.');
  }

  if (!/\d/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Plain editable text for an amount, using the app language's decimal mark ("2887,6" in Serbian). */
export const formatAmountForInput = (amount: number, language: 'en' | 'sr'): string => {
  if (!Number.isFinite(amount)) return '';
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
  return language === 'sr' ? text.replace('.', ',') : text;
};
