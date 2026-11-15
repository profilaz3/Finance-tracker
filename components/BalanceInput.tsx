import React, { useState, useEffect, useId, useRef } from 'react';
import { Currency } from '../types';
import { TRANSLATIONS } from '../constants';
import { Check, X } from 'lucide-react';
import clsx from 'clsx';
import { formatAmountForInput, parseAmountInput } from '../utils/numberInput';

interface BalanceInputProps {
    currency: Currency;
    initialAmount: number;
    onSave: (amount: number) => void;
    onCancel: () => void;
    language: 'en' | 'sr';
    /** Visible label above the field; without it the field is labelled by `ariaLabel` or the currency. */
    label?: string;
    ariaLabel?: string;
    /** Show the currency inside the field; turn off when the row already shows it. */
    showCurrency?: boolean;
}

/**
 * Inline amount editor. Takes the full width it is given (callers put it on its own line), reads
 * comma or dot decimals, and has a sign button because Android decimal keypads have no minus key.
 */
export const BalanceInput: React.FC<BalanceInputProps> = ({
    currency,
    initialAmount,
    onSave,
    onCancel,
    language,
    label,
    ariaLabel,
    showCurrency = true,
}) => {
    const [value, setValue] = useState(() => formatAmountForInput(initialAmount, language));
    const [invalid, setInvalid] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const inputId = useId();
    const errorId = `${inputId}-error`;
    const t = TRANSLATIONS[language];

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const handleSave = () => {
        const amount = parseAmountInput(value, language);
        if (amount === undefined) {
            setInvalid(true);
            inputRef.current?.focus();
            return;
        }
        onSave(Math.round(amount * 100) / 100);
    };

    const toggleSign = () => {
        setValue(current => {
            const trimmed = current.trim();
            if (!trimmed) return '-';
            return trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`;
        });
        setInvalid(false);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
        }
    };

    return (
        <div className="flex w-full flex-col gap-1.5">
            {label && <label htmlFor={inputId} className="px-1 text-[12px] font-semibold text-muted">{label}</label>}
            <div className="flex w-full items-center gap-2">
                <button
                    type="button"
                    onClick={toggleSign}
                    aria-label={t.toggleSign}
                    title={t.toggleSign}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-[18px] font-semibold text-muted"
                >
                    ±
                </button>
                <div className="relative min-w-0 flex-1">
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="done"
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value);
                            setInvalid(false);
                        }}
                        aria-label={label ? undefined : (ariaLabel ?? currency)}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? errorId : undefined}
                        className={clsx(
                            'h-11 w-full min-w-0 rounded-[12px] border-none bg-chip pl-3',
                            showCurrency ? 'pr-12' : 'pr-3',
                            'text-[16px] font-semibold tabular-nums text-on-surface outline-none focus:ring-2',
                            invalid ? 'ring-2 ring-neg focus:ring-neg' : 'focus:ring-accent'
                        )}
                        placeholder="0"
                        onKeyDown={handleKeyDown}
                    />
                    {showCurrency && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-muted">
                            {currency}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                    title={t.save}
                    aria-label={t.save}
                >
                    <Check size={18} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                    title={t.cancel}
                    aria-label={t.cancel}
                >
                    <X size={18} aria-hidden="true" />
                </button>
            </div>
            {invalid && (
                <p id={errorId} role="alert" className="px-1 text-[12px] font-medium text-neg">{t.splitErrorInvalidAmount}</p>
            )}
        </div>
    );
};
