import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'motion/react';
import { Split, Pencil, Trash2, Receipt, User, MapPin, Users, Check, Copy, Bookmark, MoreVertical } from 'lucide-react';
import clsx from 'clsx';
import { Transaction, Category, Account, Person, AppState, Event } from '../types';
import { formatCurrency, getShortDate } from '../utils/formatters';
import { convertAmount } from '../services/currencyService';
import { TRANSLATIONS } from '../constants';
import { useEscapeKey, useFocusTrap } from '../hooks/useFocusTrap';

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
    onViewReceipt: () => void;
    isLastInGroup?: boolean;
}

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
    onViewReceipt,
    isLastInGroup
}) => {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const timerRef = React.useRef<NodeJS.Timeout | null>(null);
    const isLongPress = React.useRef(false);
    const t = TRANSLATIONS[state.language];
    const hasSplit = !!transaction.splitDetails;

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

    const hasExpandableContent = hasSplit || transaction.receiptData || (transaction.note && transaction.note.length > 25) || transaction.subcategory || transaction.fees || event;

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

    const handleClick = (e: React.MouseEvent) => {
        if (isLongPress.current || isMenuOpen) {
            e.preventDefault();
            e.stopPropagation();
            isLongPress.current = false;
            return;
        }
        if (hasExpandableContent) {
            setIsExpanded(!isExpanded);
        }
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
            whileTap={{ scale: 0.98 }}
            className={clsx(
                "group relative select-none transition-colors duration-100 active:bg-chip",
                !isLastInGroup && "border-b border-hair",
                hasExpandableContent ? "cursor-pointer" : "cursor-default",
            )}
        >
            {/* Row */}
            <div className="flex min-h-[64px] items-center gap-3 py-2.5 pl-4 pr-2">
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
                    <CategoryGlyph category={category} />
                )}

                {/* Title + metadata */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-[16px] font-semibold">
                            {transaction.note || category?.name || t.untitled}
                        </span>
                        {hasSplit && (
                            <span className="flex shrink-0 items-center gap-0.5 text-[12px] text-faint">
                                <Users size={13} aria-hidden="true" /> {transaction.splitDetails!.shares.length}
                            </span>
                        )}
                        {event && <MapPin size={12} className="shrink-0 text-faint" aria-hidden="true" />}
                        {transaction.receiptData && <Receipt size={12} className="shrink-0 text-faint" aria-hidden="true" />}
                    </div>
                    <div className="mt-px truncate text-[13px] text-muted">
                        {category?.name && transaction.note ? <>{category.name} · </> : null}
                        {account?.name}
                    </div>
                </div>

                {/* Amount */}
                <div className="shrink-0 text-right">
                    <div className={clsx(
                        "text-[16px] font-semibold tabular-nums",
                        transaction.type === 'income' && "text-pos"
                    )}>
                        {transaction.type === 'income' ? '+' : '−'}{formatCurrency(displayAmount, displayCurrency)}
                    </div>
                    <div className="text-[12px] tabular-nums text-faint">
                        {getShortDate(transaction.date)}
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
                    className="shrink-0 rounded-full p-1.5 text-muted transition-opacity hover:bg-chip opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
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
                        {transaction.receiptData && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { onViewReceipt(); closeMenu(); }}
                                className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium transition-colors hover:bg-chip active:bg-chip"
                            >
                                <Receipt size={18} className="text-muted" aria-hidden="true" /> {t.viewReceipt}
                            </button>
                        )}
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

            {/* Expandable detail — gets a subtle inset bg */}
            <AnimatePresence>
                {isExpanded && (
                    <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        <div className="mb-3 ml-[68px] mr-4 space-y-1.5 rounded-[14px] bg-chip px-3 py-2.5">
                            {/* SPLIT */}
                            {hasSplit && (
                                <>
                                    <SplitRow
                                        avatar={state.userProfile?.avatar}
                                        name={state.userProfile?.name || t.you}
                                        color={state.userProfile?.color || '#10b981'}
                                        amount={formatCurrency(transaction.splitDetails!.myPortion, transaction.currency)}
                                        amountClassName="text-tertiary"
                                    />
                                    {transaction.splitDetails!.shares.map(share => {
                                        const sharePerson = state.people.find(p => p.id === share.personId);
                                        return (
                                            <SplitRow
                                                key={share.personId}
                                                avatar={sharePerson?.avatar}
                                                name={sharePerson?.name || t.unknown}
                                                color={sharePerson?.color || '#808080'}
                                                amount={formatCurrency(share.amount, transaction.currency)}
                                                isPaid={share.isPaid}
                                            />
                                        );
                                    })}
                                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-outline-variant/10">
                                        <span className="text-on-surface-variant">{t.total}</span>
                                        <span className="font-semibold text-on-surface">
                                            {formatCurrency(transaction.splitDetails!.totalAmount, transaction.currency)}
                                        </span>
                                    </div>
                                </>
                            )}

                            {/* RECEIPT */}
                            {transaction.receiptData && !hasSplit && (
                                <>
                                    {transaction.receiptData.merchant && (
                                        <DetailRow
                                            label={t.merchant}
                                            value={transaction.receiptData.merchant}
                                        />
                                    )}
                                    {transaction.receiptData.items && transaction.receiptData.items.length > 0 && (
                                        <div className="space-y-0.5 py-1">
                                            {transaction.receiptData.items.slice(0, 5).map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-xs">
                                                    <span className="text-on-surface-variant/70 truncate flex-1 mr-2">
                                                        {item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}
                                                    </span>
                                                    <span className="font-semibold text-on-surface tabular-nums">
                                                        {formatCurrency(item.price, transaction.currency)}
                                                    </span>
                                                </div>
                                            ))}
                                            {transaction.receiptData.items.length > 5 && (
                                                <div className="text-[10px] text-on-surface-variant/40 text-center">
                                                    +{transaction.receiptData.items.length - 5} {t.more}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-hair">
                                        <span className="text-muted">{t.total}</span>
                                        <span className="font-semibold text-on-surface">
                                            {formatCurrency(transaction.receiptData.total || transaction.amount, transaction.currency)}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); onViewReceipt(); }}
                                        className="mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-accent-soft text-[13px] font-semibold text-accent transition-colors focus-visible:ring-2 focus-visible:ring-accent"
                                    >
                                        <Receipt size={14} aria-hidden="true" /> {t.viewReceipt}
                                    </button>
                                </>
                            )}

                            {/* REGULAR DETAILS */}
                            {!hasSplit && !transaction.receiptData && (
                                <>
                                    {transaction.note && transaction.note.length > 25 && (
                                        <p className="text-xs text-on-surface leading-relaxed">{transaction.note}</p>
                                    )}
                                    {transaction.subcategory && (
                                        <DetailRow
                                            label={t.subcategory}
                                            value={transaction.subcategory}
                                        />
                                    )}
                                    {transaction.fees && transaction.fees > 0 && (
                                        <DetailRow
                                            label={t.fees}
                                            value={formatCurrency(transaction.fees, 'USD')}
                                            valueClassName="text-error"
                                        />
                                    )}
                                    {event && (
                                        <DetailRow
                                            label={t.event}
                                            value={event.name}
                                            valueClassName="text-primary"
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </m.div>
    );
});

TransactionItem.displayName = 'TransactionItem';

/* ── Helpers ── */

const DetailRow: React.FC<{ label: string; value: string; valueClassName?: string }> = ({ label, value, valueClassName }) => (
    <div className="flex justify-between items-center text-xs">
        <span className="text-on-surface-variant/60">{label}</span>
        <span className={clsx("text-on-surface font-medium", valueClassName)}>{value}</span>
    </div>
);

const SplitRow: React.FC<{
    avatar?: string;
    name: string;
    color: string;
    amount: string;
    amountClassName?: string;
    isPaid?: boolean;
}> = ({ avatar, name, color, amount, amountClassName, isPaid }) => (
    <div className="flex justify-between items-center text-xs">
        <span className="text-on-surface-variant flex items-center gap-1.5">
            {avatar ? (
                avatar.startsWith('data:') || avatar.startsWith('http') ? (
                    <img src={avatar} alt={name} className="w-5 h-5 rounded-full object-cover" />
                ) : (
                    <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ backgroundColor: color + '18', color }}
                    >
                        {avatar}
                    </div>
                )
            ) : (
                <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ backgroundColor: color + '18', color }}
                >
                    {name[0] || '?'}
                </div>
            )}
            {name}
        </span>
        <span className={clsx("font-medium tabular-nums flex items-center gap-1", amountClassName || "text-on-surface")}>
            {amount}
            {isPaid && <Check size={10} className="text-tertiary" />}
        </span>
    </div>
);
