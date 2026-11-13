import React, { useMemo } from 'react';
import clsx from 'clsx';
import { AppState, SharedExpense, Person, Currency, EventDebt } from '../../types';
import { settleUnitCents, spendingExpenses } from '../../domain/settle';
import { EventDebtSummary } from '../EventDebtSummary';
import { calculateEventPersonTotals } from '../../utils/eventSummarySelectors';
import { convertCurrency } from '../../utils/currencyUtils';
import { TRANSLATIONS } from '../../constants';
import { Segmented } from '../ui/Segmented';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { Avatar, compactMoney, money, signedMoney } from '../home/parts';

interface SummaryTabProps {
    eventPeople: Person[];
    allExpensesForSummary: SharedExpense[];
    summaryCurrency: Currency;
    setSummaryCurrency: (currency: Currency) => void;
    state: AppState;
    onMarkPaid?: (debt: EventDebt) => void;
}

const CURRENCIES: Currency[] = ['EUR', 'USD', 'RSD'];
/** Colors for event categories that are not in the user's category list. */
const FALLBACK_COLORS = ['#0F766E', '#B43A0A', '#4338CA', '#BE185D', '#0369A1', '#A16207', '#15803D'];

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
    <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-bold tracking-[-0.3px]">{children}</h3>
        {right != null && <span className="text-[13px] text-muted">{right}</span>}
    </div>
);

