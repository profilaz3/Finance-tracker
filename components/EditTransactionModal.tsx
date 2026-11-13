import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { MOTION } from '../config';
import { TRANSLATIONS } from '../constants';
import { useEscapeKey, useFocusTrap } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { FieldValidation, useFormValidation, validationRules } from '../hooks/useFormValidation';
import { Account, Category, Event, Person, Transaction } from '../types';
import { HAPTIC_PATTERNS, vibrate } from '../utils/haptics';
import { merchantMemoryFor, usualChoice } from '../domain/merchantMemory';
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
    /** History for "usual category" suggestions on new entries. */
    transactions?: Transaction[];
}

const NO_TRANSACTIONS: Transaction[] = [];

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
    t,
    transactions = NO_TRANSACTIONS
}) => {
    const [edited, setEdited] = useState<Transaction | null>(null);
    const [targetAccountId, setTargetAccountId] = useState('');
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const amountInputRef = useRef<HTMLInputElement>(null);
    const categoryPickedRef = useRef(false);
    const focusTrapRef = useFocusTrap(isOpen);

    useEscapeKey(onClose, isOpen);
    const { wrapRef, handleProps } = useSheetDrag(onClose);

    const validationConfig: FieldValidation = useMemo(() => ({
        amount: [
            validationRules.required(t.fieldRequired),
            validationRules.positive(t.amountMustBePositive)
        ],
        accountId: [
            validationRules.required(t.fieldRequired)
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
        categoryPickedRef.current = false;
        clearErrors();
    }, [transaction, accounts, categories, clearErrors]);

    // New entries: once the note names a shop the user has a clear habit for, preselect that
    // category, unless they already picked one themselves.
    const merchantText = edited?.receiptData?.merchant || edited?.note || '';
    const usual = useMemo(
        () => (isNewTransaction && merchantText ? usualChoice(merchantMemoryFor(transactions), merchantText) : null),
        [isNewTransaction, merchantText, transactions]
    );
    useEffect(() => {
        if (!usual || categoryPickedRef.current) return;
        const category = categories.find(c => c.id === usual.categoryId);
        if (!category) return;
        setEdited(current => {
            if (!current || current.categoryId === category.id || current.categoryId === 'internal-transfer') return current;
            if (category.type !== current.type) return current;
            return { ...current, categoryId: category.id, subcategory: '' };
        });
    }, [usual, categories]);

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
        <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="paper-scrim modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-transaction-title"
        >
            <div ref={wrapRef} className="relative flex w-full justify-center" onClick={e => e.stopPropagation()}>
            <m.div
                ref={focusTrapRef}
                onClick={e => e.stopPropagation()}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={MOTION.sheet.exit}
                transition={MOTION.sheet.spring}
                className="glass-sheet flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[36px] text-on-surface"
            >
                <div className="shrink-0 touch-none" {...handleProps}>
                <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                <div className="flex items-center justify-between px-5 pb-3 pt-2 md:pt-5">
                    <div className="flex items-center gap-2">
                        <h3 id="edit-transaction-title" className="text-[22px] font-bold tracking-[-0.4px]">
                            {isNewTransaction ? t.addTransaction : t.editTransaction}
                        </h3>
                        {selectedCategory && (
                            <span className={clsx(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                edited.type === 'income' ? "bg-pos/15 text-pos" : "bg-chip text-muted"
                            )}>
                                {edited.type === 'income'
                                    ? <ArrowDownLeft size={10} aria-hidden="true" />
                                    : <ArrowUpRight size={10} aria-hidden="true" />}
                                {edited.type === 'income' ? t.incomeType : t.expenseType}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        type="button"
                        className="glass flex h-11 w-11 items-center justify-center rounded-full"
                        aria-label={t.close}
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
                </div>

                <div className="space-y-4 overflow-y-auto px-5 pb-5 custom-scrollbar">
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
                        usualHint={usual && usual.categoryId === edited.categoryId ? t.usualCategory.replace('{merchant}', usual.merchant) : null}
                        onCategoryPicked={() => { categoryPickedRef.current = true; }}
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

                <div className="flex flex-col gap-3 border-t border-hair px-5 pb-5 pt-3">
                    <AnimatePresence>
                        {showDeleteConfirm && (
                            <m.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="mb-1 flex items-center justify-between rounded-[18px] bg-neg/10 px-4 py-3">
                                    <span className="text-[14px] font-semibold text-neg">{t.deleteConfirm}</span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="h-9 rounded-full px-3.5 text-[13px] font-semibold text-muted hover:bg-chip"
                                        >
                                            {t.no}
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="h-9 rounded-full bg-neg px-3.5 text-[13px] font-semibold text-white"
                                        >
                                            {t.yesDelete}
                                        </button>
                                    </div>
                                </div>
                            </m.div>
                        )}
                    </AnimatePresence>

                    <div className="flex justify-between items-center">
                        {!isNewTransaction ? (
                            <button
                                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                                className={clsx(
                                    "h-11 rounded-full px-4 text-[15px] font-semibold transition-colors",
                                    showDeleteConfirm ? "bg-neg/10 text-neg" : "text-neg hover:bg-neg/10"
                                )}
                            >
                                {t.delete}
                            </button>
                        ) : (
                            <div />
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="h-11 rounded-full px-5 text-[15px] font-semibold text-muted hover:bg-chip"
                            >
                                {t.cancel}
                            </button>
                            <button
                                disabled={!edited.amount || edited.amount <= 0 || !edited.accountId}
                                onClick={handleSave}
                                className={clsx(
                                    "h-11 rounded-full px-6 text-[15px] font-semibold transition-colors",
                                    canSave ? "bg-accent text-on-accent active:scale-95" : "cursor-not-allowed bg-chip text-faint"
                                )}
                            >
                                {t.save}
                            </button>
                        </div>
                    </div>
                </div>
            </m.div>
            </div>
        </m.div>
    );
};
