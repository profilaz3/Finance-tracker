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
                    className="w-full bg-surface-container-highest border-b-2 border-primary focus:border-primary px-2 py-1 text-lg font-mono text-on-surface outline-none transition-all"
                    placeholder="0.00"
                    onKeyDown={handleKeyDown}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-on-surface-variant pointer-events-none">
                    {currency}
                </span>
            </div>
            <button
                onClick={handleSave}
                className="p-2 bg-primary text-on-primary rounded-full hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95"
                title={t.save}
            >
                <Check size={16} />
            </button>
            <button
                onClick={onCancel}
                className="p-2 bg-surface-container-highest text-on-surface-variant rounded-full hover:bg-error-container hover:text-on-error-container transition-transform hover:scale-105 active:scale-95"
                title={t.cancel}
            >
                <X size={16} />
            </button>
        </div>
    );
};
