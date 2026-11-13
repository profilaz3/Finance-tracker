import React from 'react';
import { X, Check, Users, Divide, Calculator, Percent } from 'lucide-react';
import clsx from 'clsx';
import { IPaidSectionProps } from './types';

export const IPaidSection: React.FC<IPaidSectionProps> = ({
    splitMethod,
    setSplitMethod,
    shares,
    setShares,
    amount,
    fees,
    currency,
    people,
    language,
    t,
    togglePersonIncluded,
    updateShareAmount,
    updateSharePercentage,
    remainingAmount,
    remainingPercentage,
    includedCount,
    yourPortionPreview
}) => {
    const getPerson = (id: string) => people.find(p => p.id === id);

    return (
        <>
            {/* Split Method */}
            <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-2">
                    {t.splitMethod}
                </label>
                <div className="flex bg-surface-container rounded-xl p-1">
                    <button
                        type="button"
                        onClick={() => setSplitMethod('exact')}
                        className={clsx(
                            "flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5",
                            splitMethod === 'exact'
                                ? "bg-surface shadow-sm text-on-surface"
                                : "text-on-surface-variant hover:text-on-surface"
                        )}
                    >
                        <Calculator size={14} /> {t.splitExact}
                    </button>
                    <button
                        type="button"
                        onClick={() => setSplitMethod('equal')}
                        className={clsx(
                            "flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5",
                            splitMethod === 'equal'
                                ? "bg-surface shadow-sm text-on-surface"
                                : "text-on-surface-variant hover:text-on-surface"
                        )}
                    >
                        <Divide size={14} /> {t.equalSplit}
                    </button>
                    <button
                        type="button"
                        onClick={() => setSplitMethod('percentage')}
                        className={clsx(
                            "flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5",
                            splitMethod === 'percentage'
                                ? "bg-surface shadow-sm text-on-surface"
                                : "text-on-surface-variant hover:text-on-surface"
                        )}
                    >
                        <Percent size={14} /> %
                    </button>
                </div>
            </div>

            {/* Your Portion Preview */}
            {parseFloat(amount) > 0 && includedCount > 0 && (
                <div className="bg-tertiary/10 border border-tertiary/20 rounded-xl p-3 flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">
                        {t.myPortion}
                    </span>
                    <span className="font-bold text-tertiary">
                        {yourPortionPreview.toFixed(2)} {currency}
                    </span>
                </div>
            )}

            {/* People Selection */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-on-surface-variant">
                        {t.splitWith} ({includedCount})
                    </label>
                    {splitMethod === 'equal' && (
                        <button
                            type="button"
                            onClick={() => setShares(prev => prev.map(s => ({ ...s, isIncluded: true })))}
                            className="text-primary text-xs hover:underline"
                        >
                            {t.selectAll}
                        </button>
                    )}
                </div>

                {splitMethod === 'equal' ? (
                    // Equal split: toggle chips
                    <div className="flex flex-wrap gap-2">
                        {shares.map(share => {
                            const person = getPerson(share.personId);
                            if (!person) return null;
                            return (
                                <button
                                    key={share.personId}
                                    type="button"
                                    onClick={() => togglePersonIncluded(share.personId)}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                                        share.isIncluded
                                            ? "bg-secondary/10 text-secondary border-secondary/20"
                                            : "bg-surface-container text-on-surface-variant border-transparent hover:bg-surface-container-high opacity-60"
                                    )}
                                >
                                    {person.avatar ? (
                                        <img src={person.avatar} alt="" aria-hidden="true" className="w-5 h-5 rounded-full object-cover" />
                                    ) : (
                                        <div
                                            aria-hidden="true"
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                            style={{ backgroundColor: person.color + '20', color: person.color }}
                                        >
                                            {person.name[0]}
                                        </div>
                                    )}
                                    {person.name}
                                    {share.isIncluded && (
                                        <>
                                            <Check size={14} />
                                            <span className="text-xs opacity-70">
                                                {share.amount.toFixed(2)}
                                            </span>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    // Exact or Percentage: input fields
                    <div className="space-y-3">
                        {shares.filter(s => s.isIncluded).map(share => {
                            const person = getPerson(share.personId);
                            if (!person) return null;
                            return (
                                <div key={share.personId} className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 w-1/3">
                                        {person.avatar ? (
                                            <img src={person.avatar} alt="" aria-hidden="true" className="w-6 h-6 rounded-full object-cover" />
                                        ) : (
                                            <div
                                                aria-hidden="true"
                                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                                                style={{ backgroundColor: person.color + '20', color: person.color }}
                                            >
                                                {person.name[0]}
                                            </div>
                                        )}
                                        <span className="text-sm font-medium truncate">{person.name}</span>
                                    </div>
                                    <div className="flex-1 relative">
                                        <input
                                            type="number"
                                            value={splitMethod === 'percentage' ? (share.percentage || '') : (share.amount || '')}
                                            onChange={(e) =>
                                                splitMethod === 'percentage'
                                                    ? updateSharePercentage(share.personId, e.target.value)
                                                    : updateShareAmount(share.personId, e.target.value)
                                            }
                                            placeholder="0"
                                            className="w-full px-3 py-2 bg-surface-container rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-sm"
                                            step={splitMethod === 'percentage' ? '1' : '0.01'}
                                            onFocus={(e) => e.target.select()}
                                        />
                                        {splitMethod === 'percentage' && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">%</span>
                                        )}
                                    </div>
                                    {splitMethod === 'percentage' && (
                                        <span className="text-xs text-on-surface-variant w-16 text-right">
                                            = {share.amount.toFixed(2)}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => togglePersonIncluded(share.personId)}
                                        className="p-2 hover:bg-error-container hover:text-on-error-container rounded-full text-on-surface-variant transition-colors"
                                        title={t.remove}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            );
                        })}

                        {/* Add more people */}
                        {shares.some(s => !s.isIncluded) && (
                            <div className="mt-2 pt-2 border-t border-outline/10">
                                <p className="text-xs text-on-surface-variant mb-2">
                                    {t.addPersonToSplit}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {shares.filter(s => !s.isIncluded).map(share => {
                                        const person = getPerson(share.personId);
                                        if (!person) return null;
                                        return (
                                            <button
                                                key={share.personId}
                                                type="button"
                                                onClick={() => togglePersonIncluded(share.personId)}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-full text-xs font-medium transition-colors"
                                            >
                                                <Users size={12} />
                                                {person.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Remaining indicator / Your portion */}
                        {/* Remaining indicator / Your portion */}
                        <div className={clsx(
                            "flex justify-between items-center px-3 py-2 rounded-lg text-sm",
                            splitMethod === 'exact'
                                ? (remainingAmount >= 0 ? "bg-tertiary/10 text-tertiary" : "bg-error/10 text-error")
                                : (Math.abs(remainingPercentage) < 0.01 ? "bg-tertiary/10 text-tertiary" : "bg-error/10 text-error")
                        )}>
                            <span>
                                {splitMethod === 'exact' && remainingAmount >= 0
                                    ? t.myPortion
                                    : t.remaining
                                }:
                            </span>
                            <span className="font-medium">
                                {splitMethod === 'percentage'
                                    ? `${remainingPercentage.toFixed(1)}%`
                                    : `${remainingAmount.toFixed(2)} ${currency}`
                                }
                            </span>
                        </div>

                    </div>
                )}
            </div>
        </>
    );
};
