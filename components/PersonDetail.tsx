import React, { useMemo, useState } from 'react';
import { Person, Transaction, Currency, Category, ExchangeRates } from '../types';
import { TRANSLATIONS } from '../constants';
import { X, ArrowUpRight, ArrowDownLeft, Trash2, Edit2, Wallet, Calendar, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency, getShortDate } from '../utils/formatters';
import { convertAmount } from '../services/currencyService';
import { BalanceInput } from './BalanceInput';
import clsx from 'clsx';

interface PersonDetailProps {
    person: Person;
    transactions: Transaction[];
    categories: Category[];
    baseCurrency: Currency;
    rates: ExchangeRates;
    onClose: () => void;
    onDelete: (id: string) => void;
    onEdit: (person: Person) => void;
    onSettleUp: (personId: string, currency: Currency, amount?: number) => void;
    onUpdateBalance: (personId: string, currency: Currency, newBalance: number) => void;
    language: 'en' | 'sr';
}

export const PersonDetail: React.FC<PersonDetailProps> = ({
    person,
    transactions,
    categories,
    baseCurrency,
    rates,
    onClose,
    onDelete,
    onEdit,
    onSettleUp,
    onUpdateBalance,
    language
}) => {
    const t = TRANSLATIONS[language];
    const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);

    // Filter transactions related to this person
    const personTransactions = useMemo(() => {
        return transactions
            .filter(tx => tx.personId === person.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, person.id]);

    // Calculate total balance in base currency for summary
    const totalBalanceInBase = useMemo(() => {
        return Object.entries(person.balances).reduce((acc, [currency, amount]) => {
            return acc + convertAmount(amount, currency as Currency, baseCurrency, rates);
        }, 0);
    }, [person.balances, baseCurrency, rates]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-md" onClick={onClose}>
            <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-surface-container w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-outline-variant/10"
            >
                {/* Avant-Garde Header */}
                <div className="relative p-8 pb-0">
                    <div className="absolute top-4 right-4 flex gap-2">
                        <button
                            onClick={() => onEdit(person)}
                            className="p-2 hover:bg-on-surface/10 rounded-full text-on-surface-variant transition-colors"
                            title={t.edit || 'Edit'}
                        >
                            <Edit2 size={20} className="opacity-75" />
                        </button>
                        <button
                            onClick={() => onDelete(person.id)}
                            className="p-2 hover:bg-error-container/20 hover:text-error rounded-full text-on-surface-variant transition-colors"
                            title={t.delete}
                        >
                            <Trash2 size={20} className="opacity-75" />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-on-surface/10 rounded-full text-on-surface-variant transition-colors">
                            <X size={20} className="opacity-75" />
                        </button>
                    </div>

                    <div className="flex flex-col items-center">
                        <div
                            className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-xl mb-4 relative"
                            style={{ backgroundColor: person.color }}
                        >
                            {person.avatar?.startsWith('data:') || person.avatar?.startsWith('http') ? (
                                <img src={person.avatar} alt={person.name} className="w-full h-full object-cover rounded-full" />
                            ) : (
                                person.avatar || person.name.charAt(0).toUpperCase()
                            )}

                            {totalBalanceInBase !== 0 && (
                                <div className={clsx(
                                    "absolute -bottom-2 px-3 py-1 rounded-full text-xs font-bold shadow-lg border border-surface",
                                    totalBalanceInBase > 0 ? "bg-error text-on-error" : "bg-primary text-on-primary"
                                )}>
                                    {totalBalanceInBase > 0 ? t.owesYou : t.youOwe}
                                </div>
                            )}
                        </div>

                        <h2 className="text-3xl font-display font-medium text-on-surface text-center mb-1">{person.name}</h2>

                        {totalBalanceInBase !== 0 && (
                            <p className={clsx(
                                "text-lg font-mono font-medium mb-6",
                                totalBalanceInBase > 0 ? "text-error" : "text-primary"
                            )}>
                                {formatCurrency(Math.abs(totalBalanceInBase), baseCurrency)}
                            </p>
                        )}

                        {totalBalanceInBase === 0 && (
                            <p className="text-on-surface-variant/70 mb-6 flex items-center gap-2 text-sm">
                                <Sparkles size={14} /> {t.allSettled || "All settled up"}
                            </p>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {/* Balances Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                        {['EUR', 'USD', 'RSD'].map((currency) => {
                            const amount = person.balances[currency as Currency] || 0;
                            const isEditing = editingCurrency === currency;

                            return (
                                <div
                                    key={currency}
                                    onClick={() => !isEditing && setEditingCurrency(currency as Currency)}
                                    className={clsx(
                                        "group relative p-5 rounded-2xl transition-all duration-300 border cursor-pointer",
                                        amount !== 0 ? "bg-surface-container-high border-transparent" : "bg-surface-container-low border-outline-variant/20 hover:border-primary/30"
                                    )}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-medium tracking-wider text-on-surface-variant/70 uppercase flex items-center gap-1">
                                            <Wallet size={12} /> {currency}
                                        </span>
                                        {!isEditing && (
                                            <Edit2 size={12} className="opacity-50 sm:opacity-0 sm:group-hover:opacity-50 transition-opacity text-on-surface-variant" />
                                        )}
                                    </div>

                                    {isEditing ? (
                                        <BalanceInput
                                            currency={currency as Currency}
                                            initialAmount={amount}
                                            onSave={(val) => {
                                                onUpdateBalance(person.id, currency as Currency, val);
                                                setEditingCurrency(null);
                                            }}
                                            onCancel={() => setEditingCurrency(null)}
                                            language={language}
                                        />
                                    ) : (
                                        <div className="flex items-baseline gap-2">
                                            <span className={clsx(
                                                "text-2xl font-mono font-medium",
                                                amount > 0 ? "text-error" : amount < 0 ? "text-primary" : "text-on-surface-variant"
                                            )}>
                                                {amount > 0 ? '+' : ''}{formatCurrency(amount, currency as Currency)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Settle Action */}
                                    {!isEditing && amount !== 0 && (
                                        <div className="absolute top-4 right-4 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSettleUp(person.id, currency as Currency);
                                                }}
                                                className="bg-primary/10 hover:bg-primary text-primary hover:text-on-primary p-2 rounded-full transition-colors"
                                                title={t.settle}
                                            >
                                                <Sparkles size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Transaction History */}
                    <div>
                        <h3 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Calendar size={14} /> {t.history}
                        </h3>
                        <div className="space-y-1">
                            {personTransactions.map((tx) => {
                                const category = categories.find(c => c.id === tx.categoryId);
                                const isOwesYou = tx.type === 'expense';

                                return (
                                    <div key={tx.id} className="flex justify-between items-center p-3 hover:bg-on-surface/5 rounded-xl transition-colors group">
                                        <div className="flex items-center gap-4">
                                            <div className={clsx(
                                                "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                                                isOwesYou ? 'bg-error-container/30 text-error' : 'bg-primary-container/30 text-primary'
                                            )}>
                                                {isOwesYou ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                                            </div>
                                            <div>
                                                <p className="font-medium text-on-surface text-sm">{tx.note || category?.name}</p>
                                                <p className="text-xs text-on-surface-variant/70">{getShortDate(tx.date)}</p>
                                            </div>
                                        </div>
                                        <span className={clsx(
                                            "font-mono font-medium text-sm",
                                            isOwesYou ? 'text-error' : 'text-primary'
                                        )}>
                                            {isOwesYou ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                                        </span>
                                    </div>
                                );
                            })}
                            {personTransactions.length === 0 && (
                                <div className="text-center py-10 opacity-50">
                                    <div className="bg-surface-container-highest w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Wallet size={24} className="text-on-surface-variant" />
                                    </div>
                                    <p className="text-on-surface-variant text-sm">{t.noTransactions}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

