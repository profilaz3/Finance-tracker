import React from 'react';
import { m } from 'motion/react';
import { Calendar, Users, ArrowRight, MapPin, CheckCircle2, Archive, PlayCircle } from 'lucide-react';
import { Event, Person, Currency } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import clsx from 'clsx';
import { getParticipantInitials, getParticipantTooltipLabel, resolveEventParticipants } from '../utils/eventParticipants';

interface EventCardProps {
    event: Event;
    people: Person[];
    userProfile?: Person;
    totalCost: number;
    baseCurrency: Currency;
    onClick: () => void;
}

export const EventCard: React.FC<EventCardProps> = React.memo(({ event, people, userProfile, totalCost, baseCurrency, onClick }) => {
    const eventPeople = resolveEventParticipants({
        event,
        people,
        userProfile,
        fallbackCurrency: baseCurrency,
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-tertiary/10 text-tertiary border-tertiary/20';
            case 'completed': return 'bg-primary/10 text-primary border-primary/20';
            case 'archived': return 'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20';
            default: return 'bg-on-surface-variant/10 text-on-surface-variant';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active': return <PlayCircle size={14} />;
            case 'completed': return <CheckCircle2 size={14} />;
            case 'archived': return <Archive size={14} />;
            default: return null;
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'TBD';
        return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <m.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={onClick}
            className="group relative overflow-hidden rounded-xl border border-outline/10 bg-surface-container-low hover:bg-surface-container hover:border-outline/20 transition-all cursor-pointer shadow-sm hover:shadow-elevation-2 hover:-translate-y-0.5"
        >
            {/* Background Image or Gradient */}
            <div className="h-32 w-full relative overflow-hidden bg-surface-container-high">
                {event.imageUrl ? (
                    <img
                        src={event.imageUrl}
                        alt={event.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className={clsx("w-full h-full flex items-center justify-center", event.color || "bg-primary/5")}>
                        <MapPin size={48} className="text-primary/20" />
                    </div>
                )}

                {/* Status Badge */}
                <div className={clsx(
                    "absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 backdrop-blur-md",
                    getStatusColor(event.status)
                )}>
                    {getStatusIcon(event.status)}
                    <span className="capitalize">{event.status}</span>
                </div>
            </div>

            <div className="p-4 space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-on-surface group-hover:text-primary transition-colors">
                        {event.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant mt-1">
                        <Calendar size={14} />
                        <span>
                            {event.startDate
                                ? `${formatDate(event.startDate)}${event.endDate ? ` - ${formatDate(event.endDate)}` : ' (Ongoing)'}`
                                : event.endDate
                                    ? `Ended ${formatDate(event.endDate)}`
                                    : 'No dates set'
                            }
                        </span>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-outline/10">
                    <div className="flex -space-x-2">
                        {eventPeople.slice(0, 3).map((person) => (
                            <div
                                key={person.id}
                                className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container flex items-center justify-center text-xs font-medium overflow-hidden"
                                title={getParticipantTooltipLabel(person)}
                            >
                                {person.avatar ? (
                                    <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span style={{ color: person.color }}>{getParticipantInitials(person.name)}</span>
                                )}
                            </div>
                        ))}
                        {eventPeople.length > 3 && (
                            <div className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-high flex items-center justify-center text-xs font-medium text-on-surface-variant">
                                +{eventPeople.length - 3}
                            </div>
                        )}
                    </div>

                    <div className="text-right">
                        <p className="text-xs text-on-surface-variant mb-0.5">Total Spent</p>
                        <p className="font-semibold text-on-surface">
                            {formatCurrency(totalCost, baseCurrency)}
                        </p>
                    </div>
                </div>
            </div>
        </m.div>
    );
});

EventCard.displayName = 'EventCard';
