import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Plus, UserPlus, Users, MoreHorizontal } from 'lucide-react';
import { Illustration } from './ui/Illustration';
import { AppState, Event, Person } from '../types';
import { EventCoverArt, EventStatusChip, ParticipantStack, formatEventDates } from './EventCard';
import { sortEvents, eventBannerStyle } from '../utils/eventVisuals';
import { resolveEventParticipants } from '../utils/eventParticipants';
import { TRANSLATIONS } from '../constants';
import { resolveHomeHeader } from '../domain/homeHeader';
import { getIntlLocale, type AppLanguage } from '../utils/locale';
import { pluralForm } from '../utils/plural';
import { useSessionIdentity } from '../hooks/useSessionIdentity';
import { Avatar, fill, money } from './home/parts';
import { HeroIconButton, HeroMenu, ScreenHero } from './ui/ScreenHero';
import { DebtHeroTotals } from './shared/DebtHeroTotals';
import { SHARED_STRINGS } from './shared/sharedStrings';
import { debtTotals, eventDayOf, eventMoney, personBalanceLines, type EventMoney, type PersonBalanceLine } from './shared/sharedSummary';

interface EventsViewProps {
    state: AppState;
    onCreateEvent: () => void;
    onSelectEvent: (event: Event) => void;
    /** The People page (the whole list, filters and actions). */
    onOpenPeople: () => void;
    onAddPerson: () => void;
    onSelectPerson: (person: Person) => void;
}

/** A short date range for a dated event (the locale's own range format), else the event card's wording. */
export const eventRange = (event: Pick<Event, 'startDate' | 'endDate'>, language: AppLanguage): string => {
    const t = TRANSLATIONS[language];
    if (event.startDate && event.endDate) {
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
            try {
                return new Intl.DateTimeFormat(getIntlLocale(language), { day: 'numeric', month: 'short' }).formatRange(start, end);
            } catch {
                // Fall through to the card wording.
            }
        }
    }
    return formatEventDates(event, t, language);
};

const isImage = (avatar?: string) => !!avatar && /^(data:|http)/.test(avatar);

/** The event happening now: its cover, who is in it, what was spent and where you stand. */
const NowCard: React.FC<{ event: Event; money: EventMoney; state: AppState; viewerUserId?: string | null; onOpen: () => void }> = ({
    event,
    money: amounts,
    state,
    viewerUserId,
    onOpen,
}) => {
    const t = TRANSLATIONS[state.language];
    const s = SHARED_STRINGS[state.language];
    const participants = resolveEventParticipants({
        event,
        people: state.people,
        userProfile: state.userProfile,
        fallbackCurrency: state.baseCurrency,
        viewerUserId,
    });
    return (
        <button
            type="button"
            onClick={onOpen}
            className="relative flex min-h-[156px] w-full flex-col justify-between overflow-hidden rounded-[26px] p-4 text-left text-white shadow-[0_12px_28px_-14px_rgba(0,0,0,0.5)]"
            style={eventBannerStyle(event)}
        >
            {event.imageUrl ? <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <EventCoverArt eventId={event.id} />}
            <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" aria-hidden="true" />
            <span className="relative flex items-start justify-between gap-3">
                <EventStatusChip status={event.status} t={t} />
                {participants.length > 0 && <ParticipantStack people={participants} size={32} ringClassName="ring-black/25" />}
            </span>
            <span className="relative mt-6 flex items-end justify-between gap-3">
                <span className="min-w-0">
                    <span className="block truncate text-[28px] font-bold leading-tight tracking-[-0.6px]">{event.name}</span>
                    <span className="block truncate text-[14px] font-medium text-white/85">
                        {eventRange(event, state.language)}
                        {amounts.total > 0 && <> · {fill(s.spent, { amount: money(amounts.total, amounts.currency, state.language) })}</>}
                    </span>
                </span>
                {amounts.mine !== 0 && (
                    <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-medium text-white/80">{amounts.mine > 0 ? s.youreOwed : t.youOwe}</span>
                        <span className="block whitespace-nowrap text-[24px] font-bold leading-tight tracking-[-0.5px] tabular-nums">
                            {money(Math.abs(amounts.mine), amounts.currency, state.language)}
                        </span>
                    </span>
                )}
            </span>
        </button>
    );
};

