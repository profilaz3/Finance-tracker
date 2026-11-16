import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpDown, ArrowUpRight, Bell, Check, ChevronLeft, MoreHorizontal, Plus, QrCode, Search, UserPlus, X } from 'lucide-react';
import { Person, Currency, ExchangeRates } from '../types';
import { TRANSLATIONS } from '../constants';
import { convertAmount } from '../services/currencyService';
import { Avatar, fill, money } from './home/parts';
import { EmptyState } from './EmptyState';
import { ConfirmDialog } from './ConfirmDialog';
import { HeroIconButton, HeroMenu, ScreenHero } from './ui/ScreenHero';
import { DebtHeroTotals } from './shared/DebtHeroTotals';
import { SHARED_STRINGS } from './shared/sharedStrings';
import { debtTotals, personBalanceLines, type PersonBalanceLine } from './shared/sharedSummary';
import { openPaymentRequest } from './payments/paymentBus';
import { resolveHomeHeader } from '../domain/homeHeader';
import type { AppState } from '../types';

interface PeopleViewProps {
    people: Person[];
    onAddPerson: () => void;
    onSelectPerson: (person: Person) => void;
    onAddTransaction?: (type: 'income' | 'expense') => void;
    onSettleUp?: (personId: string, currency: Currency, amount?: number) => void;
    baseCurrency: Currency;
    rates: ExchangeRates;
    language: 'en' | 'sr';
    /** Inside Settings: no screen header, just the list and its tools. */
    embedded?: boolean;
    /** The user's own profile id: kept out of the list and shown as "You" at the end. */
    selfId?: string;
    /** The Home header settings: the screen header uses the same colour. */
    homeHeader?: AppState['homeHeader'];
    /** Back to the Shared overview. */
    onBack?: () => void;
    /** Open beside the list on wide windows: that card is marked. */
    selectedPersonId?: string;
}

type Filter = 'all' | 'owe-you' | 'you-owe';
type Sort = 'balance' | 'name';

const isImage = (avatar?: string) => !!avatar && /^(data:|http)/.test(avatar);

const PersonAvatar: React.FC<{ person: Person; size: number }> = ({ person, size }) =>
    person.avatar && !isImage(person.avatar) ? (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{ width: size, height: size, fontSize: size / 2, background: `color-mix(in oklab, ${person.color} 22%, var(--paper-tile))` }}
        >
            {person.avatar}
        </span>
    ) : (
        <Avatar name={person.name} color={person.color} image={isImage(person.avatar) ? person.avatar : undefined} size={size} />
    );

interface PersonCardProps {
    line: PersonBalanceLine;
    language: 'en' | 'sr';
    onOpen: () => void;
    onRemind?: () => void;
    reminded: boolean;
    onRequest?: () => void;
    onPaidBack?: () => void;
    /** Open beside the list on wide windows. */
    selected?: boolean;
}

