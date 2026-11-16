import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { CalendarClock, CalendarDays, List, MoreHorizontal, Plus, Repeat } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AppState, Transaction } from '../types';
import { MOTION } from '../config';
import { TRANSLATIONS } from '../constants';
import { convertAmount } from '../services/currencyService';
import { getCountedExpenseAmount, getCountedIncomeAmount } from '../domain/money';
import { computeMonthSummary, getUpcomingRecurring, parseLocalDate } from '../domain/home';
import { dayKey, getRecurringOccurrences, heatLevel, monthGrid, type DueOccurrence } from '../domain/calendar';
import { resolveHomeHeader } from '../domain/homeHeader';
import { createTransactionDraft } from '../domain/transactions';
import { formatDate, formatMoney, formatNumber } from '../utils/locale';
import { localizeCategoryName } from '../utils/systemText';
import { TransactionItem } from './TransactionItem';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { HeroIconButton, HeroMenu, ScreenHero } from './ui/ScreenHero';
import { MonthPicker } from './calendar/MonthPicker';
import { CALENDAR_STRINGS } from './calendar/calendarStrings';
import { fill } from './home/parts';
import { openTransactionDetails } from './transaction-details/detailsBus';

interface CalendarViewProps {
    state: AppState;
    /** Back to the list (Activity). */
    onOpenList: () => void;
    /** Settings > Recurring. */
    onOpenRecurring: () => void;
    setSelectedTransaction: (transaction: Transaction | null) => void;
    setIsEditModalOpen: (isOpen: boolean) => void;
    setIsSplitModalOpen: (isOpen: boolean) => void;
    deleteTransaction: (id: string) => void;
    onEditSplitTransaction?: (transaction: Transaction) => void;
}

const firstOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase() + value.slice(1);

/** Whole numbers in your own currency; other currencies keep their symbol. Cents only when there are any. */
const plainAmount = (value: number, currency: AppState['baseCurrency'], state: AppState): string => {
    const absolute = Math.abs(value);
    const digits = Math.round(absolute * 100) % 100 === 0 ? 0 : 2;
    const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
    return currency === state.baseCurrency
        ? formatNumber(absolute, options, state.language)
        : formatMoney(absolute, currency, state.language, options);
};

/** Day shading on the header colour: white veils, with dark numbers once the veil gets light. */
const HEAT = ['', 'bg-white/[0.10]', 'bg-white/[0.20]', 'bg-white/[0.55] text-[#0B0D0C]', 'bg-white/[0.85] text-[#0B0D0C]'];

/** Sideways swipes on the grid change the month (the grid opts out of the page swipe). */
const useMonthSwipe = (onSwipe: (direction: 1 | -1) => void) => {
    const start = useRef<{ x: number; y: number } | null>(null);
    const swiped = useRef(false);
    return {
        onPointerDown: (event: React.PointerEvent) => {
            start.current = { x: event.clientX, y: event.clientY };
            swiped.current = false;
        },
        onPointerUp: (event: React.PointerEvent) => {
            const from = start.current;
            start.current = null;
            if (!from) return;
            const dx = event.clientX - from.x;
            const dy = event.clientY - from.y;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                swiped.current = true;
                onSwipe(dx < 0 ? 1 : -1);
            }
        },
        onPointerCancel: () => {
            start.current = null;
        },
        // A swipe that ends on a day must not also pick it.
        onClickCapture: (event: React.MouseEvent) => {
            if (swiped.current) {
                event.stopPropagation();
                swiped.current = false;
            }
        },
    };
};

