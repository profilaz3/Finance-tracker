import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { CURRENCIES } from '../../constants';
import { Currency } from '../../types';
import { CommonFieldsProps } from './types';
import { CategoryGlyph } from '../ui/CategoryGlyph';

const label = 'mb-1.5 block px-1 text-[13px] font-semibold text-muted';
const field = 'h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent';
const select = `${field} appearance-none pr-10`;

const SelectChevron = () => (
    <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
);

const stripLeadingZeros = (val: string) =>
    val.length > 1 && val.startsWith('0') && !val.includes('.') ? val.replace(/^0+/, '') : val;

export const CommonFields: React.FC<CommonFieldsProps> = ({
    mode,
    amount,
    setAmount,
    currency,
    setCurrency,
    transactionDate,
    setTransactionDate,
    fees,
    setFees,
    note,
    setNote,
    categoryId,
    setCategoryId,
    accountId,
    setAccountId,
    categories,
    accounts,
    language,
    t
}) => {
    const id = useId();
    const expenseCategories = categories.filter(c => c.type === 'expense');
    const selectedCategory = expenseCategories.find(c => c.id === categoryId);

    return (
        <>
            {/* Amount and currency */}
            <div className="flex gap-2">
                {mode === 'i_paid' && (
                    <div className="min-w-0 flex-1">
                        <label htmlFor={`${id}-amount`} className={label}>
                            {t.total}
                        </label>
                        <input
                            id={`${id}-amount`}
                            type="number"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(stripLeadingZeros(e.target.value))}
                            placeholder="0.00"
                            className="h-14 w-full rounded-[16px] border-none bg-chip px-4 text-[24px] font-semibold tabular-nums tracking-tight text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                            autoFocus
                            step="0.01"
                            onFocus={(e) => e.target.select()}
                        />
                    </div>
                )}

                <div className={mode === 'i_paid' ? 'w-[104px] shrink-0' : 'w-full'}>
                    <label htmlFor={`${id}-currency`} className={label}>
                        {t.currency}
                    </label>
                    <div className="relative">
                        <select
                            id={`${id}-currency`}
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value as Currency)}
                            className={`${select} ${mode === 'i_paid' ? 'h-14 font-semibold' : 'font-semibold'}`}
                        >
                            {CURRENCIES.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <SelectChevron />
                    </div>
                </div>
            </div>

            {/* Date & Time - Only for I Paid mode */}
            {mode === 'i_paid' && (
                <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                        <label htmlFor={`${id}-date`} className={label}>{t.date}</label>
                        <input
                            id={`${id}-date`}
                            type="date"
                            value={(() => {
                                const date = new Date(transactionDate);
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                return `${year}-${month}-${day}`;
                            })()}
                            onChange={(e) => {
                                const [year, month, day] = e.target.value.split('-');
                                const current = new Date(transactionDate);
                                const newDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
                                newDate.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                setTransactionDate(newDate.toISOString());
                            }}
                            className={field}
                        />
                    </div>
                    <div className="w-[118px] shrink-0">
                        <label htmlFor={`${id}-time`} className={label}>{t.time}</label>
                        <input
                            id={`${id}-time`}
                            type="time"
                            value={(() => {
                                const date = new Date(transactionDate);
                                const hours = String(date.getHours()).padStart(2, '0');
                                const minutes = String(date.getMinutes()).padStart(2, '0');
                                return `${hours}:${minutes}`;
                            })()}
                            onChange={(e) => {
                                const current = new Date(transactionDate);
                                const [hours, minutes] = e.target.value.split(':');
                                current.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
                                setTransactionDate(current.toISOString());
                            }}
                            className={field}
                        />
                    </div>
                </div>
            )}

            {/* Fees - Only for I Paid mode */}
            {mode === 'i_paid' && (
                <div>
                    <label htmlFor={`${id}-fees`} className={label}>{t.feesUsd}</label>
                    <input
                        id={`${id}-fees`}
                        type="number"
                        inputMode="decimal"
                        value={fees}
                        onChange={(e) => setFees(stripLeadingZeros(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        className={`${field} tabular-nums`}
                    />
                </div>
            )}

            {mode === 'i_paid' && (
                <>
                    {/* Note */}
                    <div>
                        <label htmlFor={`${id}-note`} className={label}>{t.note}</label>
                        <input
                            id={`${id}-note`}
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t.splitNotePlaceholder}
                            className={field}
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label htmlFor={`${id}-category`} className={label}>{t.category}</label>
                        <div className="relative">
                            <CategoryGlyph
                                category={selectedCategory}
                                size={32}
                                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 !rounded-[10px]"
                            />
                            <select
                                id={`${id}-category`}
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className={`${select} pl-[50px]`}
                            >
                                {expenseCategories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                            <SelectChevron />
                        </div>
                    </div>

                    {/* Account */}
                    <div>
                        <label htmlFor={`${id}-account`} className={label}>{t.account}</label>
                        <div className="relative">
                            <select
                                id={`${id}-account`}
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                className={select}
                            >
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                                ))}
                            </select>
                            <SelectChevron />
                        </div>
                    </div>
                </>
            )}
        </>
    );
};
