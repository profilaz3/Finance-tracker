import React, { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Check, Plus, Divide, Calculator, ChevronDown } from 'lucide-react';
import { Person, SharedExpense, Currency } from '../types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { CURRENCIES } from '../constants';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_COLORS } from '../constants/expenseCategories';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { getTranslations } from '../utils/i18n';
import { formatNumber } from '../utils/locale';
import { useDialog } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { MOTION } from '../config';
import { Segmented } from './ui/Segmented';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { Avatar } from './home/parts';

const label = 'mb-1.5 block px-1 text-[13px] font-semibold text-muted';
const field = 'h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent';
const chip = 'flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-[14px] font-semibold transition-colors';

interface SharedExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (expense: SharedExpense) => void;
    eventId: string;
    people: Person[]; // Only people in the event
    baseCurrency: Currency;
    expense?: SharedExpense; // Optional: for editing existing expense
    onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const SharedExpenseModal: React.FC<SharedExpenseModalProps> = ({
    isOpen,
    onClose,
    onSave,
    eventId,
    people,
    baseCurrency,
    expense, // expense to edit
    onShowToast
}) => {
    const t = getTranslations();
    // Helper for toast notification
    const showError = (message: string) => {
        if (onShowToast) {
            onShowToast(message, 'error');
        } else {
            console.error('SharedExpenseModal error (no toast handler):', message);
        }
    };
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<Currency>('EUR'); // Default to EUR
    const [date, setDate] = useState('');
    const [paidBy, setPaidBy] = useState<string>('');
    const [sharedWith, setSharedWith] = useState<string[]>([]);

    // Split Logic
    const [splitType, setSplitType] = useState<'equal' | 'exact'>('equal');
    const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
    const [category, setCategory] = useState<string>('Activities');

    useEffect(() => {
        if (isOpen) {
            if (expense) {
                // Edit mode: populate with existing expense data
                setName(expense.name);
                setAmount(expense.amount.toString());
                setCurrency(expense.currency);
                setDate(new Date(expense.date).toISOString().slice(0, 16));
                setPaidBy(expense.paidBy);
                setSharedWith(expense.sharedWith);
                setSplitType(expense.splitType || 'equal');
                setCategory(expense.category || 'Activities');
                if (expense.splitType === 'exact' && expense.splitDetails) {
                    const amounts: Record<string, string> = {};
                    Object.entries(expense.splitDetails).forEach(([id, val]) => {
                        amounts[id] = val.toString();
                    });
                    setExactAmounts(amounts);
                } else {
                    setExactAmounts({});
                }
            } else {
                // Create mode: reset to defaults
                setName('');
                setAmount('');
                setCurrency('EUR');
                setDate(new Date().toISOString().slice(0, 16));
                setPaidBy(people[0]?.id || '');
                setSharedWith(people.map(p => p.id));
                setSplitType('equal');
                setExactAmounts({});
                setCategory('Activities');
            }
        }
    }, [isOpen, people, expense]);

    // Initialize exact amounts as empty when switching to exact mode
    useEffect(() => {
        if (splitType === 'exact' && sharedWith.length > 0) {
            // Only initialize if switching modes and exactAmounts is empty
            if (Object.keys(exactAmounts).length === 0) {
                const newAmounts: Record<string, string> = {};
                sharedWith.forEach(id => {
                    newAmounts[id] = ''; // Start empty
                });
                setExactAmounts(newAmounts);
            }
        }
    }, [splitType, sharedWith]);

    const handleExactAmountChange = (personId: string, value: string) => {
        const newAmounts = {
            ...exactAmounts,
            [personId]: value
        };

        // Auto-calculate: Find fields that should be auto-filled (all except the one being edited)
        const totalAmount = parseFloat(amount) || 0;
        const otherFields = Object.keys(newAmounts).filter(id => id !== personId);

        // Count how many other fields have values
        const emptyOthers = otherFields.filter(id => !newAmounts[id] || newAmounts[id] === '');

        // If there's exactly one other field (empty or not), auto-calculate it
        if (otherFields.length === 1) {
            const otherPersonId = otherFields[0];
            const enteredAmount = parseFloat(value) || 0;
            const remaining = totalAmount - enteredAmount;

            if (remaining >= 0) {
                newAmounts[otherPersonId] = remaining.toFixed(2);
            }
        }
        // If there are multiple others but only one is empty, fill that one
        else if (emptyOthers.length === 1) {
            const emptyPersonId = emptyOthers[0];
            const assigned = Object.entries(newAmounts)
                .filter(([id]) => id !== emptyPersonId)
                .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0);
            const remaining = totalAmount - assigned;

            if (remaining >= 0) {
                newAmounts[emptyPersonId] = remaining.toFixed(2);
            }
        }

        setExactAmounts(newAmounts);
    };

    const getRemainingAmount = () => {
        const total = parseFloat(amount) || 0;
        const assigned = Object.values(exactAmounts)
            .reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        return total - assigned;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !amount || !paidBy || sharedWith.length === 0) {
            showError(t.fillAllFields);
            return;
        }

        vibrate(HAPTIC_PATTERNS.success);

        // Validate exact split
        if (splitType === 'exact') {
            const remaining = getRemainingAmount();
            if (Math.abs(remaining) > 0.01) {
                showError(t.splitAmountsMismatch.replace('{amount}', formatNumber(remaining, { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
                return;
            }
        }

        try {
            const finalExactAmounts: Record<string, number> = {};
            if (splitType === 'exact') {
                Object.entries(exactAmounts).forEach(([id, val]) => {
                    finalExactAmounts[id] = parseFloat(val) || 0;
                });
            }

            const newExpense: SharedExpense = {
                id: expense?.id || uuidv4(),
                eventId,
                name: name.trim(),
                amount: parseFloat(amount),
                currency,
                paidBy,
                sharedWith,
                date: new Date(date).toISOString(),
                splitType,
                splitDetails: splitType === 'exact' ? finalExactAmounts : undefined,
                category
            };

            onSave(newExpense);
            onClose();
        } catch (error) {
            console.error('Failed to save expense:', error);
            showError(t.saveExpenseFailed);
        }
    };

    const toggleSharedWith = (id: string) => {
        setSharedWith(prev => {
            const newSharedWith = prev.includes(id)
                ? prev.filter(p => p !== id)
                : [...prev, id];

            // If removing a person in exact mode, remove their amount
            if (prev.includes(id) && splitType === 'exact') {
                const { [id]: _, ...rest } = exactAmounts;
                setExactAmounts(rest);
            }

            return newSharedWith;
        });
    };

    const { dialogProps, titleId } = useDialog(isOpen, onClose);
    const { wrapRef, handleProps } = useSheetDrag(onClose);
    const fieldId = (name: string) => `${titleId}-${name}`;

    const remainingAmount = getRemainingAmount();
    const isExactSplitValid = Math.abs(remainingAmount) < 0.01;
    const canSubmit = !!name.trim() && !!amount && !!paidBy && sharedWith.length > 0 && people.length > 0 && (splitType === 'equal' || isExactSplitValid);

    return (
        <AnimatePresence>
        {isOpen && (
        <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center">
            <m.div
                className="paper-scrim absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={MOTION.backdrop}
                onClick={onClose}
                aria-hidden="true"
            />
            <div ref={wrapRef} className="relative flex w-full justify-center">
            <m.div
                {...dialogProps}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={MOTION.sheet.exit}
                transition={MOTION.sheet.spring}
                className="glass-sheet flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
            >
                <div className="shrink-0 touch-none" {...handleProps}>
                    <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                    <div className="flex items-center gap-2 px-5 pb-3 pt-2 md:pt-5">
                        <h2 id={titleId} className="flex-1 text-[22px] font-bold tracking-[-0.4px]">{expense ? t.editExpense : t.addSharedExpense}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t.close}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-1 custom-scrollbar">
                    {/* Amount & Currency */}
                    <div>
                        <label htmlFor={fieldId('amount')} className={label}>{t.amount}</label>
                        <div className="flex gap-2">
                            <input
                                id={fieldId('amount')}
                                type="number"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="h-14 min-w-0 flex-1 rounded-[16px] border-none bg-chip px-4 text-[24px] font-semibold tabular-nums tracking-tight text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                                autoFocus
                                step="0.01"
                            />
                            <div className="relative w-[104px] shrink-0">
                                <select
                                    value={currency}
                                    aria-label={t.currency}
                                    onChange={(e) => setCurrency(e.target.value as Currency)}
                                    className="h-14 w-full appearance-none rounded-[16px] border-none bg-chip pl-4 pr-9 text-[16px] font-semibold text-on-surface outline-none focus:ring-2 focus:ring-accent"
                                >
                                    {CURRENCIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                            </div>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label htmlFor={fieldId('name')} className={label}>{t.description}</label>
                        <input
                            id={fieldId('name')}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t.sharedExpenseNamePlaceholder}
                            className={field}
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <p className={label}>{t.category}</p>
                        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.category}>
                            {EXPENSE_CATEGORIES.map(cat => {
                                const selected = category === cat;
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => setCategory(cat)}
                                        className={clsx(
                                            'flex flex-col items-center gap-1.5 rounded-[18px] px-1 py-2.5 text-[12px] font-semibold transition-colors',
                                            selected ? 'bg-accent-soft text-on-surface ring-2 ring-accent' : 'bg-chip text-muted'
                                        )}
                                    >
                                        <CategoryGlyph category={{ name: cat, color: EXPENSE_CATEGORY_COLORS[cat] }} size={34} className="!rounded-[12px]" />
                                        <span className="max-w-full truncate">{cat}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date & Time */}
                    <div>
                        <label htmlFor={fieldId('date')} className={label}>{t.dateTime}</label>
                        <input
                            id={fieldId('date')}
                            type="datetime-local"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className={field}
                        />
                    </div>

                    {/* Show message if no people */}
                    {people.length === 0 && (
                        <div className="rounded-[18px] bg-neg/10 px-4 py-3 text-[14px]">
                            <p className="mb-0.5 font-semibold text-neg">{t.noPeopleInEvent}</p>
                            <p className="text-muted">
                                {t.noPeopleInEventDesc}
                            </p>
                        </div>
                    )}

                    {/* Paid By */}
                    {people.length > 0 && (
                        <div>
                            <p className={label}>{t.paidBy}</p>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.paidBy}>
                                {people.map(person => (
                                    <button
                                        key={person.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={paidBy === person.id}
                                        onClick={() => setPaidBy(person.id)}
                                        className={clsx(
                                            chip,
                                            paidBy === person.id ? 'bg-accent text-on-accent' : 'bg-chip text-muted'
                                        )}
                                    >
                                        <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                        {person.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Split Type Toggle */}
                    {people.length > 0 && (
                        <div>
                            <p className={label}>{t.splitMethod}</p>
                            <Segmented<'equal' | 'exact'>
                                ariaLabel={t.splitMethod}
                                value={splitType}
                                onChange={setSplitType}
                                options={[
                                    {
                                        value: 'equal',
                                        label: (
                                            <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                                <Divide size={15} aria-hidden="true" /> {t.equalSplit}
                                            </span>
                                        ),
                                    },
                                    {
                                        value: 'exact',
                                        label: (
                                            <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                                <Calculator size={15} aria-hidden="true" /> {t.exactAmounts}
                                            </span>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    )}

                    {/* Shared With */}
                    {people.length > 0 && (
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <p className="px-1 text-[13px] font-semibold text-muted">{t.sharedWith}</p>
                                {splitType === 'equal' && (
                                    <button
                                        type="button"
                                        onClick={() => setSharedWith(people.map(p => p.id))}
                                        className="h-8 rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
                                    >
                                        {t.selectAll}
                                    </button>
                                )}
                            </div>

                            {splitType === 'equal' ? (
                                <div className="flex flex-wrap gap-2">
                                    {people.map(person => {
                                        const included = sharedWith.includes(person.id);
                                        return (
                                            <button
                                                key={person.id}
                                                type="button"
                                                aria-pressed={included}
                                                onClick={() => toggleSharedWith(person.id)}
                                                className={clsx(
                                                    chip,
                                                    included ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'bg-chip text-muted'
                                                )}
                                            >
                                                <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                                {person.name}
                                                {included && <Check size={14} aria-hidden="true" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sharedWith.length > 0 && (
                                        <div className="paper-tile divide-y divide-hair px-3">
                                            {people.filter(p => sharedWith.includes(p.id)).map(person => (
                                                <div key={person.id} className="flex items-center gap-2.5 py-2.5">
                                                    <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{person.name}</span>
                                                    <input
                                                        type="number"
                                                        inputMode="decimal"
                                                        aria-label={person.name}
                                                        value={exactAmounts[person.id] || ''}
                                                        onChange={(e) => handleExactAmountChange(person.id, e.target.value)}
                                                        placeholder="0.00"
                                                        className="h-10 w-[104px] shrink-0 rounded-[12px] border-none bg-chip px-3 text-right text-[15px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                                                        step="0.01"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSharedWith(person.id)}
                                                        aria-label={`${t.remove} ${person.name}`}
                                                        title={t.remove}
                                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-neg/10 hover:text-neg"
                                                    >
                                                        <X size={16} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add people dropdown if not everyone is selected */}
                                    {sharedWith.length < people.length && (
                                        <div className="pt-1">
                                            <p className="mb-1.5 px-1 text-[12px] font-semibold text-faint">{t.addPersonToSplit}</p>
                                            <div className="flex flex-wrap gap-2">
                                                {people.filter(p => !sharedWith.includes(p.id)).map(person => (
                                                    <button
                                                        key={person.id}
                                                        type="button"
                                                        onClick={() => toggleSharedWith(person.id)}
                                                        className="flex h-9 items-center gap-1.5 rounded-full bg-chip pl-1 pr-3 text-[13px] font-semibold text-muted transition-colors hover:text-on-surface"
                                                    >
                                                        <Avatar name={person.name} color={person.color} image={person.avatar} size={28} />
                                                        {person.name}
                                                        <Plus size={13} aria-hidden="true" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className={clsx(
                                        'flex items-center justify-between rounded-[16px] px-4 py-2.5 text-[14px]',
                                        isExactSplitValid ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg'
                                    )}>
                                        <span className="font-semibold">{t.remaining}</span>
                                        <span className="font-bold tabular-nums">{formatNumber(remainingAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="mt-2 h-12 w-full rounded-full bg-accent text-[16px] font-semibold text-on-accent transition-colors disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
                    >
                        {expense ? t.saveChanges : t.addExpense}
                    </button>
                </form>
            </m.div>
            </div>
        </div>
        )}
        </AnimatePresence>
    );
};
