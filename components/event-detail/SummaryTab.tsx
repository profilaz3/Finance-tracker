import React from 'react';
import { motion } from 'framer-motion';
import { AppState, SharedExpense, Person, Currency } from '../../types';
import { PersonStatsRing } from '../PersonStatsRing';
import { PersonStatCard } from '../PersonStatCard';
import { CategoryBreakdownChart } from '../CategoryBreakdownChart';
import { PersonCategoryBreakdown } from '../PersonCategoryBreakdown';
import { EventDebtSummary } from '../EventDebtSummary';
import clsx from 'clsx';
import { calculateEventPersonTotals } from '../../utils/eventSummarySelectors';

interface SummaryTabProps {
    eventPeople: Person[];
    allExpensesForSummary: SharedExpense[];
    summaryCurrency: Currency;
    setSummaryCurrency: (currency: Currency) => void;
    state: AppState;
}

export const SummaryTab: React.FC<SummaryTabProps> = ({
    eventPeople,
    allExpensesForSummary,
    summaryCurrency,
    setSummaryCurrency,
    state,
}) => {
    const personTotals = calculateEventPersonTotals({
        people: eventPeople,
        expenses: allExpensesForSummary,
        summaryCurrency,
        rates: state.rates.rates,
    });

    return (
        <motion.div
            key="summary"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
        >
            <div className="bg-surface-container-low rounded-2xl border border-outline/10 overflow-hidden">
                <div className="p-4 border-b border-outline/10">
                    <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider">Spending Breakdown</h3>
                </div>
                <PersonStatsRing
                    people={eventPeople}
                    expenses={allExpensesForSummary}
                    baseCurrency={summaryCurrency}
                    rates={state.rates}
                />
            </div>

            {eventPeople.length > 0 && allExpensesForSummary.length > 0 && (
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider px-1">
                            Individual Stats
                        </h3>
                        <div className="space-y-3">
                            {personTotals.map(summary => {
                                const person = eventPeople.find(entry => entry.id === summary.personId);
                                if (!person) {
                                    return null;
                                }

                                return (
                                    <PersonStatCard
                                        key={person.id}
                                        person={person}
                                        totalPaid={summary.totalPaid}
                                        totalOwed={summary.totalOwed}
                                        currency={summaryCurrency}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider px-1">
                            By Category
                        </h3>
                        <div className="bg-surface-container-low p-5 rounded-2xl border border-outline/10">
                            <CategoryBreakdownChart
                                expenses={allExpensesForSummary}
                                currency={summaryCurrency}
                                rates={state.rates}
                            />
                        </div>
                    </div>
                </div>
            )}

            {eventPeople.length > 0 && allExpensesForSummary.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider px-1">
                        Categories by Person
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        {eventPeople.map(person => (
                            <PersonCategoryBreakdown
                                key={person.id}
                                person={person}
                                expenses={allExpensesForSummary}
                                currency={summaryCurrency}
                                rates={state.rates}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider px-1">
                    Settlement
                </h3>
                <EventDebtSummary
                    expenses={allExpensesForSummary}
                    people={eventPeople}
                    baseCurrency={state.baseCurrency}
                />
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider px-1">
                    Display Currency
                </h3>
                <div className="bg-surface-container-low rounded-xl p-4 border border-outline/10">
                    <p className="text-xs text-on-surface-variant mb-3">Choose currency for summary calculations above</p>
                    <div className="flex gap-2">
                        {(['EUR', 'USD', 'RSD'] as Currency[]).map(c => (
                            <button
                                key={c}
                                onClick={() => setSummaryCurrency(c)}
                                className={clsx(
                                    "flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                                    summaryCurrency === c
                                        ? "bg-primary text-on-primary"
                                        : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                                )}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
