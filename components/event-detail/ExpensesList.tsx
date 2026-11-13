import React, { useMemo, useRef } from 'react';
import { m } from 'motion/react';
import { Edit, Handshake, MoreHorizontal, Plus, Receipt, Trash2 } from 'lucide-react';
import { AppState, SharedExpense, Transaction, Person, Currency } from '../../types';
import { convertCurrency } from '../../utils/currencyUtils';
import { UnifiedExpense } from './types';
import { getParticipantInitials, getParticipantTooltipLabel } from '../../utils/eventParticipants';
import { useEscapeKey } from '../../hooks/useFocusTrap';
import { TRANSLATIONS } from '../../constants';
import { getIntlLocale } from '../../utils/locale';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { money } from '../home/parts';
import { isSettlementExpense } from '../../domain/settle';

interface ExpensesListProps {
    unifiedExpenses: UnifiedExpense[];
    state: AppState;
    eventPeople: Person[];
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    onEditTransaction: (transaction: Transaction) => void;
    onDeleteTransaction?: (id: string) => void;
    onEditSharedExpense: (expense: SharedExpense) => void;
    onDeleteSharedExpense: (id: string) => void;
    onOpenSharedModal: () => void;
    /** Currency for the per-day totals. */
    currency?: Currency;
}

const LONG_PRESS_MS = 500;

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

interface RowProps {
    id: string;
    left: React.ReactNode;
    title: string;
    sub: string;
    amount: string;
    amountClassName?: string;
    last: boolean;
    menuOpen: boolean;
    setOpenMenuId: (id: string | null) => void;
    /** Without it (settlement rows) a tap opens the actions menu instead. */
    onEdit?: () => void;
    onDelete: () => void;
    t: (typeof TRANSLATIONS)['en'];
}

