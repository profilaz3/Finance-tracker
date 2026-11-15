import React, { useState, useEffect, useMemo } from 'react';
import { m } from 'motion/react';
import { X } from 'lucide-react';
import { Currency, Transaction, SplitMode, SplitMethod, SplitShare } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { TRANSLATIONS } from '../../constants';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';
import { SplitExpenseModalProps, Recipient } from './types';
import { ModeToggle } from './ModeToggle';
import { MOTION } from '../../config';
import { useDialog } from '../../hooks/useFocusTrap';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import { CommonFields } from './CommonFields';
import { IPaidSection } from './IPaidSection';
import { TheyPaidSection } from './TheyPaidSection';
import { excludeOwnProfile } from '../../domain/people';
import { formatMoney } from '../../utils/locale';
import { formatSplitPercent } from './format';
import {
    calculateIPaidSplitSubmission,
    calculateTheyPaidSubmission,
    deriveTheyPaidRecipients,
    calculateRemainingAmount,
    calculateRemainingPercentage,
    calculateTotalSplitAmount,
    convertFeesToSplitCurrency,
    recalculateSplitShares,
    seedEvenPercentages,
    splitEvenlyInCents,
    toggleDebtRecipient,
    updateDebtRecipientAmount,
    updatePercentageShare,
} from '../../utils/splitExpenseCalculator';

