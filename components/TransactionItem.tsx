import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'motion/react';
import { Split, Pencil, Trash2, Receipt, User, MapPin, Users, Copy, Bookmark, MoreVertical, Repeat } from 'lucide-react';
import { CurrencyFlag } from './ui/CurrencyFlag';
import clsx from 'clsx';
import { Transaction, Category, Account, Person, AppState, Event } from '../types';
import { formatMoney, formatNumber } from '../utils/locale';
import { convertAmount } from '../services/currencyService';
import { TRANSLATIONS } from '../constants';
import { useEscapeKey, useFocusTrap } from '../hooks/useFocusTrap';
import { localizeCategoryName, localizeSubcategory, localizeTransactionNote } from '../utils/systemText';

interface TransactionItemProps {
    transaction: Transaction;
    category: Category;
    account: Account;
    person?: Person;
    event?: Event;
    state: AppState;
    onClick: () => void;
    onSplit: () => void;
    onEdit: () => void;
    onEditSplit?: () => void;
    onDelete: () => void;
    onDuplicate?: () => void;
    onSaveAsTemplate?: () => void;
    isLastInGroup?: boolean;
    /** Open in the Activity side pane. */
    selected?: boolean;
}

const TxMark: React.FC<{ icon: typeof Receipt }> = ({ icon: Icon }) => (
    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-chip text-muted">
        <Icon size={10} strokeWidth={2.4} aria-hidden="true" />
    </span>
);