/** A small card per person in the People strip: what they owe you or you owe them. */
const PersonChipCard: React.FC<{ line: PersonBalanceLine; language: AppLanguage; onOpen: () => void }> = ({ line, language, onOpen }) => {
    const t = TRANSLATIONS[language];
    const s = SHARED_STRINGS[language];
    const [first, ...others] = line.balances;
    const { person } = line;
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex w-[150px] shrink-0 snap-start flex-col items-start rounded-[22px] bg-[var(--paper-tile)] p-3.5 text-left shadow-[var(--paper-tile-shadow)]"
        >
            <Avatar name={person.name} color={person.color} image={isImage(person.avatar) ? person.avatar : undefined} size={38} />
            <span className="mt-2.5 block w-full truncate text-[15px] font-semibold">{person.name}</span>
            {first ? (
                <span className={clsx('block w-full whitespace-nowrap text-[17px] font-bold tabular-nums', first[1] > 0 ? 'text-pos' : 'text-neg')}>
                    {money(Math.abs(first[1]), first[0], language)}
                </span>
            ) : (
                <span className="block text-[17px] font-bold text-faint">0</span>
            )}
            <span className="block w-full truncate text-[12.5px] text-muted">
                {first ? (first[1] > 0 ? t.owesYou : s.youOweThem) : t.settled}
                {others.length > 0 && ` · +${others.length}`}
            </span>
        </button>
    );
};

