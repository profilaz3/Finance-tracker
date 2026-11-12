import React, { useMemo } from 'react';
import { SharedExpense, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../utils/currencyUtils';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_COLORS } from '../constants/expenseCategories';

interface CategoryBreakdownChartProps {
    expenses: SharedExpense[];
    currency: Currency;
    rates: ExchangeRates;
}

export const CategoryBreakdownChart: React.FC<CategoryBreakdownChartProps> = ({ expenses, currency, rates }) => {
    const categoryTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        let grandTotal = 0;

        // Convert all expenses to target currency
        expenses.forEach(expense => {
            const cat = expense.category || 'Activities';
            const amountInCurrency = convertCurrency(expense.amount, expense.currency, currency, rates.rates);

            if (!totals[cat]) {
                totals[cat] = 0;
            }
            totals[cat] += amountInCurrency;
            grandTotal += amountInCurrency;
        });

        // Convert to array and sort by amount
        const categories = EXPENSE_CATEGORIES.map(cat => ({
            name: cat,
            total: totals[cat] || 0,
            percentage: grandTotal > 0 ? (totals[cat] || 0) / grandTotal * 100 : 0,
            color: EXPENSE_CATEGORY_COLORS[cat]
        })).filter(c => c.total > 0)
            .sort((a, b) => b.total - a.total);

        return categories;
    }, [expenses, currency, rates]);

    if (categoryTotals.length === 0) {
        return (
            <div className="text-center py-4 text-on-surface-variant text-sm">
                No expenses to categorize
            </div>
        );
    }

    const maxTotal = Math.max(...categoryTotals.map(c => c.total));

    return (
        <div className="space-y-3">
            {categoryTotals.map(category => (
                <div key={category.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-on-surface">{category.name}</span>
                        <span className="font-bold text-on-surface">
                            {formatCurrency(category.total, currency)}
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div className="relative h-2 bg-surface-container rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                                width: `${(category.total / maxTotal) * 100}%`,
                                backgroundColor: category.color
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};