/** One person: what is open between you, and the next thing to do about it. */
const PersonCard: React.FC<PersonCardProps> = ({ line, language, onOpen, onRemind, reminded, onRequest, onPaidBack, selected = false }) => {
    const t = TRANSLATIONS[language];
    const s = SHARED_STRINGS[language];
    const { person, balances } = line;
    const [first, ...others] = balances;
    const owesYou = !!first && first[1] > 0;
    const status = !first ? t.settled : owesYou ? t.owesYou : s.youOweThem;
    const hasActions = !!(onRemind || onRequest || onPaidBack);
    return (
        <li
            className={clsx(
                'overflow-hidden rounded-[22px] bg-[var(--paper-tile)] shadow-[var(--paper-tile-shadow)]',
                selected && 'ring-[2.5px] ring-accent ring-offset-2 ring-offset-[var(--paper-bg)]',
            )}
        >
            <button type="button" onClick={onOpen} aria-current={selected ? 'true' : undefined} className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left active:bg-chip">
                <PersonAvatar person={person} size={44} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16.5px] font-semibold">{person.name}</span>
                    <span className="block truncate text-[13.5px] text-muted">{status}</span>
                </span>
                {first ? (
                    <span className="flex shrink-0 flex-col items-end">
                        <span className={clsx('whitespace-nowrap text-[19px] font-bold tabular-nums tracking-[-0.3px]', owesYou ? 'text-pos' : 'text-neg')}>
                            {money(Math.abs(first[1]), first[0], language)}
                        </span>
                        {others.map(([currency, amount]) => (
                            <span key={currency} className={clsx('whitespace-nowrap text-[13px] font-medium tabular-nums', amount > 0 ? 'text-pos' : 'text-neg')}>
                                {amount > 0 ? '+' : '−'}{money(Math.abs(amount), currency, language)}
                            </span>
                        ))}
                    </span>
                ) : (
                    <Check size={18} className="shrink-0 text-faint" aria-hidden="true" />
                )}
            </button>
            {hasActions && (
                <div className="flex gap-2 px-3 pb-3">
                    {onRemind && (
                        <button
                            type="button"
                            onClick={onRemind}
                            aria-label={`${s.remind}: ${person.name}`}
                            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-chip px-3 text-[15px] font-semibold"
                        >
                            {reminded ? <Check size={17} aria-hidden="true" /> : <Bell size={17} aria-hidden="true" />}
                            <span className="truncate" aria-live="polite">{reminded ? s.copied : s.remind}</span>
                        </button>
                    )}
                    {onRequest && (
                        <button
                            type="button"
                            onClick={onRequest}
                            aria-label={`${t.payRequest}: ${person.name}`}
                            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-3 text-[15px] font-semibold text-on-accent"
                        >
                            <QrCode size={17} aria-hidden="true" />
                            <span className="truncate">{t.payRequest}</span>
                        </button>
                    )}
                    {onPaidBack && (
                        <button
                            type="button"
                            onClick={onPaidBack}
                            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-accent-soft px-3 text-[15px] font-semibold text-accent"
                        >
                            <Check size={17} aria-hidden="true" />
                            <span className="truncate">{fill(t.settleIPaidThem, { name: person.name })}</span>
                        </button>
                    )}
                </div>
            )}
        </li>
    );
};

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
    selfId,
    homeHeader,
    onBack,
    selectedPersonId,
}) => {
    const t = TRANSLATIONS[language];
    const s = SHARED_STRINGS[language];
    const tone = resolveHomeHeader(homeHeader).tone;
    const [sort, setSort] = useState<Sort>('balance');
    const [filter, setFilter] = useState<Filter>('all');
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [reminded, setReminded] = useState<string | null>(null);
    // "I paid them back" records money that moved: confirm what it records first.
    const [pendingSettle, setPendingSettle] = useState<{ person: Person; currency: Currency; amount: number } | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);
    useEffect(() => {
        if (!reminded) return;
        const timer = window.setTimeout(() => setReminded(null), 2200);
        return () => window.clearTimeout(timer);
    }, [reminded]);

    const self = useMemo(() => (selfId ? people.find(person => person.id === selfId) : undefined), [people, selfId]);
    const lines = useMemo(() => personBalanceLines(people, selfId, baseCurrency, rates), [people, selfId, baseCurrency, rates]);
    const totals = useMemo(() => debtTotals(lines, baseCurrency, rates), [lines, baseCurrency, rates]);
    const counts = useMemo(() => ({
        all: lines.length,
        'owe-you': lines.filter(line => line.balances.some(([, amount]) => amount > 0)).length,
        'you-owe': lines.filter(line => line.balances.some(([, amount]) => amount < 0)).length,
    }), [lines]);

    const shown = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return lines
            .filter(line => filter === 'all'
                || line.balances.some(([, amount]) => (filter === 'owe-you' ? amount > 0 : amount < 0)))
            .filter(line => !needle || line.person.name.toLocaleLowerCase().includes(needle))
            .sort((a, b) => (sort === 'name'
                ? a.person.name.localeCompare(b.person.name, language)
                : Math.abs(b.net) - Math.abs(a.net) || a.person.name.localeCompare(b.person.name, language)));
    }, [lines, filter, query, sort, language]);

    const remind = async (line: PersonBalanceLine) => {
        const owed = line.balances.filter(([, amount]) => amount > 0);
        const amount = owed.length === 1
            ? money(owed[0][1], owed[0][0], language)
            : money(owed.reduce((sum, [currency, value]) => sum + convertAmount(value, currency, baseCurrency, rates), 0), baseCurrency, language);
        const text = fill(s.remindText, { name: line.person.name, amount });
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share({ text });
                return;
            }
        } catch (error) {
            // The user closed the share sheet: nothing to do.
            if ((error as DOMException)?.name === 'AbortError') return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setReminded(line.person.id);
        } catch {
            // No share sheet and no clipboard: open the person instead, where every option is.
            onSelectPerson(line.person);
        }
    };

    const request = (line: PersonBalanceLine) => {
        const owed = line.balances.filter(([, amount]) => amount > 0);
        const single = owed.length === 1 ? owed[0][0] : null;
        openPaymentRequest({
            amount: single ? owed[0][1] : owed.reduce((sum, [currency, value]) => sum + convertAmount(value, currency, baseCurrency, rates), 0),
            currency: single ?? baseCurrency,
            payerName: line.person.name,
            purpose: t.payPurposeDefault,
            onSettled: ({ full, amount }) => {
                if (!onSettleUp) return;
                if (full) owed.forEach(([currency]) => onSettleUp(line.person.id, currency));
                else if (single) onSettleUp(line.person.id, single, amount);
                // Part of a debt in several currencies: the person's page asks which one.
                else onSelectPerson(line.person);
            },
        });
    };

    const filters: Array<[Filter, string]> = [
        ['all', fill(s.filterAll, { count: counts.all })],
        ['owe-you', fill(s.filterOweYou, { count: counts['owe-you'] })],
        ['you-owe', fill(s.filterYouOwe, { count: counts['you-owe'] })],
    ];

    const closeSearch = () => {
        setSearchOpen(false);
        setQuery('');
    };

    const toolbar = (
        <div className="flex min-h-11 items-center justify-between gap-2 px-1">
            <button
                type="button"
                onClick={() => setSort(prev => (prev === 'balance' ? 'name' : 'balance'))}
                aria-label={fill(s.sortLabel, { order: sort === 'balance' ? s.biggestFirst : s.aToZ })}
                className="-ml-1 flex h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-muted"
            >
                <ArrowUpDown size={16} aria-hidden="true" />
                {sort === 'balance' ? s.biggestFirst : s.aToZ}
            </button>
            <button type="button" onClick={onAddPerson} className="-mr-1 flex h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-accent">
                <UserPlus size={17} aria-hidden="true" />
                {t.addPerson}
            </button>
        </div>
    );

    const list = shown.length === 0 ? (
        <EmptyState
            illustration={query || filter !== 'all' ? 'search' : 'people'}
            title={query ? t.noPeopleFound : filter !== 'all' ? s.allSquare : t.noPeopleAdded}
            description={query ? t.tryDifferentSearch : filter !== 'all' ? t.noDebtsToSettle : t.addContactsToTrack}
            action={!query && filter === 'all' ? { label: t.addPerson, onClick: onAddPerson } : undefined}
        />
    ) : (
        // Two columns when the page itself is wide (not when it sits beside an open person).
        <ul className={clsx('flex flex-col gap-2.5', !embedded && '@2xl:grid @2xl:grid-cols-2 @2xl:items-start')}>
            {shown.map(line => {
                const first = line.balances[0];
                const owedToYou = line.balances.some(([, amount]) => amount > 0);
                return (
                    <PersonCard
                        key={line.person.id}
                        line={line}
                        language={language}
                        onOpen={() => onSelectPerson(line.person)}
                        selected={line.person.id === selectedPersonId}
                        reminded={reminded === line.person.id}
                        onRemind={owedToYou && first[1] > 0 ? () => void remind(line) : undefined}
                        onRequest={owedToYou && first[1] > 0 ? () => request(line) : undefined}
                        onPaidBack={first && first[1] < 0 && onSettleUp ? () => setPendingSettle({ person: line.person, currency: first[0], amount: first[1] }) : undefined}
                    />
                );
            })}
        </ul>
    );

    const selfRow = self && !query && filter === 'all' && (
        <button
            type="button"
            onClick={() => onSelectPerson(self)}
            aria-label={`${t.you}: ${self.name}`}
            className="flex min-h-[60px] w-full items-center gap-3 rounded-[22px] px-4 py-2.5 text-left ring-1 ring-inset ring-hair"
        >
            <PersonAvatar person={self} size={36} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{self.name}</span>
                <span className="block truncate text-[13px] text-muted">{t.myProfile}</span>
            </span>
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.4px] text-accent">{t.you}</span>
        </button>
    );

    const confirm = (
        <ConfirmDialog
            isOpen={!!pendingSettle}
            type="info"
            title={t.quickSettleTitle}
            message={pendingSettle
                ? fill(pendingSettle.amount > 0 ? t.quickSettleTheyPaid : t.quickSettleIPaid, {
                    name: pendingSettle.person.name,
                    amount: money(Math.abs(pendingSettle.amount), pendingSettle.currency, language, true),
                    currency: pendingSettle.currency,
                })
                : ''}
            confirmLabel={t.settle}
            cancelLabel={t.cancel}
            onCancel={() => setPendingSettle(null)}
            onConfirm={() => {
                if (pendingSettle && onSettleUp) onSettleUp(pendingSettle.person.id, pendingSettle.currency);
                setPendingSettle(null);
            }}
        />
    );

    if (embedded) {
        return (
            <div className="mx-auto flex max-w-[860px] flex-col gap-3">
                <label className="paper-field relative flex h-11 items-center rounded-full border border-hair">
                    <Search size={17} className="pointer-events-none absolute left-3.5 text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        data-shortcut-search=""
                        placeholder={t.searchPeople}
                        aria-label={t.searchPeople}
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        className="h-full w-full rounded-full border-none bg-transparent pl-10 pr-4 text-[15px] placeholder:text-faint focus:ring-2 focus:ring-accent"
                    />
                </label>
                {toolbar}
                {list}
                {selfRow}
                {confirm}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[920px] pb-28">
            <ScreenHero tone={tone} label={t.people}>
                <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
                    {onBack && <HeroIconButton icon={ChevronLeft} label={t.back} onClick={onBack} />}
                    {searchOpen ? (
                        <>
                            <label className="relative flex h-11 min-w-0 flex-1 items-center rounded-full bg-white/15 ring-1 ring-inset ring-white/25">
                                <Search size={17} className="pointer-events-none absolute left-3.5 text-white/75" aria-hidden="true" />
                                <input
                                    ref={searchRef}
                                    type="search"
                                    data-shortcut-search=""
                                    placeholder={s.search}
                                    aria-label={s.search}
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key === 'Escape') {
                                            event.stopPropagation();
                                            closeSearch();
                                        }
                                    }}
                                    className="h-full w-full rounded-full border-none bg-transparent pl-10 pr-4 text-[16px] text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/70 [&::-webkit-search-cancel-button]:hidden"
                                />
                            </label>
                            <HeroIconButton icon={X} label={s.closeSearch} onClick={closeSearch} />
                        </>
                    ) : (
                        <>
                            <h1 className={clsx('min-w-0 flex-1 truncate text-[28px] font-bold tracking-[-0.03em]', !onBack && 'pl-1')}>{t.people}</h1>
                            <HeroIconButton icon={Search} label={s.search} onClick={() => setSearchOpen(true)} data-shortcut-search-open="" />
                            <HeroMenu
                                label={t.moreActions}
                                icon={MoreHorizontal}
                                items={[
                                    { icon: Plus, label: t.addPerson, onSelect: onAddPerson },
                                    ...(onAddTransaction
                                        ? [
                                            { icon: ArrowDownLeft, label: t.incoming, onSelect: () => onAddTransaction('income') },
                                            { icon: ArrowUpRight, label: t.outgoing, onSelect: () => onAddTransaction('expense') },
                                        ]
                                        : []),
                                ]}
                            />
                        </>
                    )}
                </div>
                <div className="pt-2">
                    <DebtHeroTotals totals={totals} currency={baseCurrency} language={language} showBar={false} />
                </div>
                <div role="group" aria-label={s.filterBy} className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-[42px] pt-5 md:px-5 md:pb-5">
                    {filters.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={filter === value}
                            onClick={() => setFilter(value)}
                            className={clsx(
                                'h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-[15px] font-semibold',
                                filter === value ? 'bg-white text-[#0B0D0C]' : 'text-white ring-1 ring-inset ring-white/35',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </ScreenHero>

            <div className="screen-sheet @container flex flex-col gap-2.5">
                {toolbar}
                {list}
                {selfRow}
            </div>
            {confirm}
        </div>
    );
};
