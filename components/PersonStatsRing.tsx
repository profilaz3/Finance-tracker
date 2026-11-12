import React, { useMemo } from 'react';
import { Person, SharedExpense, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../utils/currencyUtils';

interface PersonStatsRingProps {
    people: Person[];
    expenses: SharedExpense[];
    baseCurrency: Currency;
    rates: ExchangeRates;
}

interface PersonStat {
    personId: string;
    totalSpent: number;
    percentage: number;
}

export const PersonStatsRing: React.FC<PersonStatsRingProps> = ({ people, expenses, baseCurrency, rates }) => {
    const stats = useMemo(() => {
        // Calculate total spent (share) by each person
        const personTotals: Record<string, number> = {};
        let grandTotal = 0;

        expenses.forEach(expense => {
            // Convert expense amount to base currency first
            const amountInBase = convertCurrency(expense.amount, expense.currency, baseCurrency, rates.rates);

            // Calculate split
            if (expense.splitType === 'exact' && expense.splitDetails) {
                Object.entries(expense.splitDetails).forEach(([personId, amount]) => {
                    // For exact split, the amounts in splitDetails are in the expense currency
                    // So we need to convert each share
                    const shareInBase = convertCurrency(amount, expense.currency, baseCurrency, rates.rates);

                    if (!personTotals[personId]) personTotals[personId] = 0;
                    personTotals[personId] += shareInBase;
                    grandTotal += shareInBase;
                });
            } else {
                // Equal split
                const shareAmount = amountInBase / expense.sharedWith.length;
                expense.sharedWith.forEach(personId => {
                    if (!personTotals[personId]) personTotals[personId] = 0;
                    personTotals[personId] += shareAmount;
                    grandTotal += shareAmount;
                });
            }
        });

        // Calculate percentages
        const personStats: PersonStat[] = Object.entries(personTotals).map(([personId, total]) => ({
            personId,
            totalSpent: total,
            percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0
        }));

        return { personStats, grandTotal, displayCurrency: baseCurrency };
    }, [expenses, baseCurrency, rates]);

    if (stats.grandTotal === 0 || stats.personStats.length === 0) {
        return (
            <div className="flex items-center justify-center p-8">
                <p className="text-on-surface-variant text-sm">No expenses recorded yet</p>
            </div>
        );
    }

    // SVG ring parameters
    const size = 200;
    const strokeWidth = 24;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    // Calculate arc segments for each person
    let currentOffset = 0;
    const segments = stats.personStats.map(stat => {
        const person = people.find(p => p.id === stat.personId);
        const segmentLength = (stat.percentage / 100) * circumference;
        const segment = {
            person,
            stat,
            offset: currentOffset,
            length: segmentLength
        };
        currentOffset += segmentLength;
        return segment;
    });

    return (
        <div className="flex flex-col items-center justify-center p-6">
            {/* Ring Chart */}
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="transform -rotate-90">
                    {/* Background circle */}
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        className="text-surface-container opacity-30"
                    />

                    {/* Person segments */}
                    {segments.map((segment, index) => (
                        <circle
                            key={segment.person?.id || index}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke={segment.person?.color || '#888888'}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                            strokeDashoffset={-segment.offset}
                            strokeLinecap="round"
                            className="transition-all duration-300"
                        />
                    ))}
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-sm text-on-surface-variant uppercase tracking-wider mb-1">{stats.displayCurrency}</p>
                    <p className="text-4xl font-bold text-on-surface">
                        {Math.round(stats.grandTotal).toLocaleString()}
                    </p>
                    <p className="text-sm text-on-surface-variant uppercase tracking-wider">Total Spent</p>
                </div>
            </div>

            {/* Legend */}
            <div className="mt-6 w-full max-w-xs space-y-2">
                {segments.map((segment, index) => (
                    <div key={segment.person?.id || index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: segment.person?.color || '#888888' }}
                            />
                            <span className="text-on-surface font-medium">
                                {segment.person?.name || 'Unknown'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-on-surface-variant">
                                {formatCurrency(segment.stat.totalSpent, stats.displayCurrency as Currency)}
                            </span>
                            <span className="text-on-surface-variant text-xs">
                                ({segment.stat.percentage.toFixed(0)}%)
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
