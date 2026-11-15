import React, { useMemo } from 'react';
import clsx from 'clsx';
import { AppState, SharedExpense, Person, Currency, EventDebt } from '../../types';
import { planBalances, planSettlement, spendingExpenses } from '../../domain/settle';
import { localizeEventExpenseCategory } from '../../domain/eventExpenseCategory';
import { localizeCategoryName } from '../../utils/systemText';
import { EventDebtSummary } from '../EventDebtSummary';
import { calculateEventPersonTotals } from '../../utils/eventSummarySelectors';
import { convertCurrency } from '../../utils/currencyUtils';
import { TRANSLATIONS } from '../../constants';
import { Segmented } from '../ui/Segmented';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { Avatar, compactMoney, money, signedMoney } from '../home/parts';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { stableColor } from '../../utils/stableColor';
import type { EventViewer } from '../../domain/eventViewer';

interface SummaryTabProps {
    eventPeople: Person[];
    allExpensesForSummary: SharedExpense[];
    summaryCurrency: Currency;
    setSummaryCurrency: (currency: Currency) => void;
    state: AppState;
    onMarkPaid?: (debt: EventDebt) => void;
    /** Event name, used as the purpose of IPS QR payment requests. */
    eventName?: string;
    /** Who is looking (domain/eventViewer): which ids read as "You" and which are the organizer. */
    viewer: Pick<EventViewer, 'isGuest' | 'selfIds' | 'ownerIds' | 'ownerName'>;
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
    eventName,
    viewer,
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
    // Balances come from the settle-up plan itself (rounded once, whole dinars for RSD), so each
    // person's balance matches the payments suggested below to the unit.
    const planned = useMemo(
        () => planBalances(planSettlement(allExpensesForSummary, { currency: summaryCurrency, rates: state.rates })),
        [allExpensesForSummary, summaryCurrency, state.rates],
    );

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
            <section className="paper-tile flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-[150px] flex-1">
                    <h3 className="text-[15px] font-bold">{t.displayCurrency}</h3>
                    <p className="truncate text-[12px] text-muted">{t.displayCurrencyDesc}</p>
                </div>
                <Segmented<Currency>
                    size="sm"
                    ariaLabel={t.displayCurrency}
                    value={summaryCurrency}
                    onChange={setSummaryCurrency}
                    options={CURRENCIES.map(currency => ({
                        value: currency,
                        label: (
                            <span className="flex items-center gap-1.5">
                                <CurrencyFlag currency={currency} size={16} />
                                {currency}
                            </span>
                        ),
                    }))}
                    className="shrink-0"
                />
            </section>

            <section className="paper-tile p-4">
                <SectionTitle
                    right={(
                        <span className="flex items-center gap-1.5 font-semibold text-on-surface">
                            <CurrencyFlag currency={summaryCurrency} size={16} />
                            {money(total, summaryCurrency, language)}
                        </span>
                    )}
                >
                    {t.spendingBreakdown}
                </SectionTitle>
                {hasData && total > 0 ? (
                    <>
                        <div className="flex h-4 w-full gap-1 overflow-hidden" aria-hidden="true">
                            {rows.filter(row => row.totalPaid > 0).map(row => (
                                <span
                                    key={row.personId}
                                    className="h-full rounded-full"
                                    style={{ flexGrow: row.totalPaid, minWidth: 6, background: row.person.color || stableColor(row.person.name) }}
                                />
                            ))}
                        </div>
                        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                            {rows.filter(row => row.totalPaid > 0).map(row => (
                                <li key={row.personId} className="flex items-center gap-1.5 text-[13px]">
                                    <Avatar name={row.person.name} color={row.person.color} image={row.person.avatar} size={22} />
                                    <span className="font-semibold">{row.person.name}</span>
                                    <span className="tabular-nums text-muted">{Math.round((row.totalPaid / total) * 100)}%</span>
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
                                const balance = planned.get(row.personId) ?? 0;
                                return (
                                    <li key={row.personId} className={clsx('flex flex-col gap-2 py-3', index < rows.length - 1 && 'border-b border-hair')}>
                                        <div className="flex items-center gap-3">
                                            <Avatar name={row.person.name} color={row.person.color} image={row.person.avatar} size={36} />
                                            <span className="flex min-w-0 flex-1 items-center gap-2">
                                                <span className="min-w-0 truncate text-[15px] font-semibold">{row.person.name}</span>
                                                {/* A guest's own row, so the pick is visible here too. */}
                                                {viewer.isGuest && viewer.selfIds.has(row.personId) && (
                                                    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.4px] text-accent">{t.you}</span>
                                                )}
                                            </span>
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
                                                <span className="block h-1.5 rounded-full" style={{ width: `${(row.totalPaid / maxValue) * 100}%`, background: row.person.color || stableColor(row.person.name) }} />
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
                                            <span className="truncate text-[15px] font-semibold">
                                                {localizeEventExpenseCategory(entry.name, language) !== entry.name || !entry.category
                                                    ? localizeEventExpenseCategory(entry.name, language)
                                                    : localizeCategoryName(entry.category, language)}
                                            </span>
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
                    viewer={viewer}
                    onMarkPaid={onMarkPaid}
                    hasSpending={spending.length > 0}
                    requestPurpose={eventName}
                />
            </section>
        </div>
    );
};