/** One expense row: tap to edit, long-press or the ... button for actions. */
const ExpenseRow: React.FC<RowProps> = ({ id, left, title, sub, amount, amountClassName, last, menuOpen, setOpenMenuId, onEdit, onDelete, t }) => {
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressed = useRef(false);

    const handlePressStart = () => {
        longPressed.current = false;
        pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setOpenMenuId(id);
        }, LONG_PRESS_MS);
    };
    const handlePressEnd = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
    };

    return (
        <div className="relative">
            <div className={`group flex min-h-[64px] items-center gap-3 py-2 ${last ? '' : 'border-b border-hair'}`}>
                <button
                    type="button"
                    onClick={() => {
                        if (longPressed.current) return;
                        if (onEdit) onEdit();
                        else setOpenMenuId(menuOpen ? null : id);
                    }}
                    onMouseDown={handlePressStart}
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    onTouchStart={handlePressStart}
                    onTouchEnd={handlePressEnd}
                    onContextMenu={event => {
                        event.preventDefault();
                        setOpenMenuId(id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                    {left}
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[15px] font-semibold">{title}</span>
                        <span className="truncate text-[13px] text-muted">{sub}</span>
                    </span>
                    <span className={`shrink-0 text-[15px] font-semibold ${amountClassName ?? ''}`}>{amount}</span>
                </button>
                {/* Visible alternative to long-press */}
                <button
                    type="button"
                    aria-label={t.moreActions}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    title={t.moreActions}
                    onClick={() => setOpenMenuId(menuOpen ? null : id)}
                    className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-opacity hover:bg-chip opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                >
                    <MoreHorizontal size={18} aria-hidden="true" />
                </button>
            </div>

            {menuOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} aria-hidden="true" />
                    <m.div
                        role="menu"
                        aria-label={t.moreActions}
                        initial={{ opacity: 0, scale: 0.94, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        style={{ transformOrigin: 'top right' }}
                        className="glass-sheet absolute right-0 top-[calc(100%-6px)] z-50 min-w-[170px] rounded-[22px] p-1.5"
                    >
                        {onEdit && (
                            <button
                                type="button"
                                role="menuitem"
                                autoFocus
                                onClick={() => {
                                    setOpenMenuId(null);
                                    onEdit();
                                }}
                                className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium hover:bg-chip"
                            >
                                <Edit size={17} className="text-muted" aria-hidden="true" /> {t.edit}
                            </button>
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            autoFocus={!onEdit}
                            onClick={() => {
                                setOpenMenuId(null);
                                // Single-item delete: the handler offers Undo.
                                onDelete();
                            }}
                            className="flex h-11 w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] font-medium text-neg hover:bg-chip"
                        >
                            <Trash2 size={17} aria-hidden="true" /> {t.delete}
                        </button>
                    </m.div>
                </>
            )}
        </div>
    );
};

export const ExpensesList: React.FC<ExpensesListProps> = ({
    unifiedExpenses,
    state,
    eventPeople,
    openMenuId,
    setOpenMenuId,
    onEditTransaction,
    onDeleteTransaction,
    onEditSharedExpense,
    onDeleteSharedExpense,
    onOpenSharedModal,
    currency = state.baseCurrency,
}) => {
    const t = TRANSLATIONS[state.language];
    const locale = getIntlLocale(state.language);
    const pluralRules = new Intl.PluralRules(locale);
    const formatPeopleCount = (count: number) => {
        const category = pluralRules.select(count);
        const template = category === 'one' ? t.peopleCountOne : category === 'few' ? t.peopleCountFew : t.peopleCountOther;
        return template.replace('{count}', String(count));
    };
    useEscapeKey(() => setOpenMenuId(null), openMenuId !== null);

    const groups = useMemo(() => {
        const result: Array<{ key: string; date: Date; items: UnifiedExpense[]; total: number }> = [];
        unifiedExpenses.forEach(item => {
            const key = dayKey(item.date);
            let group = result.find(entry => entry.key === key);
            if (!group) {
                group = { key, date: item.date, items: [], total: 0 };
                result.push(group);
            }
            group.items.push(item);
            const isIncome = item.type === 'transaction' && item.data.type !== 'expense';
            const isSettlement = item.type === 'sharedExpense' && isSettlementExpense(item.data);
            if (!isIncome && !isSettlement) {
                group.total += convertCurrency(item.data.amount, item.data.currency, currency, state.rates.rates);
            }
        });
        return result;
    }, [unifiedExpenses, currency, state.rates.rates]);

    const dayLabel = (date: Date) => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (dayKey(date) === dayKey(today)) return t.today;
        if (dayKey(date) === dayKey(yesterday)) return t.yesterday;
        return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    };

    if (unifiedExpenses.length === 0) {
        return (
            <section className="paper-tile flex flex-col items-center gap-3 px-6 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent-soft text-accent" aria-hidden="true">
                    <Receipt size={26} />
                </span>
                <h3 className="text-[17px] font-bold">{t.noExpensesYet}</h3>
                <p className="max-w-[280px] text-[14px] text-muted">{t.noEventExpensesDesc}</p>
                <button
                    type="button"
                    onClick={onOpenSharedModal}
                    className="mt-1 flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent"
                >
                    <Plus size={18} aria-hidden="true" />
                    {t.addExpense}
                </button>
            </section>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {groups.map(group => (
                <section key={group.key} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between px-1.5">
                        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{dayLabel(group.date)}</h3>
                        <span className="text-[13px] font-medium text-faint">{money(group.total, currency, state.language)}</span>
                    </div>
                    <div className="paper-tile px-4 py-1">
                        {group.items.map((item, index) => {
                            const last = index === group.items.length - 1;
                            if (item.type === 'transaction') {
                                const tx = item.data;
                                const category = state.categories.find(c => c.id === tx.categoryId);
                                const account = state.accounts.find(a => a.id === tx.accountId);
                                const isExpense = tx.type === 'expense';
                                return (
                                    <ExpenseRow
                                        key={tx.id}
                                        id={tx.id}
                                        left={<CategoryGlyph category={category} />}
                                        title={tx.note || category?.name || t.expense}
                                        sub={[category?.name, account?.name].filter(Boolean).join(' · ')}
                                        amount={money(tx.amount, tx.currency, state.language, true)}
                                        amountClassName={isExpense ? undefined : 'text-pos'}
                                        last={last}
                                        menuOpen={openMenuId === tx.id}
                                        setOpenMenuId={setOpenMenuId}
                                        onEdit={() => onEditTransaction(tx)}
                                        onDelete={() => onDeleteTransaction?.(tx.id)}
                                        t={t}
                                    />
                                );
                            }

                            const expense = item.data;
                            const payer =
                                eventPeople.find(p => p.id === expense.paidBy) ??
                                state.people.find(p => p.id === expense.paidBy);
                            const findPerson = (id: string) =>
                                eventPeople.find(p => p.id === id) ?? state.people.find(p => p.id === id);
                            if (isSettlementExpense(expense)) {
                                const isSelf = (id: string) => id === 'self' || id === state.userProfile?.id;
                                const nameOf = (id: string) => (isSelf(id) ? t.you : findPerson(id)?.name ?? t.unknown);
                                const receiver = expense.sharedWith[0] ?? '';
                                return (
                                    <ExpenseRow
                                        key={expense.id}
                                        id={expense.id}
                                        left={(
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
                                                <Handshake size={19} />
                                            </span>
                                        )}
                                        title={t.settlement}
                                        sub={`${nameOf(expense.paidBy)} → ${nameOf(receiver)}`}
                                        amount={money(expense.amount, expense.currency, state.language, true)}
                                        amountClassName="text-muted"
                                        last={last}
                                        menuOpen={openMenuId === expense.id}
                                        setOpenMenuId={setOpenMenuId}
                                        onDelete={() => onDeleteSharedExpense(expense.id)}
                                        t={t}
                                    />
                                );
                            }
                            return (
                                <ExpenseRow
                                    key={expense.id}
                                    id={expense.id}
                                    left={(
                                        <span
                                            title={payer ? getParticipantTooltipLabel(payer) : t.unknownPayer}
                                            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold text-white"
                                            style={{ background: payer?.color || '#8A8984' }}
                                        >
                                            {payer?.avatar
                                                ? <img src={payer.avatar} alt={payer.name} className="h-full w-full object-cover" />
                                                : payer ? getParticipantInitials(payer.name) : '?'}
                                        </span>
                                    )}
                                    title={expense.name}
                                    sub={`${t.paidByName.replace('{name}', payer?.name ?? t.unknownPayer)} · ${formatPeopleCount(expense.sharedWith.length)}`}
                                    amount={money(expense.amount, expense.currency, state.language, true)}
                                    last={last}
                                    menuOpen={openMenuId === expense.id}
                                    setOpenMenuId={setOpenMenuId}
                                    onEdit={() => onEditSharedExpense(expense)}
                                    onDelete={() => onDeleteSharedExpense(expense.id)}
                                    t={t}
                                />
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
};
