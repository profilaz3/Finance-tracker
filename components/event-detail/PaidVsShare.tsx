import React, { useMemo } from 'react';
import clsx from 'clsx';
import type { AppLanguage } from '../../utils/locale';
import type { Currency, ExchangeRates, Person, SharedExpense } from '../../types';
import { calculateEventPersonTotals } from '../../utils/eventSummarySelectors';
import type { EventViewer } from '../../domain/eventViewer';
import { Avatar } from '../home/parts';
import { eventAmount, type EventStrings } from './eventStrings';

interface PaidVsShareProps {
    people: Person[];
    /** Spending only (no settlements): what each person paid and what their part is. */
    spending: SharedExpense[];
    /** Balances from the settle-up plan, so they match the payments below to the unit. */
    balances: Map<string, number>;
    viewer: Pick<EventViewer, 'selfIds'>;
    currency: Currency;
    rates: ExchangeRates;
    language: AppLanguage;
    s: EventStrings;
}

/**
 * Who paid what against their share: one row per person with a bar of what they paid and a tick
 * at their share, and what they get back or still owe.
 */
export const PaidVsShare: React.FC<PaidVsShareProps> = ({ people, spending, balances, viewer, currency, rates, language, s }) => {
    const rows = useMemo(() => {
        const totals = calculateEventPersonTotals({ people, expenses: spending, summaryCurrency: currency, rates: rates.rates });
        return totals
            .map(total => {
                const person = people.find(entry => entry.id === total.personId)!;
                return { person, paid: total.totalPaid, share: total.totalOwed, balance: balances.get(total.personId) ?? 0, self: viewer.selfIds.has(total.personId) };
            })
            .filter(row => row.paid > 0.004 || row.share > 0.004 || Math.abs(row.balance) > 0.004)
            // Most owed first, the one who owes most last.
            .sort((left, right) => right.balance - left.balance || right.paid - left.paid);
    }, [people, spending, currency, rates.rates, balances, viewer.selfIds]);

    if (rows.length === 0) return null;
    const money = (value: number) => eventAmount(value, currency, language);
    const scale = Math.max(...rows.flatMap(row => [row.paid, row.share]), 0.01);
    // One share for everyone (an even split) goes in the legend; otherwise each row's tick says it.
    const shares = rows.map(row => Math.round(row.share * 100));
    const evenShare = shares.every(share => share === shares[0]) ? rows[0].share : null;

    return (
        <section aria-labelledby="event-paid-title" className="paper-tile px-4 pb-1.5 pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="event-paid-title" className="text-[17px] font-bold tracking-[-0.2px]">{s.paidVsShare}</h2>
                <span className="flex items-center gap-2.5 text-[12.5px] font-medium text-muted" aria-hidden="true">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-3.5 rounded-full bg-accent" />{s.legendPaid}</span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-3 w-[2px] rounded-full bg-on-surface" />
                        {evenShare !== null ? s.legendShare.replace('{amount}', money(evenShare)) : s.legendShareOnly}
                    </span>
                </span>
            </div>
            <ul className="mt-1">
                {rows.map((row, index) => {
                    const name = row.self ? s.you : row.person.name;
                    const settled = Math.abs(row.balance) < 0.005;
                    return (
                        <li key={row.person.id} className={clsx('py-3', index < rows.length - 1 && 'border-b border-hair')}>
                            <div className="flex items-center gap-3">
                                <Avatar name={row.person.name} color={row.person.color} image={row.person.avatar} size={36} />
                                <p className="min-w-0 flex-1 text-[15px] leading-snug">
                                    <span className="font-semibold">{name}</span>{' '}
                                    <span className="whitespace-nowrap text-muted">{s.paidAmount.replace('{amount}', money(row.paid))}</span>
                                    <span className="sr-only">, {s.legendShareOnly} {money(row.share)}</span>
                                </p>
                                <span
                                    className={clsx(
                                        'shrink-0 whitespace-nowrap text-[15.5px] font-bold tabular-nums',
                                        settled ? 'font-semibold text-muted' : row.balance > 0 ? 'text-pos' : 'text-neg',
                                    )}
                                >
                                    {settled ? s.personEven : `${row.balance > 0 ? '+' : '−'}${money(Math.abs(row.balance))}`}
                                </span>
                            </div>
                            <div className="relative mt-2.5 h-2 rounded-full bg-chip" aria-hidden="true">
                                <span
                                    className="absolute inset-y-0 left-0 min-w-2 rounded-full bg-accent"
                                    style={{ width: `${Math.min(100, (row.paid / scale) * 100)}%`, opacity: row.paid > 0.004 ? 1 : 0.35 }}
                                />
                                <span
                                    className="absolute -bottom-1 -top-1 w-[2px] rounded-full bg-on-surface"
                                    style={{ left: `calc(${Math.min(100, (row.share / scale) * 100)}% - 1px)` }}
                                />
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
