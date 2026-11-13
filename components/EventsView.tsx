import React, { useMemo, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { AppState, Event, Currency } from '../types';
import { EventCard } from './EventCard';
import { convertCurrency } from '../utils/currencyUtils';
import { sortEvents } from '../utils/eventVisuals';
import { spendingExpenses } from '../domain/settle';
import { TRANSLATIONS } from '../constants';
import { Segmented } from './ui/Segmented';
import { BlockHead } from './home/parts';

interface EventsViewProps {
    state: AppState;
    onCreateEvent: () => void;
    onSelectEvent: (event: Event) => void;
}

const CURRENCIES: Currency[] = ['EUR', 'USD', 'RSD'];

export const EventsView: React.FC<EventsViewProps> = ({ state, onCreateEvent, onSelectEvent }) => {
    const [viewCurrency, setViewCurrency] = useState<Currency>(state.baseCurrency);
    const t = TRANSLATIONS[state.language];
    const rates = state.rates.rates;

    const events = useMemo(() => sortEvents(state.events), [state.events]);

    // Shared expenses plus expense transactions linked to the event, as on the detail screen.
    const totals = useMemo(() => {
        const result = new Map<string, number>();
        const add = (eventId: string | undefined, amount: number, currency: Currency) => {
            if (!eventId) return;
            result.set(eventId, (result.get(eventId) ?? 0) + convertCurrency(amount, currency, viewCurrency, rates));
        };
        // Settlements move money between people; they are not spending.
        spendingExpenses(state.sharedExpenses).forEach(expense => add(expense.eventId, expense.amount, expense.currency));
        state.transactions
            .filter(transaction => transaction.type === 'expense')
            .forEach(transaction => add(transaction.eventId, transaction.splitDetails?.totalAmount || transaction.amount, transaction.currency));
        return result;
    }, [state.sharedExpenses, state.transactions, viewCurrency, rates]);

    // The event happening now, or else the most recent one, gets the large card.
    const featured = events[0];
    const rest = events.filter(event => event !== featured);

    const card = (event: Event, isFeatured = false) => (
        <EventCard
            key={event.id}
            event={event}
            people={state.people}
            userProfile={state.userProfile}
            totalCost={totals.get(event.id) ?? 0}
            baseCurrency={viewCurrency}
            onClick={() => onSelectEvent(event)}
            language={state.language}
            featured={isFeatured}
        />
    );

    return (
        <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-1 pb-8">
            <header className="flex min-h-[60px] items-center gap-2">
                <div className="min-w-0 flex-1">
                    <h1 className="text-[28px] font-bold leading-tight tracking-[-0.6px]">{t.events}</h1>
                    <p className="truncate text-[13px] text-muted">{t.eventsSubtitle}</p>
                </div>
                <button
                    type="button"
                    onClick={onCreateEvent}
                    aria-label={t.newEvent}
                    title={t.newEvent}
                    className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                >
                    <Plus size={22} aria-hidden="true" />
                </button>
            </header>

            {events.length === 0 ? (
                <section className="paper-tile flex flex-col items-center gap-3 px-6 py-10 text-center">
                    <span className="accent-card flex h-14 w-14 items-center justify-center rounded-[20px] text-white" aria-hidden="true">
                        <MapPin size={26} />
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
            ) : (
                <>
                    <div className="flex justify-end">
                        <Segmented<Currency>
                            size="sm"
                            ariaLabel={t.displayCurrency}
                            value={viewCurrency}
                            onChange={setViewCurrency}
                            options={CURRENCIES.map(currency => ({ value: currency, label: currency }))}
                        />
                    </div>

                    {featured && (
                        <section className="flex flex-col gap-2">
                            <BlockHead title={featured.status === 'active' ? t.eventsHappeningNow : t.eventsLatest} className="mb-0 px-1" />
                            {card(featured, true)}
                        </section>
                    )}

                    {rest.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <BlockHead title={t.eventsOther} className="mb-0 px-1" />
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {rest.map(event => card(event))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
};
