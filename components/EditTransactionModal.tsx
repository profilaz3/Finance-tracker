import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { MOTION } from '../config';
import { TRANSLATIONS } from '../constants';
import { useEscapeKey, useFocusTrap } from '../hooks/useFocusTrap';
import { FieldValidation, useFormValidation, validationRules } from '../hooks/useFormValidation';
import { Account, Category, Event, Person, Transaction } from '../types';
import { HAPTIC_PATTERNS, vibrate } from '../utils/haptics';
import { AmountFields } from './transaction-modal/AmountFields';
import { MoreOptionsFields } from './transaction-modal/MoreOptionsFields';
import { ReceiptFields } from './transaction-modal/ReceiptFields';

interface EditTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction | null;
    isNewTransaction?: boolean;
    accounts: Account[];
    categories: Category[];
    people: Person[];
    events: Event[];
    onSave: (updated: Transaction, targetAccountId?: string) => void;
    onDelete: (id: string) => void;
    t: typeof TRANSLATIONS['en'];
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
    isOpen,
    onClose,
    transaction,
    isNewTransaction = false,
    accounts,
    categories,
    people,
    events,
    onSave,
    onDelete,
    t
}) => {
    const [edited, setEdited] = useState<Transaction | null>(null);
    const [targetAccountId, setTargetAccountId] = useState('');
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const amountInputRef = useRef<HTMLInputElement>(null);
    const focusTrapRef = useFocusTrap(isOpen);

    useEscapeKey(onClose, isOpen);

    const validationConfig: FieldValidation = useMemo(() => ({
        amount: [
            validationRules.required(t.fieldRequired || 'This field is required'),
            validationRules.positive(t.amountMustBePositive || 'Amount must be positive')
        ],
        accountId: [
            validationRules.required(t.fieldRequired || 'This field is required')
        ]
    }), [t]);
    const { validateAll, validateOnBlur, getFieldState, clearErrors } = useFormValidation(validationConfig);

    useEffect(() => {
        if (transaction) {
            setEdited(transaction);
            setShowMoreOptions(
                !!transaction.personId ||
                !!transaction.eventId ||
                !!transaction.fees ||
                !!transaction.note
            );
        } else {
            setEdited({
                id: uuidv4(),
                date: new Date().toISOString(),
                amount: 0,
                currency: accounts[0]?.currency || 'USD',
                categoryId: categories[0]?.id || 'others',
                accountId: accounts[0]?.id || '',
                type: 'expense',
                note: ''
            });
            setShowMoreOptions(false);
        }
        setTargetAccountId('');
        setShowDeleteConfirm(false);
        clearErrors();
    }, [transaction, accounts, categories, clearErrors]);

    useEffect(() => {
        if (!isOpen || !amountInputRef.current) return;
        const timer = setTimeout(() => {
            amountInputRef.current?.focus();
            amountInputRef.current?.select();
        }, 100);
        return () => clearTimeout(timer);
    }, [isOpen]);

    if (!isOpen || !edited) return null;

    const isInternalTransfer = edited.categoryId === 'internal-transfer';
    const selectedCategory = categories.find(c => c.id === edited.categoryId);
    const canSave = edited.amount > 0 && !!edited.accountId;

    const handleDelete = () => {
        vibrate(HAPTIC_PATTERNS.error);
        onDelete(edited.id);
        onClose();
    };

    const handleSave = () => {
        if (validateAll({ amount: edited.amount, accountId: edited.accountId })) {
            vibrate(HAPTIC_PATTERNS.success);
            onSave(edited, targetAccountId);
            return;
        }
        vibrate(HAPTIC_PATTERNS.error);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 backdrop-blur-md p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-transaction-title"
        >
            <motion.div
                ref={focusTrapRef}
                onClick={e => e.stopPropagation()}
                initial={MOTION.modal.initial}
                animate={MOTION.modal.animate}
                exit={MOTION.modal.exit}
                transition={MOTION.modal.spring}
                className="bg-surface-container-high w-full max-w-md rounded-2xl shadow-elevation-5 overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="p-5 pb-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h3 id="edit-transaction-title" className="text-lg font-display font-medium text-on-surface">
                            {isNewTransaction ? (t.addTransaction || 'New Transaction') : t.editTransaction}
                        </h3>
                        {selectedCategory && (
                            <span className={clsx(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                                edited.type === 'income' ? "bg-tertiary/15 text-tertiary" : "bg-error/15 text-error"
                            )}>
                                {edited.type === 'income'
                                    ? <ArrowDownLeft size={10} aria-hidden="true" />
                                    : <ArrowUpRight size={10} aria-hidden="true" />}
                                {edited.type === 'income' ? 'Income' : 'Expense'}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-highest rounded-full transition-colors text-on-surface-variant"
                        aria-label={t.close || "Close dialog"}
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-5 pb-5 space-y-4 overflow-y-auto custom-scrollbar">
                    <AmountFields
                        edited={edited}
                        setEdited={setEdited}
                        accounts={accounts}
                        categories={categories}
                        amountInputRef={amountInputRef}
                        targetAccountId={targetAccountId}
                        setTargetAccountId={setTargetAccountId}
                        validateOnBlur={validateOnBlur}
                        getFieldState={getFieldState}
                        t={t}
                    />
                    <MoreOptionsFields
                        edited={edited}
                        setEdited={setEdited}
                        people={people}
                        events={events}
                        isInternalTransfer={isInternalTransfer}
                        showMoreOptions={showMoreOptions}
                        onToggle={() => setShowMoreOptions(!showMoreOptions)}
                        t={t}
                    />
                    {edited.receiptData && (
                        <ReceiptFields edited={edited} setEdited={setEdited} t={t} />
                    )}
                </div>

                <div className="p-5 pt-3 border-t border-outline-variant flex flex-col gap-3">
                    <AnimatePresence>
                        {showDeleteConfirm && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="flex items-center justify-between bg-error-container/50 rounded-xl px-4 py-3 mb-1">
                                    <span className="text-sm text-on-error-container font-medium">Delete this transaction?</span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors"
                                        >
                                            No
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="px-3 py-1.5 text-xs font-medium bg-error text-on-error rounded-lg hover:bg-error/80 transition-colors"
                                        >
                                            Yes, delete
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex justify-between items-center">
                        {!isNewTransaction ? (
                            <button
                                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                                className={clsx(
                                    "px-4 py-2.5 text-sm font-medium rounded-xl transition-colors min-h-[44px]",
                                    showDeleteConfirm
                                        ? "bg-error/10 text-error"
                                        : "text-on-surface-variant hover:text-error hover:bg-error-container/30"
                                )}
                            >
                                Delete
                            </button>
                        ) : (
                            <div />
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm text-on-surface-variant font-medium hover:bg-surface-container-highest rounded-xl transition-colors min-h-[44px]"
                            >
                                {t.cancel}
                            </button>
                            <button
                                disabled={!edited.amount || edited.amount <= 0 || !edited.accountId}
                                onClick={handleSave}
                                className={clsx(
                                    "px-6 py-2.5 text-sm font-medium rounded-xl transition-all min-h-[44px]",
                                    canSave
                                        ? "bg-primary text-on-primary shadow-elevation-1 hover:shadow-elevation-2 active:scale-95"
                                        : "bg-on-surface/12 text-on-surface/38 cursor-not-allowed"
                                )}
                            >
                                {t.save}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
