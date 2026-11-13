import React from 'react';
import { m } from 'motion/react';
import { Edit, Trash2, Receipt, Plus } from 'lucide-react';
import { EmptyState } from '../EmptyState';
import { TransactionItem } from '../TransactionItem';
import { AppState, SharedExpense, Transaction, Person } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { UnifiedExpense } from './types';
import { getParticipantInitials, getParticipantTooltipLabel } from '../../utils/eventParticipants';

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
}

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
}) => {
    return (
        <m.div
            key="shared"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
        >


            {/* Unified Expenses List */}
            <div className="space-y-3">
                {unifiedExpenses.length === 0 ? (
                    <EmptyState
                        icon={Receipt}
                        title="No expenses yet"
                        description="Add transactions from dashboard or use + button for shared expenses"
                        action={{ label: 'Add Expense', onClick: onOpenSharedModal }}
                    />
                ) : (
                    <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline/10">
                        {unifiedExpenses.map(item => {
                            if (item.type === 'transaction') {
                                const tx = item.data;
                                const category = state.categories.find(c => c.id === tx.categoryId) || state.categories[0];
                                const account = state.accounts.find(a => a.id === tx.accountId) || state.accounts[0];
                                const person = tx.personId ? state.people.find(p => p.id === tx.personId) : undefined;

                                return (
                                    <TransactionItem
                                        key={tx.id}
                                        transaction={tx}
                                        category={category}
                                        account={account}
                                        person={person}
                                        state={state}
                                        onClick={() => {}}
                                        onSplit={() => {}}
                                        onEdit={() => onEditTransaction(tx)}
                                        onDelete={() => onDeleteTransaction?.(tx.id)}
                                        onViewReceipt={() => {}}
                                    />
                                );
                            } else {
                                // Shared Expense
                                const expense = item.data;
                                const payer =
                                    eventPeople.find(p => p.id === expense.paidBy) ??
                                    state.people.find(p => p.id === expense.paidBy);
                                const showMenu = openMenuId === expense.id;
                                let pressTimer: NodeJS.Timeout;

                                const handlePressStart = (e: React.MouseEvent | React.TouchEvent) => {
                                    e.preventDefault();
                                    pressTimer = setTimeout(() => {
                                        setOpenMenuId(expense.id);
                                    }, 500);
                                };

                                const handlePressEnd = () => {
                                    clearTimeout(pressTimer);
                                };

                                return (
                                    <div key={expense.id} className="relative">
                                        <div
                                            className="flex items-center justify-between p-4 hover:bg-surface-container transition-colors cursor-pointer border-b border-outline/5 last:border-b-0"
                                            onMouseDown={handlePressStart}
                                            onMouseUp={handlePressEnd}
                                            onMouseLeave={handlePressEnd}
                                            onTouchStart={handlePressStart}
                                            onTouchEnd={handlePressEnd}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2"
                                                    title={payer ? getParticipantTooltipLabel(payer) : 'Unknown payer'}
                                                    style={{
                                                        backgroundColor: payer?.color ? payer.color + '20' : '#888888' + '20',
                                                        color: payer?.color || '#888888',
                                                        borderColor: payer?.color || '#888888'
                                                    }}
                                                >
                                                    {payer?.avatar ? (
                                                        <img src={payer.avatar} alt={payer.name} className="w-full h-full rounded-full object-cover" />
                                                    ) : (
                                                        payer ? getParticipantInitials(payer.name) : '?'
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-on-surface">{expense.name}</p>
                                                    <p className="text-xs text-on-surface-variant">
                                                        {payer?.name} paid • {expense.sharedWith.length} {expense.sharedWith.length === 1 ? 'person' : 'people'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="font-semibold text-on-surface">
                                                    {formatCurrency(expense.amount, expense.currency)}
                                                </span>
                                                <span className="text-xs text-on-surface-variant">
                                                    {new Date(expense.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>
                                        </div>

                                        {showMenu && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setOpenMenuId(null)}
                                                />
                                                <m.div
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="absolute right-0 top-full mt-2 z-50 bg-surface rounded-xl shadow-2xl border border-outline/10 overflow-hidden min-w-[150px]"
                                                >
                                                    <button
                                                        onClick={() => {
                                                            setOpenMenuId(null);
                                                            onEditSharedExpense(expense);
                                                        }}
                                                        className="w-full px-4 py-3 text-left text-sm font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
                                                    >
                                                        <Edit size={16} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setOpenMenuId(null);
                                                            if (window.confirm(`Delete "${expense.name}"?`)) {
                                                                onDeleteSharedExpense(expense.id);
                                                            }
                                                        }}
                                                        className="w-full px-4 py-3 text-left text-sm font-medium text-error hover:bg-error/10 transition-colors flex items-center gap-2"
                                                    >
                                                        <Trash2 size={16} /> Delete
                                                    </button>
                                                </m.div>
                                            </>
                                        )}
                                    </div>
                                );
                            }
                        })}
                    </div>
                )}
            </div>

        </m.div>
    );
};

export const ExpensesFab: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    return (
        /* Floating Action Button - Outside motion.div to prevent "teleporting" glitch */
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50 hover:shadow-2xl hover:shadow-primary/20"
        >
            <Plus size={28} />
        </button>
    );
};
