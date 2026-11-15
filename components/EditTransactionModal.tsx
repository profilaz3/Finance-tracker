import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { MOTION } from '../config';
import { TRANSLATIONS } from '../constants';
import { useEscapeKey, useFocusTrap } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { Account, Category, Event, ExchangeRates, Person, Transaction } from '../types';
import { HAPTIC_PATTERNS, vibrate } from '../utils/haptics';
import { AmountFields } from './transaction-modal/AmountFields';
import { DateFields } from './transaction-modal/DateFields';
import { MoreOptionsFields } from './transaction-modal/MoreOptionsFields';
import { ReceiptFields } from './transaction-modal/ReceiptFields';
import { languageOf, useEntryForm } from './transaction-modal/useEntryForm';

interface EditTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction | null;
    isNewTransaction?: boolean;
    accounts: Account[];
    categories: Category[];
    people: Person[];
    events: Event[];
    /** `targetAccountId` is the To wallet of a transfer (new or edited). */
    onSave: (updated: Transaction, targetAccountId?: string) => void;
    onDelete: (id: string) => void;
    t: typeof TRANSLATIONS['en'];
    /** History for "usual category" suggestions and the default category of new entries. */
    transactions?: Transaction[];
    /** Fee in the entry's currency and the amount a transfer arrives as; without it fees are typed in USD. */
    rates?: ExchangeRates;
}

const NO_TRANSACTIONS: Transaction[] = [];

/** How long after opening the dialog takes focus back if something outside grabs it. */
const FOCUS_SETTLE_MS = 1000;

const hasMoreOptions = (transaction: Transaction | null) =>
    !!transaction && (!!transaction.personId || !!transaction.eventId || !!transaction.fees);

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
    transactions = NO_TRANSACTIONS,
    rates,
}) => {
    const language = languageOf(t);
    const form = useEntryForm({ transaction, isNewTransaction, accounts, categories, transactions, t, rates });
    const { edited, kind } = form;
    const [shownFor, setShownFor] = useState(transaction);
    const [showMoreOptions, setShowMoreOptions] = useState(() => hasMoreOptions(transaction));
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    if (shownFor !== transaction) {
        setShownFor(transaction);
        setShowMoreOptions(hasMoreOptions(transaction));
        setShowDeleteConfirm(false);
    }
    const amountInputRef = useRef<HTMLInputElement>(null);
    // A new entry starts in the amount field; an edit focuses the sheet itself (no keyboard pops up).
    const focusTrapRef = useFocusTrap(isOpen, { initialFocus: isNewTransaction ? '#edit-tx-amount' : undefined });

    useEscapeKey(onClose, isOpen);
    const { wrapRef, handleProps } = useSheetDrag(onClose);

    // A sheet that opened this dialog (the Add sheet) hands focus back to its own trigger when its
    // exit animation ends, after this dialog has focused itself. While it settles, focus that lands
    // outside every dialog comes back here.
    useEffect(() => {
        if (!isOpen) return;
        const onFocusIn = (event: FocusEvent) => {
            const container = focusTrapRef.current;
            const target = event.target;
            if (!container || !(target instanceof Element) || container.contains(target) || target.closest('[role="dialog"]')) return;
            const initial = isNewTransaction ? container.querySelector<HTMLElement>('#edit-tx-amount') : null;
            (initial ?? container).focus({ preventScroll: true });
        };
        document.addEventListener('focusin', onFocusIn);
        const timer = window.setTimeout(() => document.removeEventListener('focusin', onFocusIn), FOCUS_SETTLE_MS);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('focusin', onFocusIn);
        };
    }, [isOpen, isNewTransaction, focusTrapRef]);

    if (!isOpen) return null;

    const canSave = form.canSave;
    // The title names the kind, so the kind switch below never needs a second label.
    const title = isNewTransaction
        ? (kind === 'transfer' ? t.newTransfer : kind === 'income' ? t.newIncome : t.newExpense)
        : (kind === 'transfer' ? t.editTransfer : kind === 'income' ? t.editIncome : t.editExpense);

    const handleDelete = () => {
        vibrate(HAPTIC_PATTERNS.error);
        onDelete(edited.id);
        onClose();
    };

    const handleSave = () => {
        const entry = form.submit();
        if (entry) {
            vibrate(HAPTIC_PATTERNS.success);
            onSave(entry, kind === 'transfer' ? form.targetAccountId : undefined);
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
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={MOTION.sheet.exit}
                transition={MOTION.sheet.spring}
                className="glass-sheet flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
            >
                <div className="shrink-0 touch-none" {...handleProps}>
                <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-2 md:pt-5">
                    <h3 id="edit-transaction-title" className="min-w-0 truncate text-[22px] font-bold tracking-[-0.4px]">
                        {title}
                    </h3>
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
                        form={form}
                        accounts={accounts}
                        categories={categories}
                        amountInputRef={amountInputRef}
                        isNewTransaction={isNewTransaction}
                        language={language}
                        t={t}
                        onSubmit={handleSave}
                    />
                    <DateFields date={edited.date} onChange={date => form.setEdited(prev => ({ ...prev, date }))} language={language} t={t} />
                    <MoreOptionsFields
                        form={form}
                        people={people}
                        events={events}
                        showMoreOptions={showMoreOptions}
                        onToggle={() => setShowMoreOptions(!showMoreOptions)}
                        language={language}
                        t={t}
                    />
                    {edited.receiptData && (
                        <ReceiptFields edited={edited} setEdited={form.setEdited} language={language} t={t} />
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
                                            className="h-10 rounded-full px-3.5 text-[13px] font-semibold text-muted hover:bg-chip"
                                        >
                                            {t.no}
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="h-10 rounded-full bg-neg px-3.5 text-[13px] font-semibold text-white"
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
                                className="h-12 rounded-full px-5 text-[15px] font-semibold text-muted hover:bg-chip"
                            >
                                {t.cancel}
                            </button>
                            {/* Stays tappable when incomplete: tapping shows what is missing. */}
                            <button
                                aria-disabled={!canSave}
                                onClick={handleSave}
                                className={clsx(
                                    "flex h-12 min-w-[124px] items-center justify-center gap-1.5 rounded-full bg-accent px-6 text-[16px] font-bold text-on-accent shadow-[0_6px_16px_-6px_rgb(var(--accent-rgb)/0.7)] transition-[transform,opacity]",
                                    canSave ? "active:scale-95" : "opacity-45 shadow-none"
                                )}
                            >
                                <Check size={18} strokeWidth={2.6} aria-hidden="true" />
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
