import React from 'react';
import { X, Check, Plus, Divide, Calculator, Percent } from 'lucide-react';
import clsx from 'clsx';
import { IPaidSectionProps } from './types';
import { formatMoney } from '../../utils/locale';
import { formatSplitPercent } from './format';
import { Segmented } from '../ui/Segmented';
import { Avatar } from '../home/parts';
import { AmountInput } from '../ui/AmountInput';
import { FieldError } from './CommonFields';
import type { SplitMethod } from '../../types';

const label = 'block px-1 text-[13px] font-semibold text-muted';

export const IPaidSection: React.FC<IPaidSectionProps> = ({
    splitMethod,
    setSplitMethod,
    shares,
    totalToSplit,
    currency,
    people,
    language,
    t,
    togglePersonIncluded,
    updateShareAmount,
    updateSharePercentage,
    invalidShares,
    remainingAmount,
    remainingPercentage,
    includedCount,
    yourPortionPreview
}) => {
    const getPerson = (id: string) => people.find(p => p.id === id);
    // My share is what the others leave (of the total, or of 100%), so anything from zero up is fine.
    const balanced = splitMethod === 'exact'
        ? remainingAmount >= -0.005
        : remainingPercentage >= -0.005;
    const money = (value: number) => formatMoney(value, currency, language);

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

            {/* My portion in an equal split (exact and percentage splits show it under the list) */}
            {splitMethod === 'equal' && totalToSplit > 0 && includedCount > 0 && (
                <div className="flex items-center justify-between rounded-[18px] bg-accent-soft px-4 py-3">
                    <span className="text-[14px] font-semibold text-muted">
                        {t.myPortion}
                    </span>
                    <span className="text-[17px] font-bold tabular-nums text-accent">
                        {money(Math.max(0, yourPortionPreview))}
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
                            className="h-10 rounded-full px-3 text-[13px] font-semibold text-accent hover:bg-accent-soft"
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
                                                {money(share.amount)}
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
                                    const invalid = !!invalidShares[share.personId];
                                    const errorId = `split-share-${share.personId}-error`;
                                    const isPercent = splitMethod === 'percentage';
                                    return (
                                        <div key={share.personId} className="py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                                <span className="flex min-w-0 flex-1 flex-col">
                                                    <span className="truncate text-[15px] font-semibold">{person.name}</span>
                                                    {isPercent && (
                                                        <span className="truncate text-[12px] tabular-nums text-muted">{money(share.amount)}</span>
                                                    )}
                                                </span>
                                                <div className={clsx('relative shrink-0', isPercent ? 'w-[84px]' : 'w-[104px]')}>
                                                    <AmountInput
                                                        language={language}
                                                        aria-label={isPercent ? `${person.name} %` : `${person.name} ${currency}`}
                                                        value={isPercent ? share.percentage : share.amount}
                                                        emptyWhenZero
                                                        onValueChange={(value, text) =>
                                                            isPercent
                                                                ? updateSharePercentage(share.personId, value, text)
                                                                : updateShareAmount(share.personId, value, text)
                                                        }
                                                        placeholder="0"
                                                        aria-invalid={invalid}
                                                        aria-describedby={invalid ? errorId : undefined}
                                                        className={clsx(
                                                            'h-10 w-full rounded-[12px] border-none bg-chip pl-3 text-right text-[15px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint focus:ring-2',
                                                            isPercent ? 'pr-7' : 'pr-3',
                                                            invalid ? 'ring-2 ring-neg focus:ring-neg' : 'focus:ring-accent'
                                                        )}
                                                    />
                                                    {isPercent && (
                                                        <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-muted">%</span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => togglePersonIncluded(share.personId)}
                                                    aria-label={`${t.remove} ${person.name}`}
                                                    title={t.remove}
                                                    className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-neg/10 hover:text-neg"
                                                >
                                                    <X size={16} aria-hidden="true" />
                                                </button>
                                            </div>
                                            <FieldError id={errorId} message={invalid ? (isPercent ? t.splitPercentInvalid : t.splitErrorInvalidAmount) : null} />
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
                                                className="flex h-10 items-center gap-1.5 rounded-full bg-chip pl-1 pr-3 text-[13px] font-semibold text-muted transition-colors hover:text-on-surface"
                                            >
                                                <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                                {person.name}
                                                <Plus size={13} aria-hidden="true" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* My share: what is left of the total (exact) or of 100% (percentage). */}
                        <div
                            className={clsx(
                                'flex items-center justify-between gap-3 rounded-[16px] px-4 py-2.5 text-[14px]',
                                balanced ? 'bg-pos/10 text-pos' : 'bg-neg/10 text-neg'
                            )}
                            aria-live="polite"
                        >
                            {balanced ? (
                                <>
                                    <span className="font-semibold">{t.myPortion}</span>
                                    <span className="text-right font-bold tabular-nums">
                                        {splitMethod === 'percentage'
                                            ? `${formatSplitPercent(Math.max(0, remainingPercentage), language)} · ${money(Math.max(0, remainingAmount))}`
                                            : money(Math.max(0, remainingAmount))}
                                    </span>
                                </>
                            ) : (
                                <span className="font-semibold">
                                    {splitMethod === 'percentage'
                                        ? t.splitPercentOver.replace('{percent}', formatSplitPercent(-remainingPercentage, language))
                                        : t.splitSharesOverTotal.replace('{amount}', money(-remainingAmount))}
                                </span>
                            )}
                        </div>
                        {splitMethod === 'percentage' && (
                            <p className="px-1 text-[12px] text-muted">{t.splitPercentHint}</p>
                        )}

                    </div>
                )}
            </div>
        </>
    );
};
