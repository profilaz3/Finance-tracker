import React from 'react';
import clsx from 'clsx';
import { Archive, CalendarDays, CheckCircle2, Users } from 'lucide-react';
import { CurrencyFlag } from './ui/CurrencyFlag';
import { stableColor } from '../utils/stableColor';
import { Event, Person, Currency } from '../types';
import { getParticipantInitials, getParticipantTooltipLabel, resolveEventParticipants } from '../utils/eventParticipants';
import { TRANSLATIONS } from '../constants';
import { formatShortDate, getIntlLocale, type AppLanguage } from '../utils/locale';
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
    /** The signed-in user's auth id: in someone else's event the organizer keeps their own name. */
    viewerUserId?: string | null;
}

/** "12 May · 18 May", "12 May · Ongoing" or "No dates set". */
export const formatEventDates = (event: Pick<Event, 'startDate' | 'endDate'>, t: Strings, language: AppLanguage): string => {
    const short = (value: string) => formatShortDate(value, language);
    if (event.startDate) {
        return `${short(event.startDate)} · ${event.endDate ? short(event.endDate) : t.eventOngoing}`;
    }
    return event.endDate ? t.eventEndedOn.replace('{date}', short(event.endDate)) : t.noDatesSet;
};

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

/** Overlapping participant avatars (stable colour when none is set) with a +N overflow bubble. */
export const ParticipantStack: React.FC<{ people: Person[]; max?: number; size?: number; ringClassName?: string }> = ({
    people,
    max = 3,
    size = 28,
    ringClassName = 'ring-[var(--paper-tile)]',
}) => (
    <span className="flex -space-x-2">
        {people.slice(0, max).map(person => (
            <span
                key={person.id}
                title={getParticipantTooltipLabel(person)}
                className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ring-2', ringClassName)}
                style={{ width: size, height: size, background: person.color || stableColor(person.name), fontSize: size < 32 ? 11 : 13 }}
            >
                {person.avatar && /^(data:|http)/.test(person.avatar)
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

const coverHash = (value: string): number => {
    let result = 0;
    for (let i = 0; i < value.length; i++) result = (result * 31 + value.charCodeAt(i)) | 0;
    return Math.abs(result);
};

/** Soft line art over the gradient cover of an event without a photo; one of three motifs per event. */
export const EventCoverArt: React.FC<{ eventId: string; className?: string }> = ({ eventId, className }) => {
    const motif = coverHash(eventId) % 3;
    return (
        <svg viewBox="0 0 400 240" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" className={clsx('pointer-events-none absolute inset-0 h-full w-full text-white', className)}>
            {motif === 0 && (
                <g fill="none" stroke="currentColor">
                    <circle cx="330" cy="40" r="120" strokeOpacity="0.10" strokeWidth="26" />
                    <circle cx="330" cy="40" r="62" strokeOpacity="0.14" strokeWidth="2" />
                    <circle cx="330" cy="40" r="180" strokeOpacity="0.08" strokeWidth="1.5" strokeDasharray="3 7" />
                </g>
            )}
            {motif === 1 && (
                <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {[0, 1, 2, 3, 4].map(i => (
                        <path key={i} d={`M120 ${30 + i * 26} C 200 ${0 + i * 26}, 260 ${70 + i * 26}, 420 ${20 + i * 26}`} strokeOpacity={0.16 - i * 0.02} />
                    ))}
                </g>
            )}
            {motif === 2 && (
                <g fill="currentColor">
                    {Array.from({ length: 7 }, (_, row) => Array.from({ length: 9 }, (_, col) => (
                        <circle key={`${row}-${col}`} cx={232 + col * 20} cy={14 + row * 20} r="2.2" fillOpacity={Math.max(0.03, 0.2 - (row + (8 - col)) * 0.014)} />
                    )))}
                    <path d="M300 210 l18 -34 l18 34 Z M330 210 l26 -50 l26 50 Z" fillOpacity="0.10" />
                </g>
            )}
        </svg>
    );
};

/** Glass calendar leaf with the start day, for banners. */
export const EventDateLeaf: React.FC<{ date?: string; language: AppLanguage }> = ({ date, language }) => {
    if (!date) return null;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return null;
    return (
        <span aria-hidden="true" className="flex w-11 shrink-0 flex-col overflow-hidden rounded-[13px] bg-white/90 text-center text-[#1B1B1A] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)]">
            <span className="bg-black/80 py-[2px] text-[9px] font-bold uppercase tracking-[0.6px] text-white">
                {parsed.toLocaleDateString(getIntlLocale(language), { month: 'short' }).replace('.', '')}
            </span>
            <span className="py-0.5 text-[19px] font-bold leading-[1.25] tabular-nums">{parsed.getDate()}</span>
        </span>
    );
};

/** Whole days covered by the event (end, or today while it is ongoing), at least 1; null without a start. */
export const eventDayCount = (event: Pick<Event, 'startDate' | 'endDate'>): number | null => {
    if (!event.startDate) return null;
    const start = new Date(event.startDate);
    const end = event.endDate ? new Date(event.endDate) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    return Math.max(1, Math.round((day(end) - day(start)) / 86_400_000) + 1);
};

export const formatDayCount = (count: number, t: Strings, language: AppLanguage): string => {
    const one = language === 'sr' ? count % 10 === 1 && count % 100 !== 11 : count === 1;
    return (one ? t.eventDayCount : t.eventDaysCount).replace('{n}', String(count));
};

export const EventCard: React.FC<EventCardProps> = React.memo(({ event, people, userProfile, totalCost, baseCurrency, onClick, language = 'en', featured = false, viewerUserId }) => {
    const t = TRANSLATIONS[language];
    const eventPeople = resolveEventParticipants({
        event,
        people,
        userProfile,
        fallbackCurrency: baseCurrency,
        viewerUserId,
    });
    const dates = formatEventDates(event, t, language);
    const days = eventDayCount(event);

    if (featured) {
        return (
            <button
                type="button"
                onClick={onClick}
                className="relative flex h-[244px] w-full flex-col justify-between overflow-hidden rounded-[30px] p-4 text-left text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)]"
                style={eventBannerStyle(event)}
            >
                {event.imageUrl ? <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <EventCoverArt eventId={event.id} />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10" aria-hidden="true" />
                <span className="relative flex items-start justify-between gap-3">
                    <EventDateLeaf date={event.startDate} language={language} />
                    <EventStatusChip status={event.status} t={t} />
                </span>
                <span className="relative flex flex-col gap-3">
                    <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-[28px] font-bold leading-tight tracking-[-0.6px]">{event.name}</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-white/80">
                            <CalendarDays size={14} aria-hidden="true" className="shrink-0" />
                            <span className="min-w-0 truncate">
                                {dates}
                                {days !== null && <span className="text-white/60"> · {formatDayCount(days, t, language)}</span>}
                            </span>
                        </span>
                    </span>
                    <span className="flex items-center justify-between gap-3 rounded-[20px] bg-black/25 py-2 pl-2 pr-3 ring-1 ring-white/15 backdrop-blur-md">
                        {eventPeople.length > 0 ? (
                            <ParticipantStack people={eventPeople} size={30} ringClassName="ring-black/30" />
                        ) : <span />}
                        <span className="flex min-w-0 items-center gap-2">
                            <CurrencyFlag currency={baseCurrency} size={20} />
                            <span className="flex flex-col items-end leading-tight">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{t.totalSpent}</span>
                                <span className="text-[19px] font-bold tracking-[-0.4px] tabular-nums">{compactMoney(totalCost, baseCurrency, language)}</span>
                            </span>
                        </span>
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
                {event.imageUrl ? <img src={event.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <EventCoverArt eventId={event.id} />}
                <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden="true" />
                <span className="absolute left-3 top-3">
                    <EventStatusChip status={event.status} t={t} />
                </span>
                <span className="absolute right-3 top-3">
                    <EventDateLeaf date={event.startDate} language={language} />
                </span>
                <span className="absolute bottom-2.5 left-3.5 right-3.5 truncate text-[19px] font-bold tracking-[-0.3px] text-white">{event.name}</span>
            </span>
            <span className="flex items-center gap-3 px-3.5 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                        <CalendarDays size={14} aria-hidden="true" className="shrink-0" />
                        {/* Text in its own box: a flex container can't ellipsize bare text. */}
                        <span className="min-w-0 truncate" title={days !== null ? `${dates} · ${formatDayCount(days, t, language)}` : dates}>
                            {dates}
                            {days !== null && <span className="text-faint"> · {formatDayCount(days, t, language)}</span>}
                        </span>
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
                    <span className="flex items-center gap-1.5 text-[17px] font-bold tabular-nums">
                        <CurrencyFlag currency={baseCurrency} size={16} />
                        {money(totalCost, baseCurrency, language)}
                    </span>
                </span>
            </span>
        </button>
    );
});

EventCard.displayName = 'EventCard';
