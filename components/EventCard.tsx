import React from 'react';
import clsx from 'clsx';
import { Archive, CalendarDays, CheckCircle2, Users } from 'lucide-react';
import { Event, Person, Currency } from '../types';
import { getParticipantInitials, getParticipantTooltipLabel, resolveEventParticipants } from '../utils/eventParticipants';
import { TRANSLATIONS } from '../constants';
import { formatShortDate, type AppLanguage } from '../utils/locale';
import { eventBannerStyle } from '../utils/eventVisuals';
import { compactMoney, money } from './home/parts';

type Strings = (typeof TRANSLATIONS)['en'];

interface EventCardProps {
    event: Event;
    people: Person[];
    userProfile?: Person;
    totalCost: number;
    baseCurrency: Currency;
    onClick: () => void;
    language?: AppLanguage;
    /** The large hero treatment used for the event happening now. */
    featured?: boolean;
}

/** "12 May · 18 May", "12 May · Ongoing" or "No dates set". */
export const formatEventDates = (event: Pick<Event, 'startDate' | 'endDate'>, t: Strings, language: AppLanguage): string => {
    const short = (value: string) => formatShortDate(value, language);
    if (event.startDate) {
        return `${short(event.startDate)} · ${event.endDate ? short(event.endDate) : t.eventOngoing}`;
    }
    return event.endDate ? t.eventEndedOn.replace('{date}', short(event.endDate)) : t.noDatesSet;
};

export const eventStatusLabel = (status: Event['status'], t: Strings): string =>
    status === 'active' ? t.eventStatusActive : status === 'completed' ? t.eventStatusCompleted : t.eventStatusArchived;

/** Glass status pill for photo or gradient banners. */
export const EventStatusChip: React.FC<{ status: Event['status']; t: Strings }> = ({ status, t }) => (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/20 px-2.5 text-[12px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-md">
        {status === 'active' && <span className="h-2 w-2 animate-pulse rounded-full bg-[#4ADE80]" aria-hidden="true" />}
        {status === 'completed' && <CheckCircle2 size={13} aria-hidden="true" />}
        {status === 'archived' && <Archive size={13} aria-hidden="true" />}
        {eventStatusLabel(status, t)}
    </span>
);

/** Overlapping participant avatars with a +N overflow bubble. */
export const ParticipantStack: React.FC<{ people: Person[]; max?: number; size?: number; ringClassName?: string }> = ({
    people,
    max = 4,
    size = 28,
    ringClassName = 'ring-[var(--paper-tile)]',
}) => (
    <span className="flex -space-x-2">
        {people.slice(0, max).map(person => (
            <span
                key={person.id}
                title={getParticipantTooltipLabel(person)}
                className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2', ringClassName)}
                style={{ width: size, height: size, background: person.color, fontSize: size < 32 ? 11 : 13 }}
            >
                {person.avatar
                    ? <img src={person.avatar} alt={person.name} className="h-full w-full object-cover" />
                    : getParticipantInitials(person.name)}
            </span>
        ))}
        {people.length > max && (
            <span
                className={clsx('flex shrink-0 items-center justify-center rounded-full bg-chip font-bold text-muted ring-2', ringClassName)}
                style={{ width: size, height: size, fontSize: 11 }}
            >
                +{people.length - max}
            </span>
        )}
    </span>
);

export const EventCard: React.FC<EventCardProps> = React.memo(({ event, people, userProfile, totalCost, baseCurrency, onClick, language = 'en', featured = false }) => {
    const t = TRANSLATIONS[language];
    const eventPeople = resolveEventParticipants({
        event,
        people,
        userProfile,
        fallbackCurrency: baseCurrency,
    });
    const dates = formatEventDates(event, t, language);

    if (featured) {
        return (
            <button
                type="button"
                onClick={onClick}
                className="relative flex h-[232px] w-full flex-col justify-between overflow-hidden rounded-[30px] p-4 text-left text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)]"
                style={eventBannerStyle(event)}
            >
                {event.imageUrl && <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10" aria-hidden="true" />
                <span className="relative flex items-center justify-between">
                    <EventStatusChip status={event.status} t={t} />
                    <ParticipantStack people={eventPeople} ringClassName="ring-black/25" />
                </span>
                <span className="relative flex items-end justify-between gap-3">
                    <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-[28px] font-bold leading-tight tracking-[-0.6px]">{event.name}</span>
                        <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/80">
                            <CalendarDays size={14} aria-hidden="true" />
                            {dates}
                        </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{t.totalSpent}</span>
                        <span className="text-[22px] font-bold tracking-[-0.4px]">{compactMoney(totalCost, baseCurrency, language)}</span>
                    </span>
                </span>
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className="paper-tile flex w-full flex-col overflow-hidden p-0 text-left"
        >
            <span className="relative block h-[96px] w-full overflow-hidden" style={eventBannerStyle(event)}>
                {event.imageUrl && <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden="true" />
                <span className="absolute left-3 top-3">
                    <EventStatusChip status={event.status} t={t} />
                </span>
                <span className="absolute bottom-2.5 left-3.5 right-3.5 truncate text-[19px] font-bold tracking-[-0.3px] text-white">{event.name}</span>
            </span>
            <span className="flex items-center gap-3 px-3.5 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 truncate text-[13px] text-muted">
                        <CalendarDays size={14} aria-hidden="true" className="shrink-0" />
                        {dates}
                    </span>
                    {eventPeople.length > 0 ? (
                        <ParticipantStack people={eventPeople} size={24} />
                    ) : (
                        <span className="flex items-center gap-1.5 text-[13px] text-faint">
                            <Users size={14} aria-hidden="true" />
                            0
                        </span>
                    )}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">{t.totalSpent}</span>
                    <span className="text-[17px] font-bold">{money(totalCost, baseCurrency, language)}</span>
                </span>
            </span>
        </button>
    );
});

EventCard.displayName = 'EventCard';
