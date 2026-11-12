import React from 'react';
import { CURRENCIES } from '../../constants';
import { Currency } from '../../types';
import { CommonFieldsProps } from './types';

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
    return (
        <>
            {/* Amount */}
            {mode === 'i_paid' && (
                <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-2">
                        {t.total}
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => {
                                let val = e.target.value;
                                if (val.length > 1 && val.startsWith('0') && !val.includes('.')) {
                                    val = val.replace(/^0+/, '');
                                }
                                setAmount(val);
                            }}
                            placeholder="0.00"
                            className="flex-1 px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20 text-lg font-medium"
                            autoFocus
                            step="0.01"
                            onFocus={(e) => e.target.select()}
                        />
                    </div>
                </div>
            )}

            {/* Currency */}
            <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-2">
                    {t.currency}
                </label>
                <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20 font-medium"
                >
                    {CURRENCIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Date & Time - Only for I Paid mode */}
            {mode === 'i_paid' && (
                <div className="flex gap-4">
                    <div className="flex-1">
                        <label className="text-xs text-primary mb-1 block">Date</label>
                        <input
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
                            className="w-full bg-surface-container border-none rounded-lg px-4 py-2 text-on-surface"
                        />
                    </div>
                    <div className="w-32">
                        <label className="text-xs text-primary mb-1 block">Time</label>
                        <input
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
                            className="w-full bg-surface-container border-none rounded-lg px-4 py-2 text-on-surface"
                        />
                    </div>
                </div>
            )}

            {/* Fees - Only for I Paid mode */}
            {mode === 'i_paid' && (
                <div className="flex-1">
                    <label className="text-xs text-primary mb-1 block">Fees (USD)</label>
                    <input
                        type="number"
                        value={fees}
                        onChange={(e) => {
                            let val = e.target.value;
                            if (val.length > 1 && val.startsWith('0') && !val.includes('.')) {
                                val = val.replace(/^0+/, '');
                            }
                            setFees(val);
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        className="w-full bg-surface-container border-none rounded-lg px-4 py-2 text-on-surface"
                    />
                </div>
            )}

            {mode === 'i_paid' && (
                <>
                    {/* Note */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">{t.note}</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={language === 'sr' ? 'npr. Rucak u restoranu' : 'e.g., Lunch at restaurant'}
                            className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">{t.category}</label>
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20"
                        >
                            {categories.filter(c => c.type === 'expense').map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Account */}
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant mb-2">{t.account}</label>
                        <select
                            value={accountId}
                            onChange={(e) => setAccountId(e.target.value)}
                            className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20"
                        >
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                            ))}
                        </select>
                    </div>
                </>
            )}
        </>
    );
};
