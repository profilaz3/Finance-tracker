import React, { useMemo } from 'react';
import { Person, SharedExpense, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../utils/currencyUtils';
import { EXPENSE_CATEGORY_COLORS } from '../constants/expenseCategories';

interface PersonCategoryBreakdownProps {
    person: Person;
    expenses: SharedExpense[];
    currency: Currency;
    rates: ExchangeRates;
}

export const PersonCategoryBreakdown: React.FC<PersonCategoryBreakdownProps> = ({
    person,
    expenses,
    currency,
    rates
}) => {
    const categoryData = useMemo(() => {
        const categories: Record<string, number> = {};
        let totalSpent = 0;

        expenses.forEach(expense => {
            // Only count if this person is in the split
            if (!expense.sharedWith.includes(person.id)) return;

            // Calculate this person's share
            let shareAmount = 0;
            if (expense.splitType === 'exact' && expense.splitDetails) {
                shareAmount = expense.splitDetails[person.id] || 0;
            } else {
                // Equal split
                shareAmount = expense.amount / expense.sharedWith.length;
            }

            // Convert to target currency
            const shareInCurrency = convertCurrency(shareAmount, expense.currency, currency, rates.rates);

            const cat = expense.category || 'Activities';
            if (!categories[cat]) categories[cat] = 0;
            categories[cat] += shareInCurrency;
            totalSpent += shareInCurrency;
        });

        // Convert to sorted array
        const sortedCategories = Object.entries(categories)
            .map(([name, amount]) => ({
                name,
                amount,
                percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
                color: EXPENSE_CATEGORY_COLORS[name] || '#888888'
            }))
            .sort((a, b) => b.amount - a.amount);

        return { categories: sortedCategories, totalSpent };
    }, [person.id, expenses, currency, rates]);

    if (categoryData.totalSpent === 0) {
        return null;
    }

    return (
        <div className="bg-surface-container-low rounded-xl p-4 border border-outline/10">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                {person.avatar ? (
                    <img src={person.avatar} alt={person.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: person.color + '20', color: person.color }}
                    >
                        {person.name[0]}
                    </div>
                )}
                <div className="flex-1">
                    <p className="font-semibold text-on-surface text-sm">{person.name}</p>
                    <p className="text-xs text-on-surface-variant">
                        Total: {formatCurrency(categoryData.totalSpent, currency)}
                    </p>
                </div>
            </div>

            {/* Category bars */}
            <div className="space-y-2">
                {categoryData.categories.map(cat => (
                    <div key={cat.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-on-surface-variant">{cat.name}</span>
                            <span className="font-medium text-on-surface">
                                {formatCurrency(cat.amount, currency)}
                            </span>
                        </div>
                        <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                    width: `${cat.percentage}%`,
                                    backgroundColor: cat.color
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
