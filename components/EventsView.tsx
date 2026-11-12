import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, MapPin } from 'lucide-react';
import { AppState, Event, Currency } from '../types';
import { EventCard } from './EventCard';
import { convertCurrency } from '../utils/currencyUtils';
import { EmptyState } from './EmptyState';
import clsx from 'clsx';
import { MOTION } from '../config';

interface EventsViewProps {
    state: AppState;
    onCreateEvent: () => void;
    onSelectEvent: (event: Event) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({ state, onCreateEvent, onSelectEvent }) => {
    const [viewCurrency, setViewCurrency] = useState<Currency>(state.baseCurrency);

    const filteredEvents = [...state.events]
        .sort((a, b) => {
            // Sort by status priority first: active > completed > archived
            const statusPriority = { active: 0, completed: 1, archived: 2 };
            const priorityA = statusPriority[a.status] ?? 99;
            const priorityB = statusPriority[b.status] ?? 99;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Then sort by date descending
            const dateA = a.startDate || '';
            const dateB = b.startDate || '';
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });

    const getEventTotal = (eventId: string) => {
        return state.sharedExpenses
            .filter(e => e.eventId === eventId)
            .reduce((sum, e) => {
                return sum + convertCurrency(e.amount, e.currency, viewCurrency, state.rates.rates);
            }, 0);
    };



    return (
        <motion.div
            initial={MOTION.view.initial}
            animate={MOTION.view.animate}
            exit={MOTION.view.exit}
            transition={MOTION.view.transition}
            className="space-y-6 pb-24"
        >
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold font-display text-on-surface">Events</h1>
                    <p className="text-on-surface-variant mt-1">Track your trips and travel expenses</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-surface-container rounded-full p-1 flex gap-1">
                        {(['EUR', 'USD', 'RSD'] as Currency[]).map(c => (
                            <button
                                key={c}
                                onClick={() => setViewCurrency(c)}
                                className={clsx(
                                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                    viewCurrency === c
                                        ? "bg-surface text-primary shadow-sm"
                                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface/50"
                                )}
                            >
                                {c}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={onCreateEvent}
                        className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                        title="New Event"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            </header>

            {/* Events Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                    {filteredEvents.map(event => (
                        <EventCard
                            key={event.id}
                            event={event}
                            people={state.people}
                            userProfile={state.userProfile}
                            totalCost={getEventTotal(event.id)}
                            baseCurrency={viewCurrency}
                            onClick={() => onSelectEvent(event)}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {filteredEvents.length === 0 && (
                <EmptyState
                    icon={MapPin}
                    title="No events yet"
                    description="Start a new adventure by creating an event to track group expenses"
                    action={{ label: 'Create Event', onClick: onCreateEvent }}
                />
            )}
        </motion.div>
    );
};
