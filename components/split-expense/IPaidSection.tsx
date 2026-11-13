import React from 'react';
import { X, Check, Plus, Divide, Calculator, Percent } from 'lucide-react';
import clsx from 'clsx';
import { IPaidSectionProps } from './types';
import { formatPercent, formatDecimal } from '../../utils/locale';
import { Segmented } from '../ui/Segmented';
import { Avatar } from '../home/parts';
import type { SplitMethod } from '../../types';

const label = 'block px-1 text-[13px] font-semibold text-muted';

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
    const balanced = splitMethod === 'exact'
        ? remainingAmount >= 0
        : Math.abs(remainingPercentage) < 0.01;

    return (
        <>
            {/* Split Method */}
            <div>
                <p className={clsx(label, 'mb-1.5')}>{t.splitMethod}</p>
                <Segmented<SplitMethod>
                    ariaLabel={t.splitMethod}
                    value={splitMethod}
                    onChange={setSplitMethod}
                    options={[
                        {
                            value: 'exact',
                            label: (
                                <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    <Calculator size={14} aria-hidden="true" /> {t.splitExact}
                                </span>
                            ),
                        },
                        {
                            value: 'equal',
                            label: (
                                <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    <Divide size={14} aria-hidden="true" /> {t.equalSplit}
                                </span>
                            ),
                        },
                        {
                            value: 'percentage',
                            label: (
                                <span className="flex items-center justify-center gap-1.5">
                                    <Percent size={14} aria-hidden="true" />
                                    <span className="sr-only">%</span>
                                </span>
                            ),
                        },
                    ]}
                />
            </div>

            {/* Your Portion Preview */}
            {parseFloat(amount) > 0 && includedCount > 0 && (
                <div className="flex items-center justify-between rounded-[18px] bg-accent-soft px-4 py-3">
                    <span className="text-[14px] font-semibold text-muted">
                        {t.myPortion}
                    </span>
                    <span className="text-[17px] font-bold tabular-nums text-accent">
                        {formatDecimal(yourPortionPreview)} {currency}
                    </span>
                </div>
            )}

            {/* People Selection */}
            <div>
                <div className="mb-1.5 flex items-center justify-between">
                    <p className={label}>
                        {t.splitWith} ({includedCount})
                    </p>
                    {splitMethod === 'equal' && (
                        <button
                            type="button"
                            // Toggle through the parent so each share is recalculated, not left at 0.
                            onClick={() => shares.filter(s => !s.isIncluded).forEach(s => togglePersonIncluded(s.personId))}
                            className="h-8 rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
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
                                    aria-pressed={share.isIncluded}
                                    onClick={() => togglePersonIncluded(share.personId)}
                                    className={clsx(
                                        'flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-[14px] font-semibold transition-colors',
                                        share.isIncluded
                                            ? 'bg-accent-soft text-accent ring-1 ring-accent/30'
                                            : 'bg-chip text-muted'
                                    )}
                                >
                                    <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                    {person.name}
                                    {share.isIncluded && (
                                        <>
                                            <Check size={14} aria-hidden="true" />
                                            <span className="text-[12px] tabular-nums opacity-80">
                                                {formatDecimal(share.amount)}
                                            </span>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    // Exact or Percentage: input fields
                    <div className="space-y-2">
                        {shares.some(s => s.isIncluded) && (
                            <div className="paper-tile divide-y divide-hair px-3">
                                {shares.filter(s => s.isIncluded).map(share => {
                                    const person = getPerson(share.personId);
                                    if (!person) return null;
                                    return (
                                        <div key={share.personId} className="flex items-center gap-2.5 py-2.5">
                                            <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{person.name}</span>
                                            <div className="relative w-[96px] shrink-0">
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    aria-label={person.name}
                                                    value={splitMethod === 'percentage' ? (share.percentage || '') : (share.amount || '')}
                                                    onChange={(e) =>
                                                        splitMethod === 'percentage'
                                                            ? updateSharePercentage(share.personId, e.target.value)
                                                            : updateShareAmount(share.personId, e.target.value)
                                                    }
                                                    placeholder="0"
                                                    className={clsx(
                                                        'h-10 w-full rounded-[12px] border-none bg-chip pl-3 text-right text-[15px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent',
                                                        splitMethod === 'percentage' ? 'pr-7' : 'pr-3'
                                                    )}
                                                    step={splitMethod === 'percentage' ? '1' : '0.01'}
                                                    onFocus={(e) => e.target.select()}
                                                />
                                                {splitMethod === 'percentage' && (
                                                    <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-muted">%</span>
                                                )}
                                            </div>
                                            {splitMethod === 'percentage' && (
                                                <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-muted">
                                                    = {formatDecimal(share.amount)}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => togglePersonIncluded(share.personId)}
                                                aria-label={`${t.remove} ${person.name}`}
                                                title={t.remove}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-neg/10 hover:text-neg"
                                            >
                                                <X size={16} aria-hidden="true" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Add more people */}
                        {shares.some(s => !s.isIncluded) && (
                            <div className="pt-1">
                                <p className="mb-1.5 px-1 text-[12px] font-semibold text-faint">
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
                                                className="flex h-9 items-center gap-1.5 rounded-full bg-chip pl-1 pr-3 text-[13px] font-semibold text-muted transition-colors hover:text-on-surface"
                                            >
                                                <Avatar name={person.name} color={person.color} image={person.avatar} size={28} />
                                                {person.name}
                                                <Plus size={13} aria-hidden="true" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Remaining indicator / Your portion */}
                        <div className={clsx(
                            'flex items-center justify-between rounded-[16px] px-4 py-2.5 text-[14px]',
                            balanced ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg'
                        )}>
                            <span className="font-semibold">
                                {splitMethod === 'exact' && remainingAmount >= 0
                                    ? t.myPortion
                                    : t.remaining
                                }
                            </span>
                            <span className="font-bold tabular-nums">
                                {splitMethod === 'percentage'
                                    ? formatPercent(remainingPercentage, 1)
                                    : `${formatDecimal(remainingAmount)} ${currency}`
                                }
                            </span>
                        </div>

                    </div>
                )}
            </div>
        </>
    );
};
