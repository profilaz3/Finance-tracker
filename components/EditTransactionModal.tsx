import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { MOTION } from '../config';
import { TRANSLATIONS } from '../constants';
import { useEscapeKey, useFocusTrap } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { Account, AppState, Category, Event, ExchangeRates, HomeHeaderTone, Person, Transaction } from '../types';
import { HAPTIC_PATTERNS, vibrate } from '../utils/haptics';
import { calculateAccountBalance } from '../utils/financialSelectors';
import { AmountFields } from './transaction-modal/AmountFields';
import { EntryTiles, type EntryPanel } from './transaction-modal/EntryTiles';
import { Keypad } from './transaction-modal/Keypad';
import { MoreOptionsFields } from './transaction-modal/MoreOptionsFields';
import { ReceiptFields } from './transaction-modal/ReceiptFields';
import { ENTRY_STRINGS } from './transaction-modal/entryStrings';
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
    /** The Home header colour (Settings > Header), used for the form's top. */
    headerTone?: HomeHeaderTone;
    /** `pane`: in the Activity side pane in place of the entry's details (no scrim, drag or focus trap). */
    variant?: 'modal' | 'pane';
}

const NO_TRANSACTIONS: Transaction[] = [];

/** How long after opening the dialog takes focus back if something outside grabs it. */
const FOCUS_SETTLE_MS = 1000;

/** Touch screens type the amount on the app's keypad (with sums); a mouse and keyboard type it directly. */
const touchFirst = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

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
    headerTone = 'accent',
    variant = 'modal',
}) => {
    const inPane = variant === 'pane';
    const language = languageOf(t);
    const s = ENTRY_STRINGS[language];
    const form = useEntryForm({ transaction, isNewTransaction, accounts, categories, transactions, t, rates });
    const { edited, kind } = form;
    const [keypad] = useState(touchFirst);
    // With the keypad, a new entry starts on it; the pickers and More take its place while open.
    const rest: EntryPanel = keypad ? 'keypad' : null;
    const [shownFor, setShownFor] = useState(transaction);
    const [panel, setPanel] = useState<EntryPanel>(() => (isNewTransaction ? rest : null));
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    if (shownFor !== transaction) {
        setShownFor(transaction);
        setPanel(isNewTransaction ? rest : null);
        setShowDeleteConfirm(false);
    }
    const togglePanel = (next: EntryPanel) => setPanel(current => (current === next ? rest : next));
    const balances = useMemo(
        () => (rates ? new Map(accounts.map(account => [account.id, calculateAccountBalance({ transactions, rates } as AppState, account)])) : null),
        [accounts, transactions, rates]
    );
    const amountInputRef = useRef<HTMLInputElement>(null);
    // A new entry starts in the amount field; an edit focuses the sheet itself (no keyboard pops up).
    const focusTrapRef = useFocusTrap(isOpen && !inPane, { initialFocus: isNewTransaction ? '#edit-tx-amount' : undefined });

    useEscapeKey(onClose, isOpen);
    const { wrapRef, handleProps } = useSheetDrag(onClose);

    // A sheet that opened this dialog (the Add sheet) hands focus back to its own trigger when its
    // exit animation ends, after this dialog has focused itself. While it settles, focus that lands
    // outside every dialog comes back here.
    useEffect(() => {
        if (!isOpen || inPane) return;
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
    }, [isOpen, isNewTransaction, focusTrapRef, inPane]);

    if (!isOpen) return null;

    const canSave = form.canSave;
    const saveLabel = !isNewTransaction ? s.saveChanges : kind === 'transfer' ? s.saveTransfer : kind === 'income' ? s.saveIncome : s.saveExpense;
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

    // The form's inside: the same as a sheet and in the Activity pane.
    const body = (
        <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                <AmountFields
                    form={form}
                    categories={categories}
                    amountInputRef={amountInputRef}
                    isNewTransaction={isNewTransaction}
                    canTransfer={accounts.length >= 2}
                    title={title}
                    tone={headerTone}
                    language={language}
                    t={t}
                    s={s}
                    rates={rates}
                    keypad={keypad}
                    onClose={onClose}
                    onAmountFocus={() => keypad && setPanel('keypad')}
                    // The phone keyboard needs the room: the keypad steps aside while the note is typed.
                    onNoteFocus={() => setPanel(current => (current === 'keypad' ? null : current))}
                    onSubmit={handleSave}
                    handleProps={handleProps}
                />
                <div className="space-y-2 px-4 pb-2 pt-4">
                    <EntryTiles
                        form={form}
                        accounts={accounts}
                        categories={categories}
                        balances={balances}
                        panel={panel}
                        onToggle={togglePanel}
                        onPicked={() => setPanel(rest)}
                        language={language}
                        t={t}
                        s={s}
                    />
                    <MoreOptionsFields
                        form={form}
                        people={people}
                        events={events}
                        showMoreOptions={panel === 'more'}
                        onToggle={() => togglePanel('more')}
                        language={language}
                        t={t}
                        s={s}
                    >
                        {edited.receiptData && (
                            <ReceiptFields edited={edited} setEdited={form.setEdited} language={language} t={t} />
                        )}
                    </MoreOptionsFields>
                    {keypad && panel === 'keypad' && <Keypad inputRef={amountInputRef} language={language} s={s} />}
                </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 px-4 pb-4 pt-2">
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

                <div className="flex items-center gap-2">
                    {!isNewTransaction ? (
                        <button
                            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                            className={clsx(
                                "h-[54px] shrink-0 rounded-full px-5 text-[15px] font-semibold transition-colors",
                                showDeleteConfirm ? "bg-neg/10 text-neg" : "text-neg hover:bg-neg/10"
                            )}
                        >
                            {t.delete}
                        </button>
                    ) : null}
                    {/* Stays tappable when incomplete: tapping shows what is missing. */}
                    <button
                        aria-disabled={!canSave}
                        onClick={handleSave}
                        className={clsx(
                            "flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[16px] font-semibold text-on-accent shadow-[0_10px_24px_-10px_rgb(var(--accent-rgb)/0.75)] transition-[transform,opacity]",
                            canSave ? "active:scale-[0.98]" : "opacity-50 shadow-none"
                        )}
                    >
                        <Check size={19} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
                        <span className="truncate">{saveLabel}</span>
                    </button>
                </div>
            </div>
        </>
    );

    if (inPane) {
        return (
            <section
                aria-labelledby="edit-transaction-title"
                data-pane-editing=""
                className="relative flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-[32px] bg-[var(--paper-bg)] text-on-surface shadow-[0_18px_48px_-24px_rgba(0,0,0,0.35)] ring-1 ring-hair"
            >
                {body}
            </section>
        );
    }

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
                style={{ maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))' }}
                className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-[32px] bg-[var(--paper-bg)] text-on-surface shadow-[0_28px_70px_-24px_rgba(0,0,0,0.5)] outline-none"
            >
                {body}
            </m.div>
            </div>
        </m.div>
    );
};
