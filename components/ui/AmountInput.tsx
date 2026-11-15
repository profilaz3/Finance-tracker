import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { formatAmountForInput, parseAmountInput } from '../../utils/numberInput';

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'inputMode'
>;

export interface AmountInputProps extends NativeInputProps {
  /** The current amount; `undefined` (or NaN) shows an empty field. */
  value: number | undefined;
  /**
   * Called on every keystroke with the parsed amount (`undefined` while the text is empty or
   * unreadable) and the raw text, so callers can flag `invalid` when text is present but unreadable.
   */
  onValueChange: (amount: number | undefined, text: string) => void;
  language: 'en' | 'sr';
  /** Show an empty field instead of "0" when the value is 0 (forms that start blank). */
  emptyWhenZero?: boolean;
}

const toText = (value: number | undefined, language: 'en' | 'sr', emptyWhenZero: boolean) =>
  value === undefined || !Number.isFinite(value) || (emptyWhenZero && value === 0)
    ? ''
    : formatAmountForInput(value, language);

/**
 * The one money field. A text input with the decimal keypad (type="number" turns "1500,50" into
 * 150050 or an empty value depending on the browser), parsed with `parseAmountInput` in the app
 * language. It keeps its own text while the person types ("12," stays "12,") and only resyncs
 * when the value changes from outside.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onValueChange, language, emptyWhenZero = false, onFocus, ...rest },
  ref
) {
  const [text, setText] = useState(() => toText(value, language, emptyWhenZero));
  const lastEmitted = useRef<number | undefined>(value);

  useEffect(() => {
    const same = value === lastEmitted.current || (value === 0 && lastEmitted.current === undefined && emptyWhenZero);
    if (!same) {
      lastEmitted.current = value;
      setText(toText(value, language, emptyWhenZero));
    }
  }, [value, language, emptyWhenZero]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      {...rest}
      value={text}
      onFocus={event => {
        event.target.select();
        onFocus?.(event);
      }}
      onChange={event => {
        const next = event.target.value;
        const parsed = parseAmountInput(next, language);
        lastEmitted.current = parsed;
        setText(next);
        onValueChange(parsed, next);
      }}
    />
  );
});
