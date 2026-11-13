import React, { useState, useMemo } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameMonth,
    isSameDay,
    isToday,
    parseISO,
    isWeekend,
    getDay
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Receipt } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { AppState, Transaction, View } from '../types';
import { MOTION } from '../config';
import { convertAmount } from '../services/currencyService';
import { formatCurrency } from '../utils/formatters';
import { formatDate, formatMonthYear } from '../utils/locale';
import { TRANSLATIONS } from '../constants';
import { TransactionItem } from './TransactionItem';

interface CalendarViewProps {
    state: AppState;
    onAddTransaction: (transaction: Transaction) => void;
    setCurrentView: (view: View) => void;
    setSelectedTransaction: (transaction: Transaction | null) => void;
    setIsEditModalOpen: (isOpen: boolean) => void;
    setIsReceiptModalOpen: (isOpen: boolean) => void;
    setIsSplitModalOpen: (isOpen: boolean) => void;
    deleteTransaction: (id: string) => void;
    onEditSplitTransaction?: (transaction: Transaction) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
    state,
    onAddTransaction,
    setCurrentView,
    setSelectedTransaction,
    setIsEditModalOpen,
    setIsReceiptModalOpen,
    setIsSplitModalOpen,
    deleteTransaction,
    onEditSplitTransaction
}) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const jumpToToday = () => {
        const today = new Date();
        setCurrentDate(today);
        setSelectedDate(today);
    };

    // Calculate daily totals for the current month view
    const dailyTotals = useMemo(() => {
        const totals: Record<string, { income: number; expense: number }> = {};

        state.transactions.forEach(t => {
            // Skip internal transfers for totals
            if (t.categoryId === 'internal-transfer') return;

            const dateStr = format(parseISO(t.date), 'yyyy-MM-dd');
            if (!totals[dateStr]) {
                totals[dateStr] = { income: 0, expense: 0 };
            }

            const amount = convertAmount(t.amount, t.currency, state.baseCurrency, state.rates);

            if (t.type === 'income') {
                totals[dateStr].income += amount;
            } else {
                totals[dateStr].expense += amount;
            }
        });

        return totals;
    }, [state.transactions, state.baseCurrency, state.rates]);

    // Calculate max spending for intensity gradient
    const maxSpending = useMemo(() => {
        const expenses = Object.values(dailyTotals).map(t => t.expense);
        return Math.max(...expenses, 1); // At least 1 to avoid division by zero
    }, [dailyTotals]);

    // Get spending intensity (0-1)
    const getSpendingIntensity = (expense: number) => {
        if (expense === 0) return 0;
        return Math.min(expense / maxSpending, 1);
    };

    // Generate calendar days
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    // Get transactions for selected day
    const selectedDayTransactions = useMemo(() => {
        if (!selectedDate) return [];
        return state.transactions.filter(t =>
            isSameDay(parseISO(t.date), selectedDate)
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedDate, state.transactions]);

    const t = TRANSLATIONS[state.language];
    // 2024-01-01 is a Monday; the grid starts on Monday.
    const weekDays = Array.from({ length: 7 }, (_, i) => formatDate(new Date(2024, 0, 1 + i), { weekday: 'short' }, state.language));

    return (
        <motion.div
            initial={MOTION.view.initial}
            animate={MOTION.view.animate}
            exit={MOTION.view.exit}
            transition={MOTION.view.transition}
            className="space-y-6 pb-24"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-display font-bold text-on-surface">
                    {formatMonthYear(currentDate, state.language)}
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={jumpToToday}
                        className="p-2 text-primary hover:bg-primary-container/20 rounded-full transition-colors mr-2"
                        title={t.jumpToToday}
                    >
                        <CalendarIcon size={20} />
                    </button>
                    <button
                        onClick={prevMonth}
                        className="p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <button
                        onClick={nextMonth}
                        className="p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-full transition-colors"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Calendar Grid */}
                <div className="flex-1 w-full bg-surface-container-low rounded-2xl p-4 shadow-elevation-1 overflow-hidden">
                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 mb-2">
                        {weekDays.map((day, idx) => {
                            const isWeekendDay = idx >= 5; // Saturday (5) and Sunday (6)
                            return (
                                <div
                                    key={day}
                                    className={clsx(
                                        "text-center text-xs font-medium uppercase tracking-wider py-2",
                                        isWeekendDay
                                            ? "text-primary/70"
                                            : "text-on-surface-variant/70"
                                    )}
                                >
                                    {day}
                                </div>
                            );
                        })}
                    </div>

                    {/* Days */}
                    <div className="grid grid-cols-7 gap-1 sm:gap-2 lg:gap-3">
                        {calendarDays.map((day, dayIdx) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const totals = dailyTotals[dateStr] || { income: 0, expense: 0 };
                            const isSelected = selectedDate && isSameDay(day, selectedDate);
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const isTodayDate = isToday(day);
                            const isWeekendDay = isWeekend(day);

                            const net = totals.income - totals.expense;
                            const hasActivity = totals.income > 0 || totals.expense > 0;
                            const spendingIntensity = getSpendingIntensity(totals.expense);

                            // Calculate spending gradient color
                            const getSpendingStyle = () => {
                                if (!hasActivity || isSelected || isTodayDate) return {};
                                if (net >= 0) return {}; // Net positive, no expense gradient

                                // Gradient from light to intense based on spending
                                const opacity = 0.1 + (spendingIntensity * 0.4); // 0.1 to 0.5
                                return {
                                    background: `linear-gradient(135deg, rgb(var(--md-sys-color-error) / ${opacity * 0.3}) 0%, rgb(var(--md-sys-color-error) / ${opacity}) 100%)`
                                };
                            };

                            return (
                                <motion.button
                                    key={day.toString()}
                                    onClick={() => setSelectedDate(day)}
                                    whileTap={{ scale: 0.95 }}
                                    style={getSpendingStyle()}
                                    className={clsx(
                                        "relative aspect-square lg:aspect-auto lg:min-h-[100px] rounded-xl flex flex-col items-center justify-start pt-1 sm:pt-2 transition-all duration-200",
                                        !isCurrentMonth && "opacity-30 grayscale",
                                        isSelected
                                            ? "bg-primary text-on-primary shadow-md ring-2 ring-primary ring-offset-2 ring-offset-surface"
                                            : isTodayDate
                                                ? "bg-secondary-container text-on-secondary-container"
                                                : isWeekendDay
                                                    ? "bg-primary/5 hover:bg-primary/10 border border-primary/10"
                                                    : "bg-surface-container hover:bg-surface-container-high",
                                        hasActivity && !isSelected && !isTodayDate && net > 0 && "bg-tertiary-container/30"
                                    )}
                                >
                                    <span className={clsx(
                                        "text-xs sm:text-sm font-medium",
                                        isSelected ? "text-on-primary" : "text-on-surface"
                                    )}>
                                        {format(day, 'd')}
                                    </span>

                                    {/* Dots/Indicators */}
                                    <div className="flex gap-0.5 mt-1 sm:mt-2">
                                        {totals.income > 0 && (
                                            <div className={clsx(
                                                "w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full",
                                                isSelected ? "bg-on-primary" : "bg-tertiary"
                                            )} />
                                        )}
                                        {totals.expense > 0 && (
                                            <div className={clsx(
                                                "w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full",
                                                isSelected ? "bg-on-primary" : "bg-error"
                                            )} />
                                        )}
                                    </div>

                                    {/* Amount (Desktop/Tablet only, or if space permits) */}
                                    <div className="hidden sm:flex flex-col items-center mt-1 text-[10px] lg:text-xs leading-tight">
                                        {totals.income > 0 && (
                                            <span className={isSelected ? "text-on-primary" : "text-tertiary"}>
                                                +{Math.round(totals.income)}
                                            </span>
                                        )}
                                        {totals.expense > 0 && (
                                            <span className={isSelected ? "text-on-primary" : "text-error"}>
                                                -{Math.round(totals.expense)}
                                            </span>
                                        )}
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {/* Selected Day Details */}
                <div className="w-full lg:w-96 flex-shrink-0">
                    <AnimatePresence mode="wait">
                        {selectedDate && (
                            <motion.div
                                key={selectedDate.toISOString()}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="space-y-4"
                            >
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-lg font-medium text-on-surface">
                                        {isToday(selectedDate) ? t.today : formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' }, state.language)}
                                    </h3>
                                    {dailyTotals[format(selectedDate, 'yyyy-MM-dd')] && (
                                        <div className="text-sm font-mono">
                                            <span className="text-tertiary mr-3">+{formatCurrency(dailyTotals[format(selectedDate, 'yyyy-MM-dd')].income, state.baseCurrency)}</span>
                                            <span className="text-error">-{formatCurrency(dailyTotals[format(selectedDate, 'yyyy-MM-dd')].expense, state.baseCurrency)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {selectedDayTransactions.length === 0 ? (
                                        <div className="bg-surface-container-low rounded-xl">
                                            <EmptyState
                                                icon={Receipt}
                                                title={t.noTransactionsOnDay}
                                                description={t.noTransactionsOnDayDesc}
                                            />
                                        </div>
                                    ) : (
                                        selectedDayTransactions.map(t => {
                                            const cat = state.categories.find(c => c.id === t.categoryId) || state.categories[0];
                                            const account = state.accounts.find(a => a.id === t.accountId) || state.accounts[0];
                                            const person = t.personId ? state.people.find(p => p.id === t.personId) : undefined;

                                            return (
                                                <TransactionItem
                                                    key={t.id}
                                                    transaction={t}
                                                    category={cat}
                                                    account={account}
                                                    person={person}
                                                    state={state}
                                                    onClick={() => {
                                                        if (t.splitDetails && onEditSplitTransaction) {
                                                            onEditSplitTransaction(t);
                                                        } else {
                                                            setSelectedTransaction(t);
                                                            setIsEditModalOpen(true);
                                                        }
                                                    }}
                                                    onSplit={() => { setSelectedTransaction(t); setIsSplitModalOpen(true); }}
                                                    onEdit={() => { setSelectedTransaction(t); setIsEditModalOpen(true); }}
                                                    onEditSplit={onEditSplitTransaction ? () => onEditSplitTransaction(t) : undefined}
                                                    onDelete={() => deleteTransaction(t.id)}
                                                    onViewReceipt={() => { setSelectedTransaction(t); setIsReceiptModalOpen(true); }}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};
