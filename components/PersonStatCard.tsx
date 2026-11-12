import React from 'react';
import { Person, Currency } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PersonStatCardProps {
    person: Person;
    totalPaid: number;
    totalOwed: number;
    currency: Currency;
}

export const PersonStatCard: React.FC<PersonStatCardProps> = ({ person, totalPaid, totalOwed, currency }) => {
    const balance = totalPaid - totalOwed;
    const isPositive = balance > 0.01;
    const isNegative = balance < -0.01;
    const isNeutral = Math.abs(balance) <= 0.01;

    return (
        <div className="bg-surface-container-low rounded-xl p-4 border border-outline/10">
            <div className="flex items-center gap-3 mb-3">
                {person.avatar ? (
                    <img src={person.avatar} alt={person.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: person.color + '20', color: person.color }}
                    >
                        {person.name[0]}
                    </div>
                )}
                <div className="flex-1">
                    <p className="font-semibold text-on-surface">{person.name}</p>
                    <p className="text-xs text-on-surface-variant">
                        {isPositive && 'Is owed'}
                        {isNegative && 'Owes'}
                        {isNeutral && 'Settled'}
                    </p>
                </div>
                {!isNeutral && (
                    <div className={`flex items-center gap-1 ${isPositive ? 'text-tertiary' : 'text-error'}`}>
                        {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        <span className="font-bold text-sm">{formatCurrency(Math.abs(balance), currency)}</span>
                    </div>
                )}
                {isNeutral && (
                    <div className="flex items-center gap-1 text-on-surface-variant">
                        <Minus size={16} />
                        <span className="font-medium text-sm">Even</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-surface-container rounded-lg p-2">
                    <p className="text-xs text-on-surface-variant mb-1">Paid</p>
                    <p className="text-sm font-semibold text-on-surface">{formatCurrency(totalPaid, currency)}</p>
                </div>
                <div className="bg-surface-container rounded-lg p-2">
                    <p className="text-xs text-on-surface-variant mb-1">Spent</p>
                    <p className="text-sm font-semibold text-on-surface">{formatCurrency(totalOwed, currency)}</p>
                </div>
                <div className={`bg-surface-container rounded-lg p-2 ${isPositive ? 'ring-1 ring-tertiary/20' : isNegative ? 'ring-1 ring-error/20' : ''}`}>
                    <p className="text-xs text-on-surface-variant mb-1">Balance</p>
                    <p className={`text-sm font-bold ${isPositive ? 'text-tertiary' : isNegative ? 'text-error' : 'text-on-surface'}`}>
                        {formatCurrency(balance, currency)}
                    </p>
                </div>
            </div>
        </div>
    );
};
