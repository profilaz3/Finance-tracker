import React, { useMemo } from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { Person, SharedExpense, Currency, ExchangeRates } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { calculateEventSettlement } from '../domain/events';

interface EventDebtSummaryProps {
    expenses: SharedExpense[];
    people: Person[];
    baseCurrency: Currency;
    /** With rates, all currencies are netted into `baseCurrency`. */
    rates?: ExchangeRates;
    /** Id used for the current user in `expenses` (shown as "You" when not in `people`). */
    selfId?: string;
}

const SELF_FALLBACK_ID = 'self';
const FALLBACK_COLOR = '#9E9E9E';

export const EventDebtSummary: React.FC<EventDebtSummaryProps> = ({ expenses = [], people = [], baseCurrency, rates, selfId }) => {
    const debts = useMemo(
        () => calculateEventSettlement(expenses || [], { currency: baseCurrency, rates }),
        [expenses, baseCurrency, rates],
    );

    // Debts to participants that are not in `people` are still shown.
    const resolvePerson = (id: string): Pick<Person, 'name' | 'color' | 'avatar'> => {
        const person = people.find(p => p.id === id);
        if (person) return person;
        const isSelf = id === SELF_FALLBACK_ID || (!!selfId && id === selfId);
        return { name: isSelf ? 'You' : 'Unknown', color: FALLBACK_COLOR };
    };

    if (debts.length === 0) {
        return (
            <div className="text-center py-8 text-on-surface-variant bg-surface-container/50 rounded-xl border border-dashed border-outline/20">
                <Wallet size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No debts to settle yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider">Who Owes Who</h3>
            <div className="grid gap-2">
                {debts.map((debt, index) => {
                    const fromPerson = resolvePerson(debt.from);
                    const toPerson = resolvePerson(debt.to);

                    return (
                        <div key={`${debt.from}-${debt.to}-${debt.currency}-${index}`} className="flex items-center justify-between p-3 bg-surface-container rounded-xl border border-outline/10">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    {fromPerson.avatar ? (
                                        <img src={fromPerson.avatar} alt={fromPerson.name} className="w-6 h-6 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: fromPerson.color + '20', color: fromPerson.color }}>
                                            {fromPerson.name[0]}
                                        </div>
                                    )}
                                    <span className="text-sm font-medium text-on-surface">{fromPerson.name}</span>
                                </div>

                                <ArrowRight size={14} className="text-on-surface-variant" />

                                <div className="flex items-center gap-2">
                                    {toPerson.avatar ? (
                                        <img src={toPerson.avatar} alt={toPerson.name} className="w-6 h-6 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: toPerson.color + '20', color: toPerson.color }}>
                                            {toPerson.name[0]}
                                        </div>
                                    )}
                                    <span className="text-sm font-medium text-on-surface">{toPerson.name}</span>
                                </div>
                            </div>

                            <span className="font-bold text-primary">
                                {formatCurrency(debt.amount, debt.currency)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