export const SummaryTab: React.FC<SummaryTabProps> = ({
    eventPeople,
    allExpensesForSummary,
    summaryCurrency,
    setSummaryCurrency,
    state,
    onMarkPaid,
}) => {
    const t = TRANSLATIONS[state.language];
    const { language } = state;
    const rates = state.rates.rates;
    // Charts and shares count real spending; balances also count recorded settlements.
    const spending = useMemo(() => spendingExpenses(allExpensesForSummary), [allExpensesForSummary]);
    const personTotals = calculateEventPersonTotals({
        people: eventPeople,
        expenses: spending,
        summaryCurrency,
        rates,
    });
    const netTotals = calculateEventPersonTotals({
        people: eventPeople,
        expenses: allExpensesForSummary,
        summaryCurrency,
        rates,
    });

    const total = useMemo(
        () => spending.reduce((sum, expense) => sum + convertCurrency(expense.amount, expense.currency, summaryCurrency, rates), 0),
        [spending, summaryCurrency, rates],
    );

    const byCategory = useMemo(() => {
        const sums = new Map<string, number>();
        spending.forEach(expense => {
            const name = expense.category || t.other;
            sums.set(name, (sums.get(name) ?? 0) + convertCurrency(expense.amount, expense.currency, summaryCurrency, rates));
        });
        return [...sums.entries()]
            .map(([name, amount]) => ({ name, amount, category: state.categories.find(category => category.name === name) }))
            .sort((left, right) => right.amount - left.amount)
            .map((entry, index) => ({ ...entry, color: entry.category?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] }));
    }, [spending, summaryCurrency, rates, state.categories, t.other]);

    const rows = personTotals
        .map(summary => ({ ...summary, person: eventPeople.find(entry => entry.id === summary.personId) }))
        .filter((row): row is typeof row & { person: Person } => !!row.person);
    const maxValue = Math.max(1, ...rows.flatMap(row => [row.totalPaid, row.totalOwed]));
    const hasData = eventPeople.length > 0 && spending.length > 0;

    return (
        <div className="flex flex-col gap-4">
            <section className="paper-tile flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                    <h3 className="text-[15px] font-bold">{t.displayCurrency}</h3>
                    <p className="truncate text-[12px] text-muted">{t.displayCurrencyDesc}</p>
                </div>
                <Segmented<Currency>
                    size="sm"
                    ariaLabel={t.displayCurrency}
                    value={summaryCurrency}
                    onChange={setSummaryCurrency}
                    options={CURRENCIES.map(currency => ({ value: currency, label: currency }))}
                    className="shrink-0"
                />
            </section>

            <section className="paper-tile p-4">
                <SectionTitle right={money(total, summaryCurrency, language)}>{t.spendingBreakdown}</SectionTitle>
                {hasData && total > 0 ? (
                    <>
                        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-chip" aria-hidden="true">
                            {rows.filter(row => row.totalPaid > 0).map(row => (
                                <span
                                    key={row.personId}
                                    className="h-full border-r-2 border-[var(--paper-tile)] last:border-r-0"
                                    style={{ width: `${(row.totalPaid / total) * 100}%`, background: row.person.color }}
                                />
                            ))}
                        </div>
                        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                            {rows.filter(row => row.totalPaid > 0).map(row => (
                                <li key={row.personId} className="flex items-center gap-1.5 text-[13px]">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.person.color }} aria-hidden="true" />
                                    <span className="font-semibold">{row.person.name}</span>
                                    <span className="text-muted">{Math.round((row.totalPaid / total) * 100)}%</span>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <p className="py-2 text-[13px] text-muted">{t.noExpensesYet}</p>
                )}
            </section>

            {hasData && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <section className="paper-tile min-w-0 p-4 pb-2">
                        <SectionTitle>{t.individualStats}</SectionTitle>
                        <ul className="flex flex-col">
                            {rows.map((row, index) => {
                                const net = netTotals.find(entry => entry.personId === row.personId) ?? row;
                                const rawBalance = Math.round((net.totalPaid - net.totalOwed) * 100) / 100;
                                // Under one unit (a dinar for RSD) counts as even, like the settle-up plan.
                                const balance = Math.abs(rawBalance) * 100 < settleUnitCents(summaryCurrency) ? 0 : rawBalance;
                                return (
                                    <li key={row.personId} className={clsx('flex flex-col gap-2 py-3', index < rows.length - 1 && 'border-b border-hair')}>
                                        <div className="flex items-center gap-3">
                                            <Avatar name={row.person.name} color={row.person.color} image={row.person.avatar} size={36} />
                                            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{row.person.name}</span>
                                            <span
                                                className={clsx(
                                                    'rounded-full px-2.5 py-1 text-[13px] font-semibold',
                                                    balance > 0 ? 'bg-accent-soft text-pos' : balance < 0 ? 'bg-chip text-neg' : 'bg-chip text-muted',
                                                )}
                                            >
                                                {balance === 0 ? t.settledUp : signedMoney(balance, summaryCurrency, language)}
                                            </span>
                                        </div>
                                        <div className="ml-12 grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-[12px]">
                                            <span className="text-muted">{t.paid}</span>
                                            <span className="h-1.5 rounded-full bg-chip">
                                                <span className="block h-1.5 rounded-full" style={{ width: `${(row.totalPaid / maxValue) * 100}%`, background: row.person.color }} />
                                            </span>
                                            <span className="text-right font-semibold">{compactMoney(row.totalPaid, summaryCurrency, language)}</span>
                                            <span className="text-muted">{t.eventShareLabel}</span>
                                            <span className="h-1.5 rounded-full bg-chip">
                                                <span className="block h-1.5 rounded-full bg-[var(--paper-faint)]" style={{ width: `${(row.totalOwed / maxValue) * 100}%` }} />
                                            </span>
                                            <span className="text-right font-semibold">{compactMoney(row.totalOwed, summaryCurrency, language)}</span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    <section className="paper-tile min-w-0 p-4 pb-2">
                        <SectionTitle>{t.byCategory}</SectionTitle>
                        <ul className="flex flex-col">
                            {byCategory.map((entry, index) => (
                                <li key={entry.name} className={clsx('flex items-center gap-3 py-2.5', index < byCategory.length - 1 && 'border-b border-hair')}>
                                    <CategoryGlyph category={{ name: entry.name, icon: entry.category?.icon, color: entry.color }} size={36} />
                                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className="truncate text-[15px] font-semibold">{entry.name}</span>
                                            <span className="shrink-0 text-[14px] font-semibold">{money(entry.amount, summaryCurrency, language)}</span>
                                        </span>
                                        <span className="h-1.5 rounded-full bg-chip">
                                            <span
                                                className="block h-1.5 rounded-full"
                                                style={{ width: `${total > 0 ? (entry.amount / total) * 100 : 0}%`, background: entry.color }}
                                            />
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            )}

            <section className="paper-tile p-4">
                <SectionTitle>{t.settlement}</SectionTitle>
                <EventDebtSummary
                    expenses={allExpensesForSummary}
                    people={eventPeople}
                    baseCurrency={summaryCurrency}
                    rates={state.rates}
                    selfId={state.userProfile?.id || 'self'}
                    onMarkPaid={onMarkPaid}
                    hasSpending={spending.length > 0}
                />
            </section>
        </div>
    );
};
