import React, { useState, useEffect, useRef } from 'react';
import { Currency } from '../types';
import { TRANSLATIONS } from '../constants';
import { Check, X } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface BalanceInputProps {
    currency: Currency;
    initialAmount: number;
    onSave: (amount: number) => void;
    onCancel: () => void;
    language: 'en' | 'sr';
}

export const BalanceInput: React.FC<BalanceInputProps> = ({
    currency,
    initialAmount,
    onSave,
    onCancel,
    language
}) => {
    const [value, setValue] = useState(initialAmount.toString());
    const inputRef = useRef<HTMLInputElement>(null);
    const t = TRANSLATIONS[language];

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleSave = () => {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            onSave(numValue);
        } else {
            onCancel();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') onCancel();
    };

    return (
        <div className="flex gap-2 items-center animate-in fade-in zoom-in-95 duration-200">
            <div className="relative flex-1">
                <input
                    ref={inputRef}
                    type="number"
                    value={value}
                    onChange={(e) => {
                        let newValue = e.target.value;
                        // If value is '0' and user types a number, replace '0'
                        if (value === '0' && newValue.length > 1 && !newValue.includes('.')) {
                            newValue = newValue.replace(/^0+/, '');
                        }
                        setValue(newValue);
                    }}
                    className="h-10 w-full rounded-[12px] border-none bg-chip px-3 pr-12 text-[16px] font-semibold text-on-surface outline-none focus:ring-2 focus:ring-accent"
                    placeholder="0.00"
                    onKeyDown={handleKeyDown}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-muted">
                    {currency}
                </span>
            </div>
            <button
                type="button"
                onClick={handleSave}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                title={t.save}
                aria-label={t.save}
            >
                <Check size={17} aria-hidden="true" />
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                title={t.cancel}
                aria-label={t.cancel}
            >
                <X size={17} aria-hidden="true" />
            </button>
        </div>
    );
};