export const CalendarView: React.FC<CalendarViewProps> = ({
    state,
    onOpenList,
    onOpenRecurring,
    setSelectedTransaction,
    setIsEditModalOpen,
    setIsSplitModalOpen,
    deleteTransaction,
    onEditSplitTransaction,
}) => {
    const t = TRANSLATIONS[state.language];
    const s = CALENDAR_STRINGS[state.language];
    const tone = resolveHomeHeader(state.homeHeader).tone;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [month, setMonth] = useState(() => firstOfMonth(now));
    const [selected, setSelected] = useState(today);
    const [direction, setDirection] = useState<1 | -1>(1);

    const showMonth = (next: Date, select?: Date) => {
        const target = firstOfMonth(next);
        setDirection(target < month ? -1 : 1);
        setMonth(target);
        setSelected(select ?? (target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth() ? today : target));
    };
    const swipe = useMonthSwipe(step => showMonth(new Date(month.getFullYear(), month.getMonth() + step, 1)));

    // Daily spending and money in, counted like Home and Activity: transfers and debt settlements
    // are left out, a split counts my share, fees count as spending.
    const dailyTotals = useMemo(() => {
        const totals = new Map<string, { income: number; expense: number }>();
        for (const transaction of state.transactions) {
            const expense = getCountedExpenseAmount(transaction, state.baseCurrency, state.rates);
            const income = getCountedIncomeAmount(transaction, state.baseCurrency, state.rates);
            if (!(expense > 0) && !(income > 0)) continue;
            const date = parseLocalDate(transaction.date);
            if (Number.isNaN(date.getTime())) continue;
            const key = dayKey(date);
            const entry = totals.get(key) ?? { income: 0, expense: 0 };
            if (expense > 0) entry.expense += expense;
            if (income > 0) entry.income += income;
            totals.set(key, entry);
        }
        return totals;
    }, [state.transactions, state.baseCurrency, state.rates]);

    const days = useMemo(() => monthGrid(month.getFullYear(), month.getMonth()), [month]);
    const summary = useMemo(
        () => computeMonthSummary(state, { year: month.getFullYear(), month: month.getMonth() }, now),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state.transactions, state.categories, state.baseCurrency, state.rates, month],
    );
    const monthMax = Math.max(0, ...summary.byDay);

    // Bills still to come on the days shown: from today (earlier ones are entries by now) to the grid's last day.
    const dueByDay = useMemo(() => {
        const from = days[0] > today ? days[0] : today;
        const map = new Map<string, DueOccurrence[]>();
        for (const occurrence of getRecurringOccurrences(state.recurringTransactions, from, days[days.length - 1])) {
            const key = dayKey(occurrence.due);
            map.set(key, [...(map.get(key) ?? []), occurrence]);
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.recurringTransactions, days, today.getTime()]);

    const dueThisMonth = useMemo(() => {
        let total = 0;
        for (const [key, occurrences] of dueByDay) {
            const date = parseLocalDate(key);
            if (date.getMonth() !== month.getMonth()) continue;
            for (const { recurring } of occurrences) {
                if (recurring.type !== 'income') total += convertAmount(recurring.amount, recurring.currency, state.baseCurrency, state.rates);
            }
        }
        return total;
    }, [dueByDay, month, state.baseCurrency, state.rates]);

    const upcoming = useMemo(
        () => getUpcomingRecurring(state.recurringTransactions, now, 30).slice(0, 5),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state.recurringTransactions, today.getTime()],
    );

    const selectedEntries = useMemo(
        () => state.transactions
            .filter(transaction => sameDay(parseLocalDate(transaction.date), selected))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [selected, state.transactions],
    );
    const selectedDue = dueByDay.get(dayKey(selected)) ?? [];
    const selectedTotals = dailyTotals.get(dayKey(selected));

    /** Opens the entry form dated on the selected day (now for today, midday otherwise). */
    const addEntryOnSelectedDay = () => {
        const date = sameDay(selected, today)
            ? new Date()
            : new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 12, 0, 0, 0);
        setSelectedTransaction(createTransactionDraft({
            createId: uuidv4,
            nowIso: date.toISOString(),
            baseCurrency: state.baseCurrency,
            accountId: state.accounts[0]?.id || '',
            accounts: state.accounts,
            categories: state.categories,
            transactions: state.transactions,
        }));
        setIsEditModalOpen(true);
    };

    const longDate = (date: Date) => formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' }, state.language);
    const selectedTitle = sameDay(selected, today) ? fill(s.todayDate, { date: longDate(selected) }) : capitalize(longDate(selected));
    const selectedDayName = formatDate(selected, { weekday: 'long', month: 'long', day: 'numeric' }, state.language);
    // 2024-01-01 is a Monday; the grid starts on Monday.
    const weekDays = Array.from({ length: 7 }, (_, i) => ({
        short: formatDate(new Date(2024, 0, 1 + i), { weekday: 'narrow' }, state.language),
        long: formatDate(new Date(2024, 0, 1 + i), { weekday: 'long' }, state.language),
    }));
    const base = state.baseCurrency;
    const whole = (value: number) => formatNumber(value, { maximumFractionDigits: 0 }, state.language);
    // A month that has not started shows only what is due (unless nothing is).
    const futureMonth = month > today;
    const stats = [
        { label: s.spent, value: whole(summary.spent), show: !futureMonth || (summary.income <= 0.004 && dueThisMonth <= 0.004) },
        { label: s.moneyIn, value: `+${whole(summary.income)}`, show: summary.income > 0.004 },
        { label: s.due, value: `−${whole(dueThisMonth)}`, show: dueThisMonth > 0.004 },
    ].filter(stat => stat.show);

    const categoryOf = (id: string) => state.categories.find(category => category.id === id);
    const walletName = (id: string) => state.accounts.find(account => account.id === id)?.name ?? '';

    return (
        <m.div
            initial={MOTION.view.initial}
            animate={MOTION.view.animate}
            exit={MOTION.view.exit}
            transition={MOTION.view.transition}
            className="mx-auto max-w-[920px] pb-28 min-[1180px]:flex min-[1180px]:items-start min-[1180px]:gap-6"
        >
            {/* Wide windows: the month stays put on the left, the chosen day's entries beside it. */}
            <div className="min-[1180px]:sticky min-[1180px]:top-8 min-[1180px]:w-[500px] min-[1180px]:shrink-0">
            <ScreenHero tone={tone} label={t.calendar}>
                <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
                    <MonthPicker language={state.language} month={month} onChange={value => showMonth(value)} />
                    <HeroIconButton icon={List} label={s.showList} onClick={onOpenList} />
                    <HeroMenu
                        label={t.moreActions}
                        icon={MoreHorizontal}
                        items={[
                            { icon: CalendarDays, label: t.jumpToToday, onSelect: () => showMonth(today, today) },
                            { icon: Plus, label: t.addEntry, onSelect: addEntryOnSelectedDay },
                            { icon: Repeat, label: s.allBills, onSelect: onOpenRecurring },
                        ]}
                    />
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 text-[14px] font-medium text-white/70 md:px-5">
                    {stats.map(stat => (
                        <span key={stat.label} className="whitespace-nowrap">
                            {stat.label} <b className="font-semibold tabular-nums text-white">{stat.value}</b>
                        </span>
                    ))}
                    <span className="sr-only">{base}</span>
                </p>
                <div className="px-3 pb-[40px] pt-3 md:px-4 md:pb-4" data-no-swipe {...swipe} style={{ touchAction: 'pan-y' }}>
                    <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
                        {weekDays.map(day => (
                            <span key={day.long} className="h-6 text-center text-[12px] font-semibold uppercase leading-6 text-white/50">{day.short}</span>
                        ))}
                    </div>
                    <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                        <m.div
                            key={dayKey(month)}
                            custom={direction}
                            initial={{ opacity: 0, x: direction * 28 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: direction * -28 }}
                            transition={{ duration: 0.18 }}
                            className="grid grid-cols-7 gap-1.5"
                            role="group"
                            aria-label={formatDate(month, { month: 'long', year: 'numeric' }, state.language)}
                        >
                            {days.map(day => {
                                const key = dayKey(day);
                                const totals = dailyTotals.get(key);
                                const inMonth = day.getMonth() === month.getMonth();
                                const isToday = sameDay(day, today);
                                const isSelected = sameDay(day, selected);
                                const future = day > today;
                                const level = inMonth && !future ? heatLevel(totals?.expense ?? 0, monthMax) : 0;
                                const due = dueByDay.get(key) ?? [];
                                const label = [
                                    capitalize(formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' }, state.language)),
                                    isToday ? t.today : '',
                                    totals?.expense ? `${s.spent} ${plainAmount(totals.expense, base, state)}` : '',
                                    totals?.income ? `${s.moneyIn} +${plainAmount(totals.income, base, state)}` : '',
                                    due.length ? `${s.due}: ${due.map(item => item.recurring.name).join(', ')}` : '',
                                ].filter(Boolean).join(', ');
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        aria-pressed={isSelected}
                                        aria-current={isToday ? 'date' : undefined}
                                        aria-label={label}
                                        onClick={() => (inMonth ? setSelected(day) : showMonth(day, day))}
                                        className={clsx(
                                            'relative flex h-[40px] flex-col items-center justify-center overflow-visible rounded-[12px] text-[15px] tabular-nums transition-colors md:h-14',
                                            HEAT[level],
                                            !inMonth ? 'text-white/30' : future ? 'font-medium text-white/65' : level < 3 && 'text-white',
                                            inMonth && !future && 'font-semibold',
                                            isSelected && 'font-bold',
                                            isToday && !isSelected && 'ring-[1.5px] ring-inset ring-white/75',
                                        )}
                                    >
                                        {/* The selection ring sits just outside the cell. Not an outline: tapping clears outlines (theme.css focus rules). */}
                                        {isSelected && <span aria-hidden="true" className="pointer-events-none absolute -inset-[3.5px] rounded-[15px] border-2 border-white" />}
                                        <span className="leading-none">{day.getDate()}</span>
                                        {inMonth && totals?.expense && !future ? (
                                            <span className="mt-1 hidden text-[10.5px] font-medium leading-none opacity-75 md:block">
                                                −{whole(totals.expense)}
                                            </span>
                                        ) : null}
                                        {(totals?.income || due.length > 0) && (
                                            <span className="absolute inset-x-0 bottom-[3px] flex justify-center gap-[3px] md:bottom-1.5">
                                                {totals?.income ? <span className="block h-[5px] w-[5px] rounded-full bg-current" /> : null}
                                                {due.length > 0 && <span className="block h-[6px] w-[6px] rounded-full ring-[1.5px] ring-inset ring-current" />}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </m.div>
                    </AnimatePresence>
                </div>
            </ScreenHero>
            </div>

            <div className="screen-sheet min-w-0 flex-1 min-[1180px]:mt-0!">
                <section aria-labelledby="calendar-day-title">
                    <div className="flex min-h-11 items-center justify-between gap-3 px-2">
                        <h2 id="calendar-day-title" className="min-w-0 truncate text-[18px] font-bold tracking-[-0.3px]">{selectedTitle}</h2>
                        {selectedEntries.length > 0 && (
                            <div className="flex shrink-0 items-center gap-2">
                                <span className="flex items-baseline gap-2 text-[14px] font-semibold tabular-nums">
                                    {selectedTotals?.income ? <span className="text-pos">+{plainAmount(selectedTotals.income, base, state)}</span> : null}
                                    {selectedTotals?.expense ? <span className="text-muted">−{plainAmount(selectedTotals.expense, base, state)}</span> : null}
                                </span>
                                <button
                                    type="button"
                                    onClick={addEntryOnSelectedDay}
                                    aria-label={t.addEntryOnDay.replace('{date}', selectedDayName)}
                                    title={t.addEntryOnDay.replace('{date}', selectedDayName)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent"
                                >
                                    <Plus size={19} aria-hidden="true" />
                                </button>
                            </div>
                        )}
                    </div>

                    {selectedEntries.length === 0 && selectedDue.length === 0 ? (
                        <div className="mt-2 flex min-h-[60px] items-center gap-3 rounded-[22px] bg-[var(--paper-tile)] py-2 pl-4 pr-2 shadow-[var(--paper-tile-shadow)]">
                            <CalendarDays size={18} className="shrink-0 text-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1 text-[15px] font-medium text-muted">{s.nothingOnDay}</span>
                            <button
                                type="button"
                                onClick={addEntryOnSelectedDay}
                                aria-label={t.addEntryOnDay.replace('{date}', selectedDayName)}
                                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent"
                            >
                                <Plus size={18} aria-hidden="true" />
                                {t.add}
                            </button>
                        </div>
                    ) : (
                        <div className="mt-2 overflow-hidden rounded-[22px] bg-[var(--paper-tile)] shadow-[var(--paper-tile-shadow)]">
                            {selectedEntries.map((transaction, index) => {
                                const category = categoryOf(transaction.categoryId) || state.categories[0];
                                const account = state.accounts.find(item => item.id === transaction.accountId) || state.accounts[0];
                                const person = transaction.personId ? state.people.find(item => item.id === transaction.personId) : undefined;
                                const event = transaction.eventId ? state.events.find(item => item.id === transaction.eventId) : undefined;
                                return (
                                    <TransactionItem
                                        key={transaction.id}
                                        transaction={transaction}
                                        category={category}
                                        account={account}
                                        person={person}
                                        event={event}
                                        state={state}
                                        onClick={() => openTransactionDetails(transaction.id)}
                                        onSplit={() => { setSelectedTransaction(transaction); setIsSplitModalOpen(true); }}
                                        onEdit={() => { setSelectedTransaction(transaction); setIsEditModalOpen(true); }}
                                        onEditSplit={onEditSplitTransaction ? () => onEditSplitTransaction(transaction) : undefined}
                                        onDelete={() => deleteTransaction(transaction.id)}
                                        isLastInGroup={index === selectedEntries.length - 1 && selectedDue.length === 0}
                                    />
                                );
                            })}
                            {selectedDue.map(({ recurring }, index) => (
                                <div
                                    key={recurring.id}
                                    className={clsx('flex min-h-[64px] items-center gap-3 py-2.5 pl-4 pr-4', index < selectedDue.length - 1 && 'border-b border-hair')}
                                >
                                    <CategoryGlyph category={categoryOf(recurring.categoryId)} shape="circle" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[16px] font-semibold">{recurring.name}</span>
                                        <span className="flex items-center gap-1 truncate text-[13px] text-muted">
                                            <CalendarClock size={13} className="shrink-0" aria-hidden="true" />
                                            {[s.scheduled, walletName(recurring.accountId)].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <span className={clsx('shrink-0 whitespace-nowrap text-[16px] font-semibold tabular-nums text-muted', recurring.type === 'income' && 'text-pos')}>
                                        {recurring.type === 'income' ? '+' : '−'}{plainAmount(recurring.amount, recurring.currency, state)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {state.recurringTransactions.some(item => item.isActive) && (
                    <section aria-labelledby="calendar-upcoming-title" className="mt-6">
                        <div className="flex min-h-11 items-center justify-between gap-3 px-2">
                            <h2 id="calendar-upcoming-title" className="text-[18px] font-bold tracking-[-0.3px]">{s.comingUp}</h2>
                            <button
                                type="button"
                                onClick={onOpenRecurring}
                                className="-mr-2 h-10 shrink-0 rounded-full px-3 text-[15px] font-semibold text-accent"
                            >
                                {s.allBills}
                            </button>
                        </div>
                        {upcoming.length === 0 ? (
                            <p className="mt-2 rounded-[22px] bg-[var(--paper-tile)] px-4 py-4 text-[15px] text-muted shadow-[var(--paper-tile-shadow)]">{s.nothingDue}</p>
                        ) : (
                            <ul className="mt-2 overflow-hidden rounded-[22px] bg-[var(--paper-tile)] shadow-[var(--paper-tile-shadow)]">
                                {upcoming.map(({ recurring, due }, index) => {
                                    const category = categoryOf(recurring.categoryId);
                                    return (
                                        <li key={recurring.id} className={clsx(index < upcoming.length - 1 && 'border-b border-hair')}>
                                            <button
                                                type="button"
                                                onClick={() => showMonth(due, due)}
                                                className="flex min-h-[64px] w-full items-center gap-3 py-2.5 pl-4 pr-4 text-left active:bg-chip"
                                            >
                                                <CategoryGlyph category={category} shape="circle" tone="solid" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[16px] font-semibold">{recurring.name}</span>
                                                    <span className="block truncate text-[13px] text-muted">
                                                        {[
                                                            capitalize(formatDate(due, { weekday: 'short', day: 'numeric', month: 'short' }, state.language)),
                                                            category ? localizeCategoryName(category, state.language) : '',
                                                        ].filter(Boolean).join(' · ')}
                                                    </span>
                                                </span>
                                                <span className={clsx('shrink-0 whitespace-nowrap text-[16px] font-semibold tabular-nums', recurring.type === 'income' && 'text-pos')}>
                                                    {recurring.type === 'income' ? '+' : '−'}{plainAmount(recurring.amount, recurring.currency, state)}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                )}
            </div>
        </m.div>
    );
};
