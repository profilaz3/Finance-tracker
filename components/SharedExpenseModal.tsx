import React, { useState, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Check, Plus, Divide, Calculator, ChevronDown, AlertCircle } from 'lucide-react';
import { Person, SharedExpense, Currency } from '../types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { CURRENCIES } from '../constants';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_COLORS } from '../constants/expenseCategories';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { getTranslations } from '../utils/i18n';
import { formatMoney, formatNumber, getAppLanguage } from '../utils/locale';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../utils/dateTimeLocal';
import { localizeEventExpenseCategory } from '../domain/eventExpenseCategory';
import { AmountInput } from './ui/AmountInput';
import { useDialog } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { MOTION } from '../config';
import { Segmented } from './ui/Segmented';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { Avatar } from './home/parts';

const label = 'mb-1.5 block px-1 text-[13px] font-semibold text-muted';
const field = 'h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent';
const chip = 'flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-[14px] font-semibold transition-colors';

const toCents = (value: number | undefined) => Math.round((value ?? 0) * 100);

const FieldError: React.FC<{ id: string; message: string | null }> = ({ id, message }) =>
    message ? (
        <div id={id} role="alert" className="mt-1 flex items-center gap-1 px-1 text-[12px] text-neg">
            <AlertCircle size={12} aria-hidden="true" />
            <span>{message}</span>
        </div>
    ) : null;

interface SharedExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (expense: SharedExpense) => void;
    eventId: string;
    people: Person[]; // Only people in the event
    baseCurrency: Currency;
    /** Currency a new expense starts in (the event's usual one); falls back to `baseCurrency`. */
    defaultCurrency?: Currency;
    expense?: SharedExpense; // Optional: for editing existing expense
    onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
    language?: 'en' | 'sr';
    /**
     * A guest in someone else's event: "Paid by" starts empty and must be chosen. The first
     * participant is the organizer, so preselecting it would record their payment by mistake.
     */
    requirePayer?: boolean;
}