export const EventsView: React.FC<EventsViewProps> = ({ state, onCreateEvent, onSelectEvent, onOpenPeople, onAddPerson, onSelectPerson }) => {
    const t = TRANSLATIONS[state.language];
    const s = SHARED_STRINGS[state.language];
    const tone = resolveHomeHeader(state.homeHeader).tone;
    // Who is signed in, so shared events show their organizer by name and "you" is the right person.
    const viewerUserId = useSessionIdentity()?.userId;

    const events = useMemo(() => sortEvents(state.events), [state.events]);
    const moneyByEvent = useMemo(() => {
        const result = new Map<string, EventMoney>();
        for (const event of events) result.set(event.id, eventMoney(event, state, viewerUserId));
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, state.sharedExpenses, state.transactions, state.people, state.userProfile, state.rates, state.baseCurrency, viewerUserId]);

    const lines = useMemo(
        () => personBalanceLines(state.people, state.userProfile?.id, state.baseCurrency, state.rates),
        [state.people, state.userProfile?.id, state.baseCurrency, state.rates],
    );
    const totals = useMemo(() => debtTotals(lines, state.baseCurrency, state.rates), [lines, state.baseCurrency, state.rates]);
    // People who owe or are owed first (biggest first), then everyone else by name.
    const strip = useMemo(
        () => [...lines]
            .sort((a, b) => (Math.abs(b.net) >= 0.005 ? 1 : 0) - (Math.abs(a.net) >= 0.005 ? 1 : 0) || Math.abs(b.net) - Math.abs(a.net) || a.person.name.localeCompare(b.person.name))
            .slice(0, 12),
        [lines],
    );

    const active = events.filter(event => event.status === 'active');
    const earlier = events.filter(event => event.status !== 'active');
    const lead = active[0];
    const leadMoney = lead ? moneyByEvent.get(lead.id) : undefined;
    const eventExtra = (sign: 1 | -1) =>
        lead && leadMoney && Math.sign(leadMoney.mine) === sign
            ? fill(s.inEvent, { amount: money(Math.abs(leadMoney.mine), leadMoney.currency, state.language), name: lead.name })
            : undefined;
    const form = pluralForm(active.length, state.language);
    const activeLabel = active.length > 0
        ? fill(form === 'one' ? s.activeOne : form === 'few' ? s.activeFew : s.activeMany, { count: active.length })
        : undefined;
    const dayOf = lead ? eventDayOf(lead) : null;

    return (
        <div className="mx-auto max-w-[920px] pb-28">
            <ScreenHero tone={tone} label={t.navEvents}>
                <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
                    <h1 className="min-w-0 flex-1 truncate pl-1 text-[28px] font-bold tracking-[-0.03em]">{t.navEvents}</h1>
                    <HeroIconButton icon={Plus} label={t.newEvent} onClick={onCreateEvent} />
                    <HeroMenu
                        label={t.moreActions}
                        icon={MoreHorizontal}
                        items={[
                            { icon: UserPlus, label: t.addPerson, onSelect: onAddPerson },
                            { icon: Users, label: s.allPeople, onSelect: onOpenPeople },
                        ]}
                    />
                </div>
                <div className="pb-[42px] pt-2 md:pb-5">
                    <DebtHeroTotals
                        totals={totals}
                        currency={state.baseCurrency}
                        language={state.language}
                        owedExtra={eventExtra(1)}
                        oweExtra={eventExtra(-1)}
                        aside={activeLabel}
                    />
                </div>
            </ScreenHero>

            <div className="screen-sheet flex flex-col gap-6">
                {lead && (
                    <section aria-labelledby="shared-now-title" className="flex flex-col gap-2.5">
                        <div className="flex min-h-9 items-baseline justify-between gap-3 px-2">
                            <h2 id="shared-now-title" className="text-[18px] font-bold tracking-[-0.3px]">{t.eventsHappeningNow}</h2>
                            {dayOf && <span className="shrink-0 text-[14px] text-muted">{fill(s.dayOf, dayOf)}</span>}
                        </div>
                        {active.map(event => (
                            <NowCard
                                key={event.id}
                                event={event}
                                money={moneyByEvent.get(event.id) ?? { currency: state.baseCurrency, total: 0, mine: 0 }}
                                state={state}
                                viewerUserId={viewerUserId}
                                onOpen={() => onSelectEvent(event)}
                            />
                        ))}
                    </section>
                )}

                <section aria-labelledby="shared-people-title" className="flex flex-col gap-2.5">
                    <div className="flex min-h-9 items-center justify-between gap-3 px-2">
                        <h2 id="shared-people-title" className="text-[18px] font-bold tracking-[-0.3px]">{t.people}</h2>
                        {lines.length > 0 && (
                            <button type="button" onClick={onOpenPeople} className="-mr-2 h-10 shrink-0 rounded-full px-3 text-[15px] font-semibold text-accent">
                                {s.allPeople}
                            </button>
                        )}
                    </div>
                    <div className="scrollbar-none -mx-2 flex snap-x gap-2.5 overflow-x-auto px-2 pb-2">
                        {strip.map(line => (
                            <PersonChipCard key={line.person.id} line={line} language={state.language} onOpen={() => onSelectPerson(line.person)} />
                        ))}
                        <button
                            type="button"
                            onClick={onAddPerson}
                            className={clsx(
                                'flex shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-hair p-3.5 text-[14px] font-semibold text-muted',
                                strip.length > 0 ? 'w-[120px]' : 'min-h-[120px] w-full',
                            )}
                        >
                            <UserPlus size={22} aria-hidden="true" />
                            {t.addPerson}
                        </button>
                    </div>
                </section>

                {events.length === 0 ? (
                    <section className="flex flex-col items-center gap-3 rounded-[26px] bg-[var(--paper-tile)] px-6 pb-8 pt-5 text-center shadow-[var(--paper-tile-shadow)]">
                        <span className="h-28 w-36" aria-hidden="true">
                            <Illustration name="events" />
                        </span>
                        <h2 className="text-[19px] font-bold">{t.noEvents}</h2>
                        <p className="max-w-[300px] text-[14px] text-muted">{t.noEventsDescription}</p>
                        <button
                            type="button"
                            onClick={onCreateEvent}
                            className="mt-1 flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent"
                        >
                            <Plus size={18} aria-hidden="true" />
                            {t.createEvent}
                        </button>
                    </section>
                ) : earlier.length > 0 && (
                    <section aria-labelledby="shared-earlier-title" className="flex flex-col gap-2.5">
                        <h2 id="shared-earlier-title" className="px-2 text-[18px] font-bold tracking-[-0.3px]">{lead ? s.earlier : t.events}</h2>
                        <ul className="overflow-hidden rounded-[22px] bg-[var(--paper-tile)] shadow-[var(--paper-tile-shadow)]">
                            {earlier.map((event, index) => {
                                const amounts = moneyByEvent.get(event.id);
                                const standing = !amounts || amounts.mine === 0
                                    ? (event.status === 'active' ? '' : t.settled)
                                    : `${amounts.mine > 0 ? s.youreOwed : t.youOwe} ${money(Math.abs(amounts.mine), amounts.currency, state.language)}`;
                                return (
                                    <li key={event.id} className={clsx(index < earlier.length - 1 && 'border-b border-hair')}>
                                        <button type="button" onClick={() => onSelectEvent(event)} className="flex min-h-[68px] w-full items-center gap-3 py-2.5 pl-3.5 pr-4 text-left active:bg-chip">
                                            <span
                                                aria-hidden="true"
                                                className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-[17px] font-bold text-white"
                                                style={eventBannerStyle(event)}
                                            >
                                                {event.imageUrl ? <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : event.name.trim().charAt(0).toUpperCase()}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[16px] font-semibold">{event.name}</span>
                                                <span className="block truncate text-[13px] text-muted">
                                                    {[eventRange(event, state.language), standing].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                            {amounts && amounts.total > 0 && (
                                                <span className="shrink-0 whitespace-nowrap text-[16px] font-semibold tabular-nums">
                                                    {money(amounts.total, amounts.currency, state.language)}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
};
