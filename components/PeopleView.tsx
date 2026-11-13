import React, { useState, useMemo } from 'react';
import { Person, Currency, ExchangeRates } from '../types';
import { TRANSLATIONS } from '../constants';
import { Plus, User, ArrowUpDown, ArrowDownLeft, ArrowUpRight, Search, Handshake, Check, Wallet, Banknote } from 'lucide-react';
import { motion } from 'motion/react';
import { EmptyState } from './EmptyState';
import { formatCurrency } from '../utils/formatters';
import { calculateDashboardDebtSummary, getActiveDashboardPeople } from '../utils/dashboardSummarySelectors';

interface PeopleViewProps {
    people: Person[];
    onAddPerson: () => void;
    onSelectPerson: (person: Person) => void;
    onAddTransaction?: (type: 'income' | 'expense') => void;
    onSettleUp?: (personId: string, currency: Currency, amount?: number) => void;
    baseCurrency: Currency;
    rates: ExchangeRates;
    language: 'en' | 'sr';
}

export const PeopleView: React.FC<PeopleViewProps> = ({
    people,
    onAddPerson,
    onSelectPerson,
    onAddTransaction,
    onSettleUp,
    baseCurrency,
    rates,
    language
}) => {
    const t = TRANSLATIONS[language];
    const [sortBy, setSortBy] = useState<'name' | 'balance'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [searchQuery, setSearchQuery] = useState('');

    const sortedPeople = useMemo(() => {
        let filtered = people;
        if (searchQuery) {
            filtered = people.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        return [...filtered].sort((a, b) => {
            if (sortBy === 'name') {
                return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
            } else {
                // Sort by total balance magnitude (simplified)
                const balA = Object.values(a.balances).reduce((sum, val) => sum + val, 0);
                const balB = Object.values(b.balances).reduce((sum, val) => sum + val, 0);
                return sortOrder === 'asc' ? balA - balB : balB - balA;
            }
        });
    }, [people, sortBy, sortOrder, searchQuery]);

    const { totalOwedToMe, totalIOwe } = useMemo(
        () => calculateDashboardDebtSummary({
            people,
            baseCurrency,
            rates: rates.rates,
        }),
        [people, baseCurrency, rates],
    );
    const activePeople = useMemo(() => getActiveDashboardPeople(people), [people]);

    const toggleSort = (field: 'name' | 'balance') => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-surface-container p-4 rounded-2xl">
                <div>
                    <h2 className="text-2xl font-display font-medium text-on-surface">{t.people}</h2>
                    <p className="text-sm text-on-surface-variant">{people.length} {t.contacts}</p>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    {onAddTransaction && (
                        <>
                            <button
                                onClick={() => onAddTransaction('income')}
                                className="flex-1 md:flex-none bg-tertiary-container text-on-tertiary-container px-4 py-2 rounded-full flex items-center justify-center gap-2 text-sm font-medium hover:opacity-90 transition-all"
                            >
                                <ArrowDownLeft size={16} /> {t.incoming}
                            </button>
                            <button
                                onClick={() => onAddTransaction('expense')}
                                className="flex-1 md:flex-none bg-error-container text-on-error-container px-4 py-2 rounded-full flex items-center justify-center gap-2 text-sm font-medium hover:opacity-90 transition-all"
                            >
                                <ArrowUpRight size={16} /> {t.outgoing}
                            </button>
                        </>
                    )}
                    <button
                        onClick={onAddPerson}
                        className="flex-1 md:flex-none bg-primary text-on-primary px-4 py-2 rounded-full flex items-center justify-center gap-2 text-sm font-medium shadow-elevation-1 hover:shadow-elevation-2 transition-all"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>

            {/* Search & Sort */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                        type="text"
                        placeholder={t.searchPeople}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface-container-high pl-10 pr-4 py-2 rounded-full text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <button
                    onClick={() => toggleSort('name')}
                    className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors ${sortBy === 'name' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'}`}
                >
                    {t.name} <ArrowUpDown size={14} className={sortBy === 'name' ? 'opacity-100' : 'opacity-50'} />
                </button>
                <button
                    onClick={() => toggleSort('balance')}
                    className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors ${sortBy === 'balance' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'}`}
                >
                    {t.balance} <ArrowUpDown size={14} className={sortBy === 'balance' ? 'opacity-100' : 'opacity-50'} />
                </button>
            </div>

            {/* Balance Summary Section */}
                    {(totalOwedToMe > 0 || totalIOwe > 0) && (
                <div className="grid grid-cols-2 gap-4">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 shadow-elevation-1"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 mb-1 flex items-center gap-1">
                            <ArrowDownLeft size={10} /> {t.owesYou}
                        </p>
                        <p className="text-xl md:text-2xl font-display font-medium text-tertiary">
                            {formatCurrency(totalOwedToMe, baseCurrency)}
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10 shadow-elevation-1"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 mb-1 flex items-center gap-1">
                            <ArrowUpRight size={10} /> {t.youOwe}
                        </p>
                        <p className="text-xl md:text-2xl font-display font-medium text-error">
                            {formatCurrency(totalIOwe, baseCurrency)}
                        </p>
                    </motion.div>
                </div>
            )}

            {/* People Grid - 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sortedPeople.length === 0 ? (
                    <div className="col-span-full">
                        <EmptyState
                            icon={User}
                            title={searchQuery ? t.noPeopleFound : t.noPeopleAdded}
                            description={searchQuery
                                ? t.tryDifferentSearch
                                : t.addContactsToTrack
                            }
                            action={!searchQuery ? { label: t.addPerson, onClick: onAddPerson } : undefined}
                        />
                    </div>
                ) : (
                    sortedPeople.map((person) => {
                        const hasBalance = activePeople.some(activePerson => activePerson.id === person.id);
                        const isImageAvatar = person.avatar?.startsWith('data:') || person.avatar?.startsWith('http');

                        return (
                            <motion.div
                                key={person.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onSelectPerson(person)}
                                className="bg-surface-container-low p-5 rounded-2xl shadow-elevation-1 cursor-pointer hover:shadow-elevation-2 transition-all relative overflow-hidden group"
                            >
                                <div className="flex items-center gap-4 mb-4">
                                    <div
                                        className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-sm overflow-hidden relative"
                                        style={{ backgroundColor: person.color }}
                                    >
                                        {isImageAvatar ? (
                                            <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                                        ) : (
                                            person.avatar || person.name.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-on-surface text-lg">{person.name}</h3>
                                        <p className="text-sm text-on-surface-variant">{person.defaultCurrency}</p>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    {(Object.entries(person.balances) as [Currency, number][]).map(([currency, amount]) => {
                                        if (amount === 0) return null;
                                        return (
                                            <div key={currency} className="flex justify-between items-center">
                                                <span className="text-sm text-on-surface-variant">{currency}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-mono font-medium ${amount > 0 ? 'text-tertiary' : 'text-error'}`}>
                                                        {amount > 0 ? '+' : ''}{amount.toFixed(2)}
                                                    </span>
                                                    {onSettleUp && amount !== 0 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onSettleUp(person.id, currency as Currency);
                                                            }}
                                                            className="p-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                                                            title={t.settleUp}
                                                        >
                                                            <Handshake size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {!hasBalance && (
                                        <div className="flex items-center gap-2 text-sm text-on-surface-variant/50 italic">
                                            <Check size={14} className="text-tertiary" />
                                            {t.noActiveBalance}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