export const SharedExpenseModal: React.FC<SharedExpenseModalProps> = ({
    isOpen,
    onClose,
    onSave,
    eventId,
    people,
    baseCurrency,
    defaultCurrency,
    expense, // expense to edit
    onShowToast,
    language: languageProp,
    requirePayer = false,
}) => {
    const t = getTranslations();
    const language = languageProp ?? getAppLanguage();
    // Helper for toast notification
    const showError = (message: string) => {
        if (onShowToast) {
            onShowToast(message, 'error');
        } else {
            console.error('SharedExpenseModal error (no toast handler):', message);
        }
    };
    const [name, setName] = useState('');
    // Amounts are typed in the app language ("1.500,50" in Serbian) and parsed by AmountInput.
    const [amount, setAmount] = useState<number | undefined>(undefined);
    const [amountText, setAmountText] = useState('');
    const [currency, setCurrency] = useState<Currency>(defaultCurrency ?? baseCurrency);
    // Local wall-clock "YYYY-MM-DDTHH:mm" (see utils/dateTimeLocal: no UTC shift on save).
    const [date, setDate] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [paidBy, setPaidBy] = useState<string>('');
    const [sharedWith, setSharedWith] = useState<string[]>([]);

    // Split Logic
    const [splitType, setSplitType] = useState<'equal' | 'exact'>('equal');
    // Per person: the parsed amount (undefined while empty or unreadable) and whether text is unreadable.
    const [exactAmounts, setExactAmounts] = useState<Record<string, number | undefined>>({});
    const [exactUnreadable, setExactUnreadable] = useState<Record<string, boolean>>({});
    const [category, setCategory] = useState<string>('Activities');

    // Reset when the sheet opens (or another expense is edited), not on every state update while
    // it is open: `people` is rebuilt whenever app state changes and would wipe what was typed.
    const openedFor = useRef<{ expense?: SharedExpense } | null>(null);
    useEffect(() => {
        if (!isOpen) {
            openedFor.current = null;
            return;
        }
        if (openedFor.current && openedFor.current.expense === expense) return;
        openedFor.current = { expense };
        {
            setSubmitted(false);
            setExactUnreadable({});
            if (expense) {
                // Edit mode: populate with existing expense data
                setName(expense.name);
                setAmount(expense.amount);
                setAmountText(String(expense.amount));
                setCurrency(expense.currency);
                setDate(toDateTimeLocalValue(expense.date));
                setPaidBy(expense.paidBy);
                setSharedWith(expense.sharedWith);
                setSplitType(expense.splitType || 'equal');
                setCategory(expense.category || 'Activities');
                setExactAmounts(expense.splitType === 'exact' && expense.splitDetails ? { ...expense.splitDetails } : {});
            } else {
                // Create mode: reset to defaults
                setName('');
                setAmount(undefined);
                setAmountText('');
                setCurrency(defaultCurrency ?? baseCurrency);
                setDate(toDateTimeLocalValue(new Date()));
                setPaidBy(requirePayer ? '' : people[0]?.id || '');
                setSharedWith(people.map(p => p.id));
                setSplitType('equal');
                setExactAmounts({});
                setCategory('Activities');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens or the edited expense changes
    }, [isOpen, people, expense]);

    const handleExactAmountChange = (personId: string, value: number | undefined, text: string) => {
        setExactUnreadable(prev => ({ ...prev, [personId]: !!text.trim() && value === undefined }));
        const newAmounts: Record<string, number | undefined> = { ...exactAmounts, [personId]: value };
        sharedWith.forEach(id => {
            if (!(id in newAmounts)) newAmounts[id] = undefined;
        });

        // Auto-fill the last open share with what is left (in cents, so it adds up exactly).
        const totalCents = toCents(amount);
        const others = sharedWith.filter(id => id !== personId);
        const emptyOthers = others.filter(id => newAmounts[id] === undefined);
        const target = others.length === 1 ? others[0] : emptyOthers.length === 1 ? emptyOthers[0] : null;
        if (target) {
            const assigned = sharedWith.filter(id => id !== target).reduce((sum, id) => sum + toCents(newAmounts[id]), 0);
            const remaining = totalCents - assigned;
            if (remaining >= 0) {
                newAmounts[target] = remaining / 100;
                setExactUnreadable(prev => ({ ...prev, [target]: false }));
            }
        }

        setExactAmounts(newAmounts);
    };

    const getRemainingAmount = () => {
        const assigned = sharedWith.reduce((sum, id) => sum + toCents(exactAmounts[id]), 0);
        return (toCents(amount) - assigned) / 100;
    };

    const amountUnreadable = !!amountText.trim() && amount === undefined;
    const amountValid = amount !== undefined && amount > 0;
    const dateIso = fromDateTimeLocalValue(date, expense?.date);
    const anyShareUnreadable = splitType === 'exact' && sharedWith.some(id => exactUnreadable[id]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        if (!name.trim() || !amountValid || !paidBy || sharedWith.length === 0 || !dateIso || anyShareUnreadable) {
            vibrate(HAPTIC_PATTERNS.error);
            return;
        }

        // Validate exact split
        if (splitType === 'exact') {
            const remaining = getRemainingAmount();
            if (Math.abs(remaining) > 0.005) {
                showError(t.splitAmountsMismatch.replace('{amount}', formatNumber(remaining, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)));
                return;
            }
        }

        vibrate(HAPTIC_PATTERNS.success);

        try {
            const finalExactAmounts: Record<string, number> = {};
            if (splitType === 'exact') {
                sharedWith.forEach(id => {
                    finalExactAmounts[id] = toCents(exactAmounts[id]) / 100;
                });
            }

            const newExpense: SharedExpense = {
                id: expense?.id || uuidv4(),
                eventId,
                name: name.trim(),
                amount: toCents(amount) / 100,
                currency,
                paidBy,
                sharedWith,
                date: dateIso,
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
                setExactUnreadable(current => ({ ...current, [id]: false }));
            }

            return newSharedWith;
        });
    };

    const { dialogProps, titleId } = useDialog(isOpen, onClose);
    const { wrapRef, handleProps } = useSheetDrag(onClose);
    const fieldId = (name: string) => `${titleId}-${name}`;

    const remainingAmount = getRemainingAmount();
    const isExactSplitValid = Math.abs(remainingAmount) < 0.005;

    // Say what is missing instead of only greying out the button.
    const missing = [
        !amountValid && (amountUnreadable ? t.splitBlockUnreadable : t.splitBlockNoAmount),
        !name.trim() && t.sharedBlockNoName,
        !dateIso && t.sharedDateInvalid,
        people.length > 0 && !paidBy && t.splitBlockNoPayer,
        people.length > 0 && sharedWith.length === 0 && t.splitBlockNoPeople,
        anyShareUnreadable && t.splitBlockUnreadable,
        splitType === 'exact' && amountValid && sharedWith.length > 0 && !anyShareUnreadable && !isExactSplitValid
            && t.splitAmountsMismatch.replace('{amount}', formatNumber(remainingAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, language)),
    ].filter((item): item is string => !!item);
    const uniqueMissing = [...new Set(missing)];
    const canSubmit = uniqueMissing.length === 0 && people.length > 0;
    // Guests choose the payer themselves: say so at the field once the rest is filled in or on submit.
    const payerError = people.length > 0 && !paidBy && (submitted || (requirePayer && amountValid && !!name.trim()))
        ? t.splitBlockNoPayer
        : null;
    const amountError = amountUnreadable
        ? t.settleAmountUnreadable
        : submitted && !amountValid ? t.settleAmountInvalid : null;

    // Equal split: what each person's share comes to (the payer absorbs leftover cents).
    const equalShare = splitType === 'equal' && amountValid && sharedWith.length > 0
        ? Math.floor(toCents(amount) / sharedWith.length) / 100
        : null;

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
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} noValidate className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-1 custom-scrollbar">
                    {/* Amount & Currency */}
                    <div>
                        <label htmlFor={fieldId('amount')} className={label}>{t.amount}</label>
                        <div className="flex gap-2">
                            <AmountInput
                                id={fieldId('amount')}
                                value={amount}
                                onValueChange={(next, text) => {
                                    setAmount(next);
                                    setAmountText(text);
                                }}
                                language={language}
                                emptyWhenZero
                                placeholder={language === 'sr' ? '0,00' : '0.00'}
                                aria-invalid={!!amountError}
                                aria-describedby={amountError ? fieldId('amount-error') : undefined}
                                className="h-14 min-w-0 flex-1 rounded-[16px] border-none bg-chip px-4 text-[24px] font-semibold tabular-nums tracking-tight text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                                autoFocus
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
                        <FieldError id={fieldId('amount-error')} message={amountError} />
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
                            aria-invalid={submitted && !name.trim()}
                            aria-describedby={submitted && !name.trim() ? fieldId('name-error') : undefined}
                            className={field}
                        />
                        <FieldError id={fieldId('name-error')} message={submitted && !name.trim() ? t.sharedBlockNoName : null} />
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
                                        <span className="max-w-full truncate">{localizeEventExpenseCategory(cat, language)}</span>
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
                            aria-invalid={!dateIso}
                            aria-describedby={!dateIso ? fieldId('date-error') : undefined}
                            className={field}
                        />
                        <FieldError id={fieldId('date-error')} message={!dateIso ? t.sharedDateInvalid : null} />
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
                            <p id={fieldId('paid-by')} className={label}>{t.paidBy}</p>
                            <div
                                className="flex flex-wrap gap-2"
                                role="radiogroup"
                                aria-labelledby={fieldId('paid-by')}
                                aria-required={requirePayer || undefined}
                                aria-invalid={!!payerError || undefined}
                                aria-describedby={payerError ? fieldId('paid-by-error') : undefined}
                            >
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
                            <FieldError id={fieldId('paid-by-error')} message={payerError} />
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
                                        className="h-10 rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
                                    >
                                        {t.selectAll}
                                    </button>
                                )}
                            </div>

                            {splitType === 'equal' ? (
                                <>
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
                                {equalShare !== null && (
                                    <p className="mt-2 px-1 text-[13px] font-semibold tabular-nums text-muted" aria-live="polite">
                                        {t.sharedEachAmount.replace('{amount}', formatMoney(equalShare, currency, language))}
                                    </p>
                                )}
                                </>
                            ) : (
                                <div className="space-y-2">
                                    {sharedWith.length > 0 && (
                                        <div className="paper-tile divide-y divide-hair px-3">
                                            {people.filter(p => sharedWith.includes(p.id)).map(person => (
                                                <div key={person.id} className="py-2.5">
                                                <div className="flex items-center gap-2.5">
                                                    <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{person.name}</span>
                                                    <AmountInput
                                                        aria-label={person.name}
                                                        value={exactAmounts[person.id]}
                                                        onValueChange={(next, text) => handleExactAmountChange(person.id, next, text)}
                                                        language={language}
                                                        placeholder={language === 'sr' ? '0,00' : '0.00'}
                                                        aria-invalid={!!exactUnreadable[person.id]}
                                                        aria-describedby={exactUnreadable[person.id] ? fieldId(`share-${person.id}-error`) : undefined}
                                                        className="h-10 w-[112px] shrink-0 rounded-[12px] border-none bg-chip px-3 text-right text-[15px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSharedWith(person.id)}
                                                        aria-label={`${t.remove} ${person.name}`}
                                                        title={t.remove}
                                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-neg/10 hover:text-neg"
                                                    >
                                                        <X size={16} aria-hidden="true" />
                                                    </button>
                                                </div>
                                                <FieldError id={fieldId(`share-${person.id}-error`)} message={exactUnreadable[person.id] ? t.settleAmountUnreadable : null} />
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
                                                        className="flex h-10 items-center gap-1.5 rounded-full bg-chip pl-1 pr-3 text-[13px] font-semibold text-muted transition-colors hover:text-on-surface"
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
                                        <span className="font-bold tabular-nums">{formatMoney(remainingAmount, currency, language)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        aria-describedby={!canSubmit && uniqueMissing.length > 0 ? fieldId('missing') : undefined}
                        className="mt-2 h-12 w-full rounded-full bg-accent text-[16px] font-semibold text-on-accent transition-colors disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
                    >
                        {expense ? t.saveChanges : t.addExpense}
                    </button>
                    {!canSubmit && uniqueMissing.length > 0 && (
                        <p id={fieldId('missing')} className="-mt-3 px-1 text-center text-[13px] text-muted" aria-live="polite">
                            {t.sharedBlockMissing.replace('{items}', uniqueMissing.map(item => item.charAt(0).toLocaleLowerCase() + item.slice(1)).join(', '))}
                        </p>
                    )}
                </form>
            </m.div>
            </div>
        </div>
        )}
        </AnimatePresence>
    );
};