export const SplitExpenseModal: React.FC<SplitExpenseModalProps> = ({
    isOpen,
    onClose,
    onSplit,
    people: allPeople,
    userProfile,
    categories,
    accounts,
    baseCurrency,
    language,
    transaction,
    events,
    activeEvent,
    linkToActiveEvent,
    onShowToast,
    rates,
    prefill
}) => {
    const t = TRANSLATIONS[language];
    // The built-in "me" already stands for the user, so their own profile is not offered again.
    const people = useMemo(
        () => excludeOwnProfile(allPeople, userProfile, transaction?.splitDetails?.shares?.map(share => share.personId)),
        [allPeople, userProfile, transaction],
    );

    // Helper for toast notification
    const showError = (message: string) => {
        if (onShowToast) {
            onShowToast(message, 'error');
        } else {
            console.error('SplitExpenseModal error (no toast handler):', message);
        }
    };

    // Mode: "I paid" or "Someone paid for me"
    const [mode, setMode] = useState<SplitMode>(prefill && !transaction && prefill.payerId !== 'self' ? 'they_paid' : 'i_paid');

    // Common fields. Amounts are numbers (undefined while empty); the fields read the typed text.
    const [amount, setAmount] = useState<number | undefined>(undefined);
    const [fees, setFees] = useState<number | undefined>(undefined);
    // Fields whose text is present but cannot be read; their last readable value is kept.
    const [amountInvalid, setAmountInvalid] = useState(false);
    const [feesInvalid, setFeesInvalid] = useState(false);
    const [invalidShares, setInvalidShares] = useState<Record<string, boolean>>({});
    const [invalidRecipients, setInvalidRecipients] = useState<Record<string, boolean>>({});
    const [currency, setCurrency] = useState<Currency>(baseCurrency);
    const [note, setNote] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString());

    // "I paid" mode fields
    // Start on the method the open effect will pick: the share recalculation runs in the same
    // commit and would otherwise level exact amounts (edited or prefilled) with the stale 'equal'.
    const [splitMethod, setSplitMethod] = useState<SplitMethod>(
        () => (transaction?.splitDetails ? transaction.splitDetails.splitMethod || 'equal' : 'exact')
    );
    const [shares, setShares] = useState<SplitShare[]>([]);

    // "Someone paid for me" mode fields
    const [payerId, setPayerId] = useState<string>('');

    // Multi-recipient support for "they_paid" mode
    const [recipients, setRecipients] = useState<Recipient[]>([]);

    // Initialize when modal opens
    useEffect(() => {
        if (isOpen) {
            setAmountInvalid(false);
            setFeesInvalid(false);
            setInvalidShares({});
            setInvalidRecipients({});
            if (transaction) {
                // Pre-fill from transaction
                setAmount(transaction.amount);
                setFees(transaction.fees || undefined);
                setCurrency(transaction.currency);
                setNote(transaction.note || '');
                setCategoryId(transaction.categoryId);
                setAccountId(transaction.accountId);
                setTransactionDate(transaction.date || new Date().toISOString());


                // If editing existing split, load split details
                if (transaction.splitDetails) {
                    setMode('i_paid');
                    setSplitMethod(transaction.splitDetails.splitMethod || 'equal');

                    // Load shares from splitDetails
                    const existingShares = transaction.splitDetails.shares || [];
                    setShares(people.map(p => {
                        const existingShare = existingShares.find(s => s.personId === p.id);
                        return {
                            personId: p.id,
                            amount: existingShare?.amount || 0,
                            percentage: existingShare?.percentage || 0,
                            isIncluded: !!existingShare
                        };
                    }));
                } else {
                    // Regular transaction being split for the first time
                    setMode('i_paid');
                    setSplitMethod('exact');
                    // Check if transaction is linked to an event - pre-select event participants
                    const linkedEvent = transaction.eventId && events
                        ? events.find(e => e.id === transaction.eventId)
                        : undefined;
                    setShares(people.map(p => ({
                        personId: p.id,
                        amount: 0,
                        percentage: 0,
                        isIncluded: linkedEvent ? linkedEvent.personIds.includes(p.id) : false
                    })));
                }
            } else {
                // Reset to defaults for new split
                setAmount(undefined);
                setFees(undefined);
                setCurrency(baseCurrency);
                setNote('');
                setCategoryId(categories.find(c => c.type === 'expense')?.id || categories[0]?.id || '');
                setAccountId(accounts[0]?.id || '');
                setTransactionDate(new Date().toISOString());
                setMode('i_paid');

                setSplitMethod('exact');
                // Start with no people selected - user picks who to split with
                setShares(people.map(p => ({
                    personId: p.id,
                    amount: 0,
                    percentage: 0,
                    isIncluded: false
                })));
            }

            setPayerId(people[0]?.id || '');

            // Initialize recipients for they_paid mode: 'self' + all people
            setRecipients([
                { personId: 'self', name: t.me, amount: 0, isIncluded: false },
                ...people.map(p => ({ personId: p.id, name: p.name, amount: 0, isIncluded: false }))
            ]);

            // Exact amounts from a receipt split: "I paid" when I paid, otherwise "Someone paid for me".
            if (prefill && !transaction) {
                const amountFor = (id: string) => prefill.amounts[id] ?? 0;
                setAmount(prefill.amount);
                setFees(undefined);
                setCurrency(prefill.currency);
                setNote(prefill.note);
                setCategoryId(prefill.categoryId);
                setAccountId(prefill.accountId);
                setTransactionDate(prefill.date);
                setSplitMethod('exact');
                setShares(people.map(p => ({ personId: p.id, amount: amountFor(p.id), percentage: 0, isIncluded: amountFor(p.id) > 0 })));
                if (prefill.payerId === 'self') {
                    setMode('i_paid');
                } else {
                    setMode('they_paid');
                    setPayerId(prefill.payerId);
                    setRecipients([
                        { personId: 'self', name: t.me, amount: amountFor('self'), isIncluded: amountFor('self') > 0 },
                        ...people.map(p => ({ personId: p.id, name: p.name, amount: amountFor(p.id), isIncluded: p.id !== prefill.payerId && amountFor(p.id) > 0 })),
                    ]);
                }
            }
        }
    }, [isOpen, transaction, people, categories, accounts, baseCurrency, events, language, prefill]);

    const totalToSplit = calculateTotalSplitAmount(amount, fees, currency, rates);

    // Recalculate shares when amount, fees or included people change
    useEffect(() => {
        if (splitMethod === 'equal' || splitMethod === 'percentage') {
            setShares(prev => recalculateSplitShares(prev, splitMethod, totalToSplit));
        }
    }, [totalToSplit, splitMethod]);

    /**
     * Reads what a field emitted. Text that can't be read counts as nothing (so the totals shown
     * stay honest) and is flagged; the field keeps the text. A negative number is flagged and the
     * last value kept, since storing 0 would make the field replace the typed text.
     */
    const readTyped = (value: number | undefined, text: string) => ({
        invalid: value === undefined ? text.trim() !== '' : value < 0,
        keep: value !== undefined && value < 0,
        value,
    });

    const handleAmountChange = (value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setAmountInvalid(typed.invalid);
        if (!typed.keep) setAmount(typed.value);
    };

    const handleFeesChange = (value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setFeesInvalid(typed.invalid);
        if (!typed.keep) setFees(typed.value);
    };

    const handleSplitMethodChange = (method: SplitMethod) => {
        setInvalidShares({});
        setSplitMethod(method);
        // Percentages start everyone, me included, on an even share; the effect fills the amounts.
        if (method === 'percentage') setShares(prev => seedEvenPercentages(prev, totalToSplit));
    };

    const togglePersonIncluded = (personId: string) => {
        setInvalidShares(prev => ({ ...prev, [personId]: false }));
        setShares(prev => {
            const newShares = prev.map(s =>
                s.personId === personId ? { ...s, isIncluded: !s.isIncluded } : s
            );
            return recalculateSplitShares(newShares, splitMethod, totalToSplit);
        });
    };

    const updateShareAmount = (personId: string, value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setInvalidShares(prev => ({ ...prev, [personId]: typed.invalid }));
        if (typed.keep) return;
        const newAmount = Math.round((typed.value ?? 0) * 100) / 100;
        setShares(prev => prev.map(s =>
            s.personId === personId ? { ...s, amount: newAmount } : s
        ));
    };

    // Above 100% is kept as typed: the indicator and the reason under the button say it is over.
    const updateSharePercentage = (personId: string, value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setInvalidShares(prev => ({ ...prev, [personId]: typed.invalid }));
        if (typed.keep) return;
        setShares(prev => updatePercentageShare(prev, personId, typed.value ?? 0, totalToSplit));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        vibrate(HAPTIC_PATTERNS.success);

        if (mode === 'i_paid') {
            const eventId = transaction?.eventId || (linkToActiveEvent && activeEvent ? activeEvent.id : undefined);
            const result = calculateIPaidSplitSubmission({
                amount,
                fees,
                currency,
                categoryId,
                accountId,
                note,
                transactionDate,
                splitMethod,
                shares,
                rates,
                transactionId: uuidv4(),
                transaction,
                eventId,
                language,
            });

            if (result.error === 'no-participants') {
                showError(t.splitErrorNoParticipants);
                return;
            }

            if (result.error === 'invalid-amount') {
                showError(t.splitErrorInvalidAmount);
                return;
            }

            if (result.error === 'exceeds-total') {
                showError(t.splitErrorExceedsTotal);
                return;
            }

            // A split started from a scanned receipt keeps the receipt on the expense.
            const splitTransaction = result.transaction && prefill?.receiptData && !transaction
                ? { ...result.transaction, receiptData: prefill.receiptData }
                : result.transaction;
            onSplit({ transactions: splitTransaction ? [splitTransaction] : [], balanceUpdates: result.balanceUpdates });
            onClose();

        } else {
            const result = calculateTheyPaidSubmission({
                payerId,
                currency,
                recipients: includedRecipients,
            });

            if (result.error === 'missing-payer') {
                showError(t.splitErrorNoPayer);
                return;
            }

            if (result.error === 'no-amounts') {
                showError(t.splitErrorNoAmounts);
                return;
            }

            onSplit({ transactions: result.transactions, balanceUpdates: result.balanceUpdates });
            onClose();
        }
    };

    const getPerson = (id: string) => people.find(p => p.id === id);

    const toggleRecipient = (personId: string) => {
        setInvalidRecipients(prev => ({ ...prev, [personId]: false }));
        setRecipients(prev => toggleDebtRecipient(prev, personId));
    };

    const updateRecipientAmount = (personId: string, value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setInvalidRecipients(prev => ({ ...prev, [personId]: typed.invalid }));
        if (typed.keep) return;
        setRecipients(prev => updateDebtRecipientAmount(prev, personId, typed.value ?? 0));
    };

    const { availableRecipients, includedRecipients, recipientTotal } = deriveTheyPaidRecipients(recipients, payerId);

    const { dialogProps, titleId } = useDialog(isOpen, onClose);
    const { wrapRef, handleProps } = useSheetDrag(onClose);

    if (!isOpen) return null;

    const remainingAmount = calculateRemainingAmount(shares, totalToSplit);
    const remainingPercentage = calculateRemainingPercentage(shares);
    const includedCount = shares.filter(s => s.isIncluded).length;
    const yourPortionPreview = splitMethod === 'equal'
        ? (includedCount > 0 ? splitEvenlyInCents(totalToSplit, includedCount + 1)[0] : 0)
        : remainingAmount;
    const feesInSplitCurrency = convertFeesToSplitCurrency(fees, currency, rates);

    // Why the button is disabled, shown under it. My share is what the others leave, so in
    // exact and percentage splits anything from zero up is fine; only going over blocks.
    const blockReason = (() => {
        if (mode === 'i_paid') {
            const sharesUnreadable = splitMethod !== 'equal' && shares.some(s => s.isIncluded && invalidShares[s.personId]);
            if (amountInvalid || feesInvalid || sharesUnreadable) return t.splitBlockUnreadable;
            if (!(totalToSplit > 0)) return t.splitBlockNoAmount;
            if (includedCount === 0) return t.splitBlockNoPeople;
            if (splitMethod === 'exact' && remainingAmount < -0.005) {
                return t.splitSharesOverTotal.replace('{amount}', formatMoney(-remainingAmount, currency, language));
            }
            if (splitMethod === 'percentage' && remainingPercentage < -0.005) {
                return t.splitPercentOver.replace('{percent}', formatSplitPercent(-remainingPercentage, language));
            }
            return null;
        }
        if (!payerId) return t.splitBlockNoPayer;
        if (includedRecipients.length === 0) return t.splitBlockNoRecipients;
        if (includedRecipients.some(r => invalidRecipients[r.personId])) return t.splitBlockUnreadable;
        if (recipientTotal <= 0) return t.splitBlockNoAmounts;
        return null;
    })();
    const blockReasonId = 'split-expense-block-reason';

    return (
        <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center">
            <m.div
                className="paper-scrim absolute inset-0"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
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
                {/* Header */}
                <div className="shrink-0 touch-none" {...handleProps}>
                    <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                    <div className="flex items-center gap-2 px-5 pb-3 pt-2 md:pt-5">
                        <h2 id={titleId} className="flex-1 text-[22px] font-bold tracking-[-0.4px]">{t.splitTransaction}</h2>
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

                {/* Mode Toggle */}
                <ModeToggle mode={mode} setMode={setMode} language={language} />

                <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 custom-scrollbar">
                    {/* Common Fields */}
                    <CommonFields
                        mode={mode}
                        amount={amount}
                        onAmountChange={handleAmountChange}
                        amountInvalid={amountInvalid}
                        currency={currency}
                        setCurrency={setCurrency}
                        transactionDate={transactionDate}
                        setTransactionDate={setTransactionDate}
                        fees={fees}
                        onFeesChange={handleFeesChange}
                        feesInvalid={feesInvalid}
                        feesInSplitCurrency={feesInSplitCurrency}
                        note={note}
                        setNote={setNote}
                        categoryId={categoryId}
                        setCategoryId={setCategoryId}
                        accountId={accountId}
                        setAccountId={setAccountId}
                        categories={categories}
                        accounts={accounts}
                        language={language}
                        t={t}
                    />

                    {/* Mode-specific content */}
                    {mode === 'i_paid' ? (
                        <IPaidSection
                            splitMethod={splitMethod}
                            setSplitMethod={handleSplitMethodChange}
                            shares={shares}
                            totalToSplit={totalToSplit}
                            currency={currency}
                            people={people}
                            language={language}
                            t={t}
                            togglePersonIncluded={togglePersonIncluded}
                            updateShareAmount={updateShareAmount}
                            updateSharePercentage={updateSharePercentage}
                            invalidShares={invalidShares}
                            remainingAmount={remainingAmount}
                            remainingPercentage={remainingPercentage}
                            includedCount={includedCount}
                            yourPortionPreview={yourPortionPreview}
                        />
                    ) : (
                        <TheyPaidSection
                            people={people}
                            payerId={payerId}
                            setPayerId={setPayerId}
                            availableRecipients={availableRecipients}
                            includedRecipients={includedRecipients}
                            recipientTotal={recipientTotal}
                            toggleRecipient={toggleRecipient}
                            updateRecipientAmount={updateRecipientAmount}
                            invalidRecipients={invalidRecipients}
                            currency={currency}
                            language={language}
                            getPerson={getPerson}
                        />
                    )}

                    {/* Submit Button */}
                    <div>
                        <button
                            type="submit"
                            disabled={!!blockReason}
                            aria-describedby={blockReason ? blockReasonId : undefined}
                            className="mt-2 h-12 w-full rounded-full bg-accent text-[16px] font-semibold text-on-accent transition-colors disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
                        >
                            {mode === 'i_paid'
                                ? t.splitExpense
                                : t.addDebt
                            }
                        </button>
                        {blockReason && (
                            <p id={blockReasonId} aria-live="polite" className="mt-2 px-2 text-center text-[13px] font-medium text-muted">
                                {blockReason}
                            </p>
                        )}
                    </div>
                </form>
            </m.div>
            </div>
        </div>
    );
};
