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
import {
    calculateIPaidSplitSubmission,
    calculateTheyPaidSubmission,
    deriveTheyPaidRecipients,
    calculateRemainingAmount,
    calculateRemainingPercentage,
    calculateTotalSplitAmount,
    recalculateSplitShares,
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

    // Common fields
    const [amount, setAmount] = useState('');
    const [fees, setFees] = useState('');
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
            if (transaction) {
                // Pre-fill from transaction
                setAmount(transaction.amount.toString());
                setFees(transaction.fees?.toString() || '');
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
                setAmount('');
                setFees('');
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
                setAmount(String(prefill.amount));
                setFees('');
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

    // Recalculate shares when amount, fees or included people change
    useEffect(() => {
        if (splitMethod === 'equal' || splitMethod === 'percentage') {
            const totalToSplit = calculateTotalSplitAmount(amount, fees, currency, rates);
            setShares(prev => recalculateSplitShares(prev, splitMethod, totalToSplit));
        }
    }, [amount, fees, splitMethod, currency, rates]);

    const togglePersonIncluded = (personId: string) => {
        setShares(prev => {
            const newShares = prev.map(s =>
                s.personId === personId ? { ...s, isIncluded: !s.isIncluded } : s
            );
            const totalToSplit = calculateTotalSplitAmount(amount, fees, currency, rates);
            return recalculateSplitShares(newShares, splitMethod, totalToSplit);
        });
    };

    const updateShareAmount = (personId: string, value: string) => {
        const newAmount = parseFloat(value) || 0;
        setShares(prev => prev.map(s =>
            s.personId === personId ? { ...s, amount: Math.round(newAmount * 100) / 100 } : s
        ));
    };

    const updateSharePercentage = (personId: string, value: string) => {
        const totalToSplit = calculateTotalSplitAmount(amount, fees, currency, rates);
        setShares(prev => updatePercentageShare(prev, personId, value, totalToSplit));
    };

    const getRemainingAmount = () => {
        const totalToSplit = calculateTotalSplitAmount(amount, fees, currency, rates);
        return calculateRemainingAmount(shares, totalToSplit);
    };

    const getRemainingPercentage = () => {
        return calculateRemainingPercentage(shares);
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
        setRecipients(prev => toggleDebtRecipient(prev, personId));
    };

    const updateRecipientAmount = (personId: string, value: string) => {
        setRecipients(prev => updateDebtRecipientAmount(prev, personId, value));
    };

    const { availableRecipients, includedRecipients, recipientTotal } = deriveTheyPaidRecipients(recipients, payerId);

    const { dialogProps, titleId } = useDialog(isOpen, onClose);
    const { wrapRef, handleProps } = useSheetDrag(onClose);

    if (!isOpen) return null;

    const remainingAmount = getRemainingAmount();
    const remainingPercentage = getRemainingPercentage();
    const totalToSplit = calculateTotalSplitAmount(amount, fees, currency, rates);
    // For exact mode: remaining >= 0 is valid (remaining is your portion)
    // For percentage mode: remaining should be ~0 (percentages should add to 100%)
    const isValidSplit = splitMethod === 'equal' ||
        (splitMethod === 'exact' && remainingAmount >= -0.01) ||
        (splitMethod === 'percentage' && Math.abs(remainingPercentage) < 0.01);
    const includedCount = shares.filter(s => s.isIncluded).length;
    const yourPortionPreview = splitMethod === 'equal'
        ? (includedCount > 0 ? totalToSplit / (includedCount + 1) : 0)
        : remainingAmount;

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
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
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
                        setAmount={setAmount}
                        currency={currency}
                        setCurrency={setCurrency}
                        transactionDate={transactionDate}
                        setTransactionDate={setTransactionDate}
                        fees={fees}
                        setFees={setFees}
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
                            setSplitMethod={setSplitMethod}
                            shares={shares}
                            setShares={setShares}
                            amount={amount}
                            fees={fees}
                            currency={currency}
                            people={people}
                            language={language}
                            t={t}
                            togglePersonIncluded={togglePersonIncluded}
                            updateShareAmount={updateShareAmount}
                            updateSharePercentage={updateSharePercentage}
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
                            currency={currency}
                            language={language}
                            getPerson={getPerson}
                        />
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={
                            (mode === 'i_paid' && (includedCount === 0 || !isValidSplit || !(parseFloat(amount) > 0))) ||
                            (mode === 'they_paid' && (!payerId || includedRecipients.length === 0 || recipientTotal <= 0))
                        }
                        className="mt-2 h-12 w-full rounded-full bg-accent text-[16px] font-semibold text-on-accent transition-colors disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
                    >
                        {mode === 'i_paid'
                            ? t.splitExpense
                            : t.addDebt
                        }
                    </button>
                </form>
            </m.div>
            </div>
        </div>
    );
};
