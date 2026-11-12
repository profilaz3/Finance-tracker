import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { Currency, Transaction, SplitMode, SplitMethod, SplitShare } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { TRANSLATIONS } from '../../constants';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';
import { SplitExpenseModalProps, Recipient } from './types';
import { ModeToggle } from './ModeToggle';
import { MOTION } from '../../config';
import { CommonFields } from './CommonFields';
import { IPaidSection } from './IPaidSection';
import { TheyPaidSection } from './TheyPaidSection';
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
    people,
    categories,
    accounts,
    baseCurrency,
    language,
    transaction,
    events,
    activeEvent,
    linkToActiveEvent,
    onShowToast,
    rates
}) => {
    const t = TRANSLATIONS[language];

    // Helper for toast notification
    const showError = (message: string) => {
        if (onShowToast) {
            onShowToast(message, 'error');
        } else {
            console.error('SplitExpenseModal error (no toast handler):', message);
        }
    };

    // Mode: "I paid" or "Someone paid for me"
    const [mode, setMode] = useState<SplitMode>('i_paid');

    // Common fields
    const [amount, setAmount] = useState('');
    const [fees, setFees] = useState('');
    const [currency, setCurrency] = useState<Currency>(baseCurrency);
    const [note, setNote] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [accountId, setAccountId] = useState('');
    const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString());

    // "I paid" mode fields
    const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
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
                { personId: 'self', name: language === 'sr' ? 'Ja' : 'Me', amount: 0, isIncluded: false },
                ...people.map(p => ({ personId: p.id, name: p.name, amount: 0, isIncluded: false }))
            ]);
        }
    }, [isOpen, transaction, people, categories, accounts, baseCurrency, events, language]);

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
                showError(language === 'sr' ? 'Izaberite bar jednu osobu za podelu' : 'Please select at least one person to split with');
                return;
            }

            if (result.error === 'invalid-amount') {
                showError(language === 'sr' ? 'Unesite ispravan iznos' : 'Please enter a valid amount');
                return;
            }

            if (result.error === 'exceeds-total') {
                showError(language === 'sr' ? 'Iznosi podele prelaze ukupan. Molimo podesite.' : 'Split amounts exceed total. Please adjust.');
                return;
            }

            onSplit({ transactions: result.transaction ? [result.transaction] : [], balanceUpdates: result.balanceUpdates });
            onClose();

        } else {
            const result = calculateTheyPaidSubmission({
                payerId,
                currency,
                recipients: includedRecipients,
            });

            if (result.error === 'missing-payer') {
                showError(language === 'sr' ? 'Izaberite ko je platio' : 'Please select who paid');
                return;
            }

            if (result.error === 'no-amounts') {
                showError(language === 'sr'
                    ? 'Izaberite bar jednu osobu i unesite iznos'
                    : 'Please select at least one person and enter amounts');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={MOTION.modal.initial}
                animate={MOTION.modal.animate}
                exit={MOTION.modal.exit}
                transition={MOTION.modal.spring}
                className="bg-surface w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="p-4 border-b border-outline/10 flex items-center justify-between">
                    <h2 className="text-xl font-bold font-display text-on-surface">{t.splitTransaction}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                        <X size={20} className="text-on-surface-variant" />
                    </button>
                </div>

                {/* Mode Toggle */}
                <ModeToggle mode={mode} setMode={setMode} language={language} />

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
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
                        className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
                    >
                        {mode === 'i_paid'
                            ? (language === 'sr' ? 'Podeli trošak' : 'Split Expense')
                            : (language === 'sr' ? 'Dodaj dug' : 'Add Debt')
                        }
                    </button>
                </form>
            </motion.div>
        </div>
    );
};