export const TransactionItem: React.FC<TransactionItemProps> = React.memo(({
    transaction,
    category,
    account,
    person,
    event,
    state,
    onClick,
    onSplit,
    onEdit,
    onEditSplit,
    onDelete,
    onDuplicate,
    onSaveAsTemplate,
    isLastInGroup,
    selected = false,
}) => {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const timerRef = React.useRef<NodeJS.Timeout | null>(null);
    const isLongPress = React.useRef(false);
    const t = TRANSLATIONS[state.language];
    const hasSplit = !!transaction.splitDetails;
    const isRecurring = transaction.id.startsWith('rec:');
    // App-written names and notes ("Internal Transfer", "Transfer from Cash") in the app language.
    const categoryName = category ? localizeCategoryName(category, state.language) : '';
    const note = localizeTransactionNote(transaction.note, state.language);
    const subcategory = transaction.subcategory ? localizeSubcategory(transaction.subcategory, state.language) : '';

    const displayCurrency = account?.currency || state.baseCurrency;

    // Memoize fee and amount calculations
    const feeInTxCurrency = useMemo(() => {
        return transaction.fees
            ? convertAmount(transaction.fees, 'USD', transaction.currency, state.rates)
            : 0;
    }, [transaction.fees, transaction.currency, state.rates]);

    const totalPrincipal = useMemo(() => {
        return transaction.type === 'income'
            ? transaction.amount - feeInTxCurrency
            : transaction.amount + feeInTxCurrency;
    }, [transaction.type, transaction.amount, feeInTxCurrency]);

    const displayAmount = useMemo(() => {
        return convertAmount(
            totalPrincipal,
            transaction.currency,
            account?.currency || state.baseCurrency,
            state.rates
        );
    }, [totalPrincipal, transaction.currency, account?.currency, state.baseCurrency, state.rates]);

    // Your own currency needs no code ("−3,892"); others keep theirs ("−€55.99"). Cents only when there are any.
    const amountText = useMemo(() => {
        const value = Math.abs(displayAmount);
        const digits = Math.round(value * 100) % 100 === 0 ? 0 : 2;
        const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
        return displayCurrency === state.baseCurrency
            ? formatNumber(value, options, state.language)
            : formatMoney(value, displayCurrency, state.language, options);
    }, [displayAmount, displayCurrency, state.baseCurrency, state.language]);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    const openMenuAt = (rect: DOMRect) => {
        const x = Math.max(8, Math.min(rect.right - 160, window.innerWidth - 180));
        const y = Math.max(8, Math.min(rect.top + 40, window.innerHeight - 250));
        setMenuPosition({ x, y });
        setIsMenuOpen(true);
    };

    const closeMenu = () => {
        setIsMenuOpen(false);
        setMenuPosition(null);
    };

    // Keyboard and screen-reader users reach the long-press actions through the
    // "more actions" button; Escape closes the menu and focus returns to the button.
    const menuRef = useFocusTrap(isMenuOpen);
    useEscapeKey(closeMenu, isMenuOpen);

    const handleStart = (e: React.PointerEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            openMenuAt(rect);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
    };

    const handleEnd = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    // A tap opens the entry's details (or selects it in selection mode); long-press or ... for actions.
    const handleClick = (e: React.MouseEvent) => {
        if (isLongPress.current || isMenuOpen) {
            e.preventDefault();
            e.stopPropagation();
            isLongPress.current = false;
            return;
        }
        onClick();
    };

    return (
        <m.div
            onPointerDown={handleStart}
            onPointerUp={handleEnd}
            onPointerLeave={handleEnd}
            onPointerCancel={handleEnd}
            onClick={handleClick}
            onContextMenu={(e) => e.preventDefault()}
            data-transaction-row
            data-transaction-id={transaction.id}
            whileTap={{ scale: 0.98 }}
            className={clsx(
                "group relative cursor-pointer select-none transition-colors duration-100",
                selected ? "bg-accent-soft" : "active:bg-chip",
                !isLastInGroup && "border-b border-hair",
            )}
        >
            {/* Row */}
            <div className="flex min-h-[64px] items-center gap-1 py-2.5 pl-4 pr-1.5">
                <div
                    role="button"
                    tabIndex={0}
                    aria-current={selected ? 'true' : undefined}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onClick();
                        }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                {person ? (
                    <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px] font-bold text-white"
                        style={{ background: person.color || 'var(--paper-muted)' }}
                        aria-hidden="true"
                    >
                        {person.avatar && (person.avatar.startsWith('data:') || person.avatar.startsWith('http')) ? (
                            <img src={person.avatar} alt="" className="h-10 w-10 object-cover" />
                        ) : person.avatar ? (
                            <span className="text-[18px]">{person.avatar}</span>
                        ) : (
                            <User size={18} aria-hidden="true" />
                        )}
                    </span>
                ) : (
                    <CategoryGlyph
                        category={category}
                        shape="circle"
                        tone="solid"
                        badge={displayCurrency !== state.baseCurrency ? <CurrencyFlag currency={displayCurrency} size={16} /> : undefined}
                    />
                )}

                {/* Title + metadata */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-[16px] font-semibold">
                            {note || categoryName || t.untitled}
                        </span>
                        {/* Small marks: split with N people, event, receipt, repeating entry */}
                        {(hasSplit || event || transaction.receiptData || isRecurring) && (
                            <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                                {hasSplit && (
                                    <span className="flex h-[18px] items-center gap-0.5 rounded-full bg-accent-soft px-1.5 text-[11px] font-bold text-accent">
                                        <Users size={11} strokeWidth={2.4} /> {transaction.splitDetails!.shares.length}
                                    </span>
                                )}
                                {event && <TxMark icon={MapPin} />}
                                {transaction.receiptData && <TxMark icon={Receipt} />}
                                {isRecurring && <TxMark icon={Repeat} />}
                            </span>
                        )}
                    </div>
                    <div className="mt-px truncate text-[13px] text-muted">
                        {/* The title is the note (or the category): under it the most specific category, then the wallet. */}
                        {subcategory ? <>{subcategory} · </> : categoryName && note ? <>{categoryName} · </> : null}
                        {account?.name}
                    </div>
                </div>

                {/* Amount */}
                <div className={clsx(
                    "shrink-0 whitespace-nowrap text-right text-[16px] font-semibold tabular-nums",
                    transaction.type === 'income' && "text-pos"
                )}>
                    {transaction.type === 'income' ? '+' : '−'}{amountText}
                </div>
                </div>

                {/* Visible alternative to long-press */}
                <button
                    type="button"
                    aria-label={t.moreActions}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    title={t.moreActions}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        const row = (e.currentTarget.closest('[data-transaction-row]') ?? e.currentTarget) as HTMLElement;
                        openMenuAt(row.getBoundingClientRect());
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-opacity hover:bg-chip opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 sm:focus-visible:opacity-100 sm:group-focus-within:opacity-100"
                >
                    <MoreVertical size={18} aria-hidden="true" />
                </button>
            </div>

            {/* Long Press Context Menu */}
            {isMenuOpen && menuPosition && createPortal(
                <AnimatePresence>
                    <m.div
                        key="menu-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="paper-scrim fixed inset-0 z-[9998]"
                        style={{ touchAction: 'none' }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); }}
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    />
                    <m.div
                        key="menu-content"
                        initial={{ opacity: 0, scale: 0.9, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        style={{
                            position: 'fixed',
                            left: menuPosition.x,
                            top: menuPosition.y,
                            touchAction: 'none',
                        }}
                        ref={menuRef}
                        role="menu"
                        aria-label={t.moreActions}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="glass-sheet z-[9999] min-w-[190px] overflow-hidden rounded-[22px] p-1.5"
                    >
                        {!transaction.personId && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { onSplit(); closeMenu(); }}
                                className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium transition-colors hover:bg-chip active:bg-chip"
                            >
                                <Split size={18} className="text-muted" aria-hidden="true" /> {t.split}
                            </button>
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                if (hasSplit && onEditSplit) {
                                    onEditSplit();
                                } else {
                                    onEdit();
                                }
                                closeMenu();
                            }}
                            className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium transition-colors hover:bg-chip active:bg-chip"
                        >
                            <Pencil size={18} className="text-muted" aria-hidden="true" /> {t.edit}
                        </button>
                        {onDuplicate && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { onDuplicate(); closeMenu(); }}
                                className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium transition-colors hover:bg-chip active:bg-chip"
                            >
                                <Copy size={18} className="text-muted" aria-hidden="true" /> {t.duplicate}
                            </button>
                        )}
                        {onSaveAsTemplate && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { onSaveAsTemplate(); closeMenu(); }}
                                className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium transition-colors hover:bg-chip active:bg-chip"
                            >
                                <Bookmark size={18} className="text-muted" aria-hidden="true" /> {t.saveAsTemplate}
                            </button>
                        )}
                        <div role="separator" className="mx-3 my-1 h-px bg-[var(--paper-line)]" />
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => { onDelete(); closeMenu(); }}
                            className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium text-neg transition-colors hover:bg-chip"
                        >
                            <Trash2 size={16} aria-hidden="true" /> {t.delete}
                        </button>
                    </m.div>
                </AnimatePresence>,
                document.body
            )}
        </m.div>
    );
});

TransactionItem.displayName = 'TransactionItem';
