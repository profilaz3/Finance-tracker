import React, { useState, useMemo } from 'react';
import { Person, Currency, ExchangeRates } from '../types';
import { TRANSLATIONS } from '../constants';
import { Plus, User, ArrowUpDown, ArrowDownLeft, ArrowUpRight, Search, Handshake, Check } from 'lucide-react';
import clsx from 'clsx';
import { Segmented } from './ui/Segmented';
import { Avatar, Big } from './home/parts';
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
    /** Inside Settings: no page header, and the add button sits with the actions. */
    embedded?: boolean;
}

export const PeopleView: React.FC<PeopleViewProps> = ({
    people,
    onAddPerson,
    onSelectPerson,
    onAddTransaction,
    onSettleUp,
    baseCurrency,
    rates,
    language,
    embedded = false,
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

    const sortLabel = (field: 'name' | 'balance', label: string) => (
        <span className="flex items-center justify-center gap-1">
            {label}
            {sortBy === field && <ArrowUpDown size={12} aria-hidden="true" className={sortOrder === 'desc' ? 'rotate-180' : ''} />}
        </span>
    );

    return (
        <div className={clsx('mx-auto flex max-w-[860px] flex-col gap-4', !embedded && 'px-1 pb-8')}>
            {!embedded && (
                <header className="flex min-h-[60px] items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.6px]">{t.people}</h1>
                        <p className="truncate text-[13px] text-muted">{people.length} {t.contacts}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onAddPerson}
                        aria-label={t.addPerson}
                        title={t.addPerson}
                        className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    >
                        <Plus size={22} aria-hidden="true" />
                    </button>
                </header>
            )}

            {(totalOwedToMe > 0 || totalIOwe > 0) && (
                <section className="paper-tile grid grid-cols-2 divide-x divide-[var(--paper-line)] py-4">
                    <div className="flex min-w-0 flex-col gap-1 px-4">
                        <span className="flex items-center gap-1 text-[13px] text-muted">
                            <ArrowDownLeft size={13} aria-hidden="true" /> {t.owesYou}
                        </span>
                        <Big size={24} className="text-pos">{formatCurrency(totalOwedToMe, baseCurrency)}</Big>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1 px-4">
                        <span className="flex items-center gap-1 text-[13px] text-muted">
                            <ArrowUpRight size={13} aria-hidden="true" /> {t.youOwe}
                        </span>
                        <Big size={24} className="text-neg">{formatCurrency(totalIOwe, baseCurrency)}</Big>
                    </div>
                </section>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <label className="paper-field relative flex h-11 min-w-[180px] flex-1 items-center rounded-full border border-hair">
                    <Search size={17} className="pointer-events-none absolute left-3.5 text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        placeholder={t.searchPeople}
                        aria-label={t.searchPeople}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-full w-full rounded-full border-none bg-transparent pl-10 pr-4 text-[15px] placeholder:text-faint focus:ring-2 focus:ring-accent"
                    />
                </label>
                <Segmented<'name' | 'balance'>
                    size="sm"
                    ariaLabel={t.sortBy}
                    value={sortBy}
                    onChange={toggleSort}
                    options={[
                        { value: 'name', label: sortLabel('name', t.name) },
                        { value: 'balance', label: sortLabel('balance', t.balance) },
                    ]}
                />
            </div>

            {onAddTransaction && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onAddTransaction('income')}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-chip text-[14px] font-semibold sm:flex-none sm:px-4"
                    >
                        <ArrowDownLeft size={16} className="text-pos" aria-hidden="true" /> {t.incoming}
                    </button>
                    <button
                        type="button"
                        onClick={() => onAddTransaction('expense')}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-chip text-[14px] font-semibold sm:flex-none sm:px-4"
                    >
                        <ArrowUpRight size={16} className="text-neg" aria-hidden="true" /> {t.outgoing}
                    </button>
                    {embedded && (
                        <button
                            type="button"
                            onClick={onAddPerson}
                            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent text-[14px] font-semibold text-on-accent sm:ml-auto sm:flex-none sm:px-4"
                        >
                            <Plus size={16} aria-hidden="true" /> {t.addPerson}
                        </button>
                    )}
                </div>
            )}

            {sortedPeople.length === 0 ? (
                <EmptyState
                    icon={User}
                    title={searchQuery ? t.noPeopleFound : t.noPeopleAdded}
                    description={searchQuery ? t.tryDifferentSearch : t.addContactsToTrack}
                    action={!searchQuery ? { label: t.addPerson, onClick: onAddPerson } : undefined}
                />
            ) : (
                <div className="paper-tile px-4 py-1">
                    {sortedPeople.map((person, index) => {
                        const hasBalance = activePeople.some(activePerson => activePerson.id === person.id);
                        const isImageAvatar = person.avatar?.startsWith('data:') || person.avatar?.startsWith('http');
                        const balances = (Object.entries(person.balances) as [Currency, number][]).filter(([, amount]) => amount !== 0);

                        return (
                            <div
                                key={person.id}
                                onClick={() => onSelectPerson(person)}
                                role="button"
                                tabIndex={0}
                                aria-label={person.name}
                                onKeyDown={(e) => {
                                    if (e.target !== e.currentTarget) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectPerson(person);
                                    }
                                }}
                                className={clsx(
                                    'group flex min-h-[68px] cursor-pointer items-center gap-3 py-2.5',
                                    index < sortedPeople.length - 1 && 'border-b border-hair',
                                )}
                            >
                                {person.avatar && !isImageAvatar ? (
                                    <span
                                        aria-hidden="true"
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[22px]"
                                        style={{ background: `color-mix(in oklab, ${person.color} 22%, var(--paper-tile))` }}
                                    >
                                        {person.avatar}
                                    </span>
                                ) : (
                                    <Avatar name={person.name} color={person.color} image={isImageAvatar ? person.avatar : undefined} size={44} />
                                )}
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-[16px] font-semibold">{person.name}</span>
                                    <span className="truncate text-[13px] text-muted">
                                        {hasBalance
                                            ? balances.map(([, amount]) => (amount > 0 ? t.owesYou : t.youOwe)).filter((label, i, all) => all.indexOf(label) === i).join(' · ')
                                            : t.noActiveBalance}
                                    </span>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-0.5">
                                    {balances.length === 0 ? (
                                        <Check size={18} className="text-faint" aria-hidden="true" />
                                    ) : balances.map(([currency, amount]) => (
                                        <div key={currency} className="flex items-center gap-1">
                                            <span className={`text-[15px] font-semibold tabular-nums ${amount > 0 ? 'text-pos' : 'text-neg'}`}>
                                                {amount > 0 ? '+' : ''}{formatCurrency(amount, currency)}
                                            </span>
                                            {onSettleUp && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSettleUp(person.id, currency as Currency);
                                                    }}
                                                    className="flex h-8 w-8 items-center justify-center rounded-full text-accent transition-opacity hover:bg-chip opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                                                    title={t.settleUp}
                                                    aria-label={`${t.settleUp}: ${person.name} ${currency}`}
                                                >
                                                    <Handshake size={16} aria-hidden="true" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
