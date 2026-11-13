import React, { useMemo } from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { Person, SharedExpense, Currency, EventDebt } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { getTranslations } from '../utils/i18n';

interface EventDebtSummaryProps {
    expenses: SharedExpense[];
    people: Person[];
    baseCurrency: Currency;
}

export const EventDebtSummary: React.FC<EventDebtSummaryProps> = ({ expenses = [], people = [], baseCurrency }) => {
    const t = getTranslations();
    const debts = useMemo(() => {
        if (!expenses || !people) return [];
        // 1. Calculate net balances per person per currency
        const balances: Record<string, Record<string, number>> = {};

        expenses.forEach(expense => {
            const { paidBy, amount, currency, sharedWith, splitType, splitDetails } = expense;
            if (!sharedWith || sharedWith.length === 0) return;

            // Payer paid +amount
            if (!balances[paidBy]) balances[paidBy] = {};
            if (!balances[paidBy][currency]) balances[paidBy][currency] = 0;
            balances[paidBy][currency] += amount;

            // Calculate consumption (negative balance)
            if (splitType === 'exact' && splitDetails) {
                // Exact split
                sharedWith.forEach(personId => {
                    const personAmount = splitDetails[personId] || 0;
                    if (!balances[personId]) balances[personId] = {};
                    if (!balances[personId][currency]) balances[personId][currency] = 0;
                    balances[personId][currency] -= personAmount;
                });
            } else {
                // Equal split (default)
                const splitAmount = amount / sharedWith.length;
                sharedWith.forEach(personId => {
                    if (!balances[personId]) balances[personId] = {};
                    if (!balances[personId][currency]) balances[personId][currency] = 0;
                    balances[personId][currency] -= splitAmount;
                });
            }
        });

        // 2. Resolve debts
        const calculatedDebts: EventDebt[] = [];

        // Process each currency separately
        const currencies = new Set<string>();
        Object.values(balances).forEach(b => Object.keys(b).forEach(c => currencies.add(c)));

        currencies.forEach(currency => {
            let debtors: { id: string; amount: number }[] = [];
            let creditors: { id: string; amount: number }[] = [];

            Object.entries(balances).forEach(([personId, curBalances]) => {
                const balance = curBalances[currency] || 0;
                // Round to 2 decimals to avoid floating point issues
                const roundedBalance = Math.round(balance * 100) / 100;

                if (roundedBalance < -0.01) {
                    debtors.push({ id: personId, amount: -roundedBalance });
                } else if (roundedBalance > 0.01) {
                    creditors.push({ id: personId, amount: roundedBalance });
                }
            });

            // Match debtors to creditors
            // Simple greedy approach
            let i = 0; // debtor index
            let j = 0; // creditor index

            while (i < debtors.length && j < creditors.length) {
                const debtor = debtors[i];
                const creditor = creditors[j];

                const amount = Math.min(debtor.amount, creditor.amount);

                if (amount > 0) {
                    calculatedDebts.push({
                        from: debtor.id,
                        to: creditor.id,
                        amount,
                        currency: currency as Currency
                    });
                }

                debtor.amount -= amount;
                creditor.amount -= amount;

                if (debtor.amount < 0.01) i++;
                if (creditor.amount < 0.01) j++;
            }
        });

        return calculatedDebts;
    }, [expenses]);

    if (debts.length === 0) {
        return (
            <div className="text-center py-8 text-on-surface-variant bg-surface-container/50 rounded-xl border border-dashed border-outline/20">
                <Wallet size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t.noDebtsToSettle}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider">{t.whoOwesWho}</h3>
            <div className="grid gap-2">
                {debts.map((debt, index) => {
                    const fromPerson = people.find(p => p.id === debt.from);
                    const toPerson = people.find(p => p.id === debt.to);

                    if (!fromPerson || !toPerson) return null;

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
