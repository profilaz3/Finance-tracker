import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'motion/react';
import { Split, Pencil, Trash2, Receipt, User, MapPin, Users, Check, Copy, Bookmark, MoreVertical } from 'lucide-react';
import clsx from 'clsx';
import { Transaction, Category, Account, Person, AppState, Event } from '../types';
import { formatCurrency, getShortDate } from '../utils/formatters';
import { getIconByName } from '../utils/categoryIcons';
import { convertAmount } from '../services/currencyService';
import { TRANSLATIONS } from '../constants';
import { hexToRgb, getLuminance } from '../utils/colorUtils';
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
    const CategoryIcon = getIconByName(category?.icon || 'wallet');
    const hasSplit = !!transaction.splitDetails;

    const displayCurrency = account?.currency || state.baseCurrency;

    const categoryRgb = useMemo(() => {
        const rgb = hexToRgb(category?.color || '#808080');
        if (!rgb) return { r: 128, g: 128, b: 128, lum: 0.5 };
        return { ...rgb, lum: getLuminance(rgb.r, rgb.g, rgb.b) };
    }, [category?.color]);

    const iconStyle = useMemo(() => {
        const { r, g, b, lum } = categoryRgb;
        const f = lum > 0.7 ? 0.5 : lum > 0.55 ? 0.65 : 1;
        return {
            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
            color: `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`,
        };
    }, [categoryRgb]);

    // Category color for the subtitle text
    const categoryTextColor = useMemo(() => {
        const { r, g, b, lum } = categoryRgb;
        const f = lum > 0.7 ? 0.45 : lum > 0.55 ? 0.6 : 0.85;
        return `rgba(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)}, 0.7)`;
    }, [categoryRgb]);

    // Account color for the subtitle text
    const accountTextColor = useMemo(() => {
        const rgb = hexToRgb(account?.color || '#808080');
        if (!rgb) return undefined;
        const lum = getLuminance(rgb.r, rgb.g, rgb.b);
        const f = lum > 0.7 ? 0.45 : lum > 0.55 ? 0.6 : 0.85;
        return `rgba(${Math.round(rgb.r * f)}, ${Math.round(rgb.g * f)}, ${Math.round(rgb.b * f)}, 0.7)`;
    }, [account?.color]);

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
                "group relative select-none transition-colors duration-100",
                !isLastInGroup && "border-b border-outline-variant/10",
                hasExpandableContent ? "cursor-pointer" : "cursor-default",
                transaction.type === 'income'
                    ? "active:bg-tertiary/8 bg-tertiary/[0.03]"
                    : "active:bg-surface-container-low"
            )}
        >
            {/* Row */}
            <div className="flex items-center gap-3 py-2.5 px-3">
                {/* Icon dot */}
                <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={iconStyle}
                >
                    {person ? (
                        person.avatar ? (
                            person.avatar.startsWith('data:') || person.avatar.startsWith('http') ? (
                                <img src={person.avatar} alt={person.name} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                                <div className="text-xs font-medium">{person.avatar}</div>
                            )
                        ) : (
                            <User size={18} aria-hidden="true" />
                        )
                    ) : (
                        <CategoryIcon size={18} aria-hidden="true" />
                    )}
                </div>

                {/* Title + metadata */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-base font-medium text-on-surface truncate">
                            {transaction.note || category?.name || 'Untitled'}
                        </span>
                        {hasSplit && (
                            <span className="text-on-surface-variant/40 text-xs shrink-0">
                                <Users size={13} className="inline" /> {transaction.splitDetails!.shares.length}
                            </span>
                        )}
                        {event && <MapPin size={12} className="text-on-surface-variant/40 shrink-0" />}
                        {transaction.receiptData && <Receipt size={12} className="text-on-surface-variant/40 shrink-0" />}
                    </div>
                    <div className="text-sm text-on-surface-variant/50 truncate mt-px">
                        <span style={accountTextColor ? { color: accountTextColor } : undefined}>{account?.name}</span>
                        {category?.name && (
                            <>
                                <span className="text-on-surface-variant/25"> · </span>
                                <span style={{ color: categoryTextColor }}>{category.name}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Amount */}
                <div className="shrink-0 text-right">
                    <div className={clsx(
                        "text-base font-semibold tabular-nums",
                        transaction.type === 'income' ? "text-tertiary" : "text-on-surface"
                    )}>
                        {transaction.type === 'income' ? '+' : '−'}{formatCurrency(displayAmount, displayCurrency)}
                    </div>
                    <div className="text-[13px] text-on-surface-variant/40 tabular-nums">
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
                    className="-mr-1 p-1.5 shrink-0 rounded-full text-on-surface-variant hover:bg-surface-container-highest transition-opacity opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
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
                        className="fixed inset-0 z-[9998] bg-scrim/20"
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
                        className="z-[9999] min-w-[170px] bg-surface-container-high rounded-2xl shadow-elevation-4 border border-outline-variant/15 overflow-hidden py-1"
                    >
                        {!transaction.personId && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { onSplit(); closeMenu(); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-surface-container-highest flex items-center gap-3 text-sm text-on-surface transition-colors active:bg-surface-container-highest"
                            >
                                <Split size={16} className="text-on-surface-variant" aria-hidden="true" /> {t.split}
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
                            className="w-full text-left px-4 py-2.5 hover:bg-surface-container-highest flex items-center gap-3 text-sm text-on-surface transition-colors active:bg-surface-container-highest"
                        >
                            <Pencil size={16} className="text-on-surface-variant" aria-hidden="true" /> {t.edit || 'Edit'}
                        </button>
                        {onDuplicate && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { onDuplicate(); closeMenu(); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-surface-container-highest flex items-center gap-3 text-sm text-on-surface transition-colors active:bg-surface-container-highest"
                            >
                                <Copy size={16} className="text-on-surface-variant" aria-hidden="true" /> {t.duplicate || 'Duplicate'}
                            </button>
                        )}
                        {onSaveAsTemplate && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { onSaveAsTemplate(); closeMenu(); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-surface-container-highest flex items-center gap-3 text-sm text-on-surface transition-colors active:bg-surface-container-highest"
                            >
                                <Bookmark size={16} className="text-on-surface-variant" aria-hidden="true" /> {state.language === 'sr' ? 'Sačuvaj kao šablon' : 'Save as Template'}
                            </button>
                        )}
                        <div role="separator" className="h-px bg-outline-variant/15 mx-3 my-1" />
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => { onDelete(); closeMenu(); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-error/10 text-error flex items-center gap-3 text-sm transition-colors active:bg-error/20"
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
                        <div className="ml-[52px] mr-1 mb-2 px-3 py-2.5 rounded-lg bg-surface-container-low/60 space-y-1.5">
                            {/* SPLIT */}
                            {hasSplit && (
                                <>
                                    <SplitRow
                                        avatar={state.userProfile?.avatar}
                                        name={state.userProfile?.name || (state.language === 'sr' ? 'Tvoj deo' : 'You')}
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
                                                name={sharePerson?.name || 'Unknown'}
                                                color={sharePerson?.color || '#808080'}
                                                amount={formatCurrency(share.amount, transaction.currency)}
                                                isPaid={share.isPaid}
                                            />
                                        );
                                    })}
                                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-outline-variant/10">
                                        <span className="text-on-surface-variant">{state.language === 'sr' ? 'Ukupno' : 'Total'}</span>
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
                                            label={state.language === 'sr' ? 'Prodavnica' : 'Merchant'}
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
                                                    <span className="font-mono text-on-surface tabular-nums">
                                                        {formatCurrency(item.price, transaction.currency)}
                                                    </span>
                                                </div>
                                            ))}
                                            {transaction.receiptData.items.length > 5 && (
                                                <div className="text-[10px] text-on-surface-variant/40 text-center">
                                                    +{transaction.receiptData.items.length - 5} {state.language === 'sr' ? 'više' : 'more'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-outline-variant/10">
                                        <span className="text-on-surface-variant">{state.language === 'sr' ? 'Ukupno' : 'Total'}</span>
                                        <span className="font-semibold text-on-surface">
                                            {formatCurrency(transaction.receiptData.total || transaction.amount, transaction.currency)}
                                        </span>
                                    </div>
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
                                            label={state.language === 'sr' ? 'Podkategorija' : 'Subcategory'}
                                            value={transaction.subcategory}
                                        />
                                    )}
                                    {transaction.fees && transaction.fees > 0 && (
                                        <DetailRow
                                            label={state.language === 'sr' ? 'Naknade' : 'Fees'}
                                            value={formatCurrency(transaction.fees, 'USD')}
                                            valueClassName="text-error"
                                        />
                                    )}
                                    {event && (
                                        <DetailRow
                                            label={state.language === 'sr' ? 'Događaj' : 'Event'}
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
