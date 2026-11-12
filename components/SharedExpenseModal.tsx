import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Check, Users, DollarSign, Calendar, Divide, Calculator } from 'lucide-react';
import { Person, SharedExpense, Currency } from '../types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { CURRENCIES } from '../constants';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_COLORS } from '../constants/expenseCategories';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';

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
            showError('Please fill in all fields');
            return;
        }

        vibrate(HAPTIC_PATTERNS.success);

        // Validate exact split
        if (splitType === 'exact') {
            const remaining = getRemainingAmount();
            if (Math.abs(remaining) > 0.01) {
                showError(`The split amounts don't match the total. Remaining: ${remaining.toFixed(2)}`);
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
            showError('Failed to save expense. Please try again.');
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

    if (!isOpen) return null;

    const remainingAmount = getRemainingAmount();
    const isExactSplitValid = Math.abs(remainingAmount) < 0.01;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-sm">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="p-4 border-b border-outline/10 flex items-center justify-between">
                    <h2 className="text-xl font-bold font-display text-on-surface">{expense ? 'Edit Expense' : 'Add Shared Expense'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                        <X size={20} className="text-on-surface-variant" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    {/* Amount & Currency */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">Amount</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20 text-lg font-medium"
                                    autoFocus
                                    step="0.01"
                                />
                            </div>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value as Currency)}
                                className="px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20 font-medium"
                            >
                                {CURRENCIES.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">Description</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Dinner at Mario's"
                            className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">Category</label>
                        <div className="flex flex-wrap gap-2">
                            {EXPENSE_CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategory(cat)}
                                    className={clsx(
                                        "px-4 py-2 rounded-xl text-sm font-medium transition-all border",
                                        category === cat
                                            ? "text-white border-transparent shadow-md"
                                            : "bg-surface-container text-on-surface-variant border-transparent hover:bg-surface-container-high"
                                    )}
                                    style={{
                                        backgroundColor: category === cat ? EXPENSE_CATEGORY_COLORS[cat] : undefined
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date & Time */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">Date & Time</label>
                        <input
                            type="datetime-local"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    {/* Show message if no people */}
                    {people.length === 0 && (
                        <div className="bg-error/10 border border-error/20 rounded-xl p-4 text-sm">
                            <p className="text-error font-medium mb-1">No people in this event!</p>
                            <p className="text-on-surface-variant">
                                You need to add people to the event before creating shared expenses.
                                Go to Settings → People to add yourself and others.
                            </p>
                        </div>
                    )}

                    {/* Paid By */}
                    {people.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-on-surface-variant mb-2">Paid By</label>
                            <div className="flex flex-wrap gap-2">
                                {people.map(person => (
                                    <button
                                        key={person.id}
                                        type="button"
                                        onClick={() => setPaidBy(person.id)}
                                        className={clsx(
                                            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                                            paidBy === person.id
                                                ? "bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/20"
                                                : "bg-surface-container text-on-surface-variant border-transparent hover:bg-surface-container-high"
                                        )}
                                    >
                                        {person.avatar ? (
                                            <img src={person.avatar} alt="" aria-hidden="true" className="w-5 h-5 rounded-full object-cover" />
                                        ) : (
                                            <div aria-hidden="true" className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: person.color + '20', color: person.color }}>
                                                {person.name[0]}
                                            </div>
                                        )}
                                        {person.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Split Type Toggle */}
                    {people.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-on-surface-variant mb-2">Split Method</label>
                            <div className="flex bg-surface-container rounded-xl p-1">
                                <button
                                    type="button"
                                    onClick={() => setSplitType('equal')}
                                    className={clsx(
                                        "flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                                        splitType === 'equal'
                                            ? "bg-surface shadow-sm text-on-surface"
                                            : "text-on-surface-variant hover:text-on-surface"
                                    )}
                                >
                                    <Divide size={16} /> Equal
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSplitType('exact')}
                                    className={clsx(
                                        "flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                                        splitType === 'exact'
                                            ? "bg-surface shadow-sm text-on-surface"
                                            : "text-on-surface-variant hover:text-on-surface"
                                    )}
                                >
                                    <Calculator size={16} /> Exact Amounts
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Shared With */}
                    {people.length > 0 && (
                        <div>
                            <label className="flex items-center justify-between text-sm font-medium text-on-surface-variant mb-2">
                                <span>Shared With</span>
                                {splitType === 'equal' && (
                                    <button
                                        type="button"
                                        onClick={() => setSharedWith(people.map(p => p.id))}
                                        className="text-primary text-xs hover:underline"
                                    >
                                        Select All
                                    </button>
                                )}
                            </label>

                            {splitType === 'equal' ? (
                                <div className="flex flex-wrap gap-2">
                                    {people.map(person => (
                                        <button
                                            key={person.id}
                                            type="button"
                                            onClick={() => toggleSharedWith(person.id)}
                                            className={clsx(
                                                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                                                sharedWith.includes(person.id)
                                                    ? "bg-secondary/10 text-secondary border-secondary/20"
                                                    : "bg-surface-container text-on-surface-variant border-transparent hover:bg-surface-container-high opacity-60"
                                            )}
                                        >
                                            {person.avatar ? (
                                                <img src={person.avatar} alt="" aria-hidden="true" className="w-5 h-5 rounded-full object-cover" />
                                            ) : (
                                                <div aria-hidden="true" className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: person.color + '20', color: person.color }}>
                                                    {person.name[0]}
                                                </div>
                                            )}
                                            {person.name}
                                            {sharedWith.includes(person.id) && <Check size={14} />}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {people.filter(p => sharedWith.includes(p.id)).map(person => (
                                        <div key={person.id} className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 w-1/3">
                                                {person.avatar ? (
                                                    <img src={person.avatar} alt="" aria-hidden="true" className="w-6 h-6 rounded-full object-cover" />
                                                ) : (
                                                    <div aria-hidden="true" className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: person.color + '20', color: person.color }}>
                                                        {person.name[0]}
                                                    </div>
                                                )}
                                                <span className="text-sm font-medium truncate">{person.name}</span>
                                            </div>
                                            <div className="flex-1 relative">
                                                <input
                                                    type="number"
                                                    value={exactAmounts[person.id] || ''}
                                                    onChange={(e) => handleExactAmountChange(person.id, e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full px-3 py-2 bg-surface-container rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-sm"
                                                    step="0.01"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => toggleSharedWith(person.id)}
                                                className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant"
                                                title="Remove"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add people dropdown if not everyone is selected */}
                                    {sharedWith.length < people.length && (
                                        <div className="mt-2">
                                            <p className="text-xs text-on-surface-variant mb-2">Add person to split:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {people.filter(p => !sharedWith.includes(p.id)).map(person => (
                                                    <button
                                                        key={person.id}
                                                        type="button"
                                                        onClick={() => toggleSharedWith(person.id)}
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-full text-xs font-medium transition-colors"
                                                    >
                                                        <Users size={12} />
                                                        {person.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!name.trim() || !amount || !paidBy || sharedWith.length === 0 || people.length === 0 || (splitType === 'exact' && !isExactSplitValid)}
                        className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-4"
                    >
                        {expense ? 'Save Changes' : 'Add Expense'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};
