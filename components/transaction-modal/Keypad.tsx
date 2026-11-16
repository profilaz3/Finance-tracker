import React from 'react';
import clsx from 'clsx';
import { Delete } from 'lucide-react';
import { HAPTIC_PATTERNS, vibrate } from '../../utils/haptics';
import { keypadEdit, type KeypadKey } from './keypadEdit';
import type { EntryStrings } from './entryStrings';

interface KeypadProps {
  /** The amount field the keys type into (an `AmountInput` that reads sums). */
  inputRef: React.RefObject<HTMLInputElement | null>;
  language: 'en' | 'sr';
  s: EntryStrings;
}

/**
 * Sets the field's text the way typing would, so `AmountInput` reads it (React tracks the value
 * through the native setter) and the form updates as on a keystroke.
 */
const typeInto = (input: HTMLInputElement, text: string, caret: number) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (document.activeElement !== input) input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
};

/**
 * The amount keypad (phones and tablets): digits, the app language's decimal mark, delete and the
 * four sum signs, so "1500 + 320" adds up in place. Keys never take focus, so the field keeps its
 * caret and the phone keyboard stays closed.
 */
export const Keypad: React.FC<KeypadProps> = ({ inputRef, language, s }) => {
  const press = (key: KeypadKey) => {
    const input = inputRef.current;
    if (!input) return;
    const focused = document.activeElement === input;
    const start = focused ? input.selectionStart ?? input.value.length : input.value.length;
    const end = focused ? input.selectionEnd ?? start : start;
    const next = keypadEdit(input.value, start, end, key, language);
    if (next.text === input.value) {
      if (!focused) input.focus({ preventScroll: true });
      return;
    }
    vibrate(HAPTIC_PATTERNS.light);
    typeInto(input, next.text, next.caret);
  };

  const key = (value: KeypadKey, label: React.ReactNode, aria?: string, sign = false) => (
    <button
      key={value}
      type="button"
      tabIndex={-1}
      aria-label={aria}
      onPointerDown={event => event.preventDefault()}
      onClick={() => press(value)}
      className={clsx(
        'flex h-[52px] select-none items-center justify-center rounded-[16px] text-[24px] font-medium tabular-nums transition-[transform,background-color] duration-100 active:scale-[0.96]',
        sign ? 'bg-accent-soft text-accent' : 'bg-[var(--paper-tile)] text-on-surface shadow-[inset_0_0_0_1px_var(--paper-line)]',
      )}
    >
      {label}
    </button>
  );

  const mark = language === 'sr' ? ',' : '.';
  return (
    <div role="group" aria-label={s.keypad} className="grid grid-cols-4 gap-2" data-no-swipe>
      {key('1', '1')}
      {key('2', '2')}
      {key('3', '3')}
      {key('+', '+', s.plus, true)}
      {key('4', '4')}
      {key('5', '5')}
      {key('6', '6')}
      {key('−', '−', s.minus, true)}
      {key('7', '7')}
      {key('8', '8')}
      {key('9', '9')}
      {key('×', '×', s.times, true)}
      {key('decimal', mark, s.decimal)}
      {key('0', '0')}
      {key('back', <Delete size={24} aria-hidden="true" />, s.deleteDigit)}
      {key('÷', '÷', s.dividedBy, true)}
    </div>
  );
};
