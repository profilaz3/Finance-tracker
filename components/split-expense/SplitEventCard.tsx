import React, { useMemo } from 'react';
import clsx from 'clsx';
import type { AppState, Event, Person, Transaction } from '../../types';
import { useSessionIdentity } from '../../hooks/useSessionIdentity';
import { formatMoney } from '../../utils/locale';
import { stableColor } from '../../utils/stableColor';
import { Avatar } from '../home/parts';
import { eventSplitPreview, type EventPreviewPerson } from './eventPreview';
import { SelfAvatar } from './SplitHero';
import type { SplitStrings } from './splitStrings';

interface SplitEventCardProps {
    event: Event;
    state: AppState;
    /** The split as it would be saved; without it the card shows the event as it is. */
    pending?: Transaction;
    userProfile?: Person;
    meLetter: string;
    language: 'en' | 'sr';
    s: SplitStrings;
}

/** How many payers get their own part of the bar; the rest share one. */
const BAR_PAYERS = 3;

/**
 * The event the split goes into, as it will look once the split is saved: your balance, who paid
 * how much, and what you pay or get at settle up.
 */
export const SplitEventCard: React.FC<SplitEventCardProps> = ({ event, state, pending, userProfile, meLetter, language, s }) => {
    const identity = useSessionIdentity();
    const userId = identity?.userId;
    const preview = useMemo(() => eventSplitPreview(event, state, userId, pending), [event, state, userId, pending]);
    if (!preview) return null;

    const money = (value: number) => {
        const amount = Math.abs(value);
        const digits = Number.isInteger(Math.round(amount * 100) / 100) ? 0 : 2;
        return formatMoney(amount, preview.currency, language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    };
    const nameOf = (person: EventPreviewPerson) => (person.self ? s.you : person.name);
    const colourOf = (person: EventPreviewPerson) => (person.self ? 'rgb(var(--accent-rgb))' : person.color || stableColor(person.name));
    const shown = preview.payers.slice(0, BAR_PAYERS);
    const rest = preview.payers.slice(BAR_PAYERS).reduce((sum, person) => sum + person.amount, 0);
    const bar = [
        ...shown.map(person => ({ key: person.id, name: nameOf(person), amount: person.amount, colour: colourOf(person) })),
        ...(rest > 0.004 ? [{ key: 'others', name: s.others, amount: rest, colour: 'var(--paper-muted)' }] : []),
    ];
    const status = preview.mine > 0 ? s.owed : preview.mine < 0 ? s.owe : s.even;

    return (
        <section aria-labelledby="split-event-label" className="paper-tile px-4 pb-4 pt-3.5">
            <h3 id="split-event-label" className="truncate text-[13px] font-semibold text-muted">
                {(pending ? s.eventAfter : s.eventSoFar).replace('{event}', event.name)}
            </h3>
            <p className="mt-1 flex items-baseline justify-between gap-3" aria-live="polite">
                <span className="min-w-0 text-[16px] font-semibold">{status}</span>
                {preview.mine !== 0 && (
                    <span className={clsx('shrink-0 whitespace-nowrap text-[22px] font-bold tabular-nums tracking-[-0.3px]', preview.mine > 0 ? 'text-pos' : 'text-neg')}>
                        {money(preview.mine)}
                    </span>
                )}
            </p>

            {bar.length > 0 && (
                <>
                    <div className="mt-3 flex h-2 gap-1" aria-hidden="true">
                        {bar.map(part => (
                            <span key={part.key} className="min-w-1.5 rounded-full" style={{ flexGrow: part.amount, flexBasis: 0, background: part.colour }} />
                        ))}
                    </div>
                    <ul aria-label={s.paidIn} className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] font-medium text-muted">
                        {bar.map(part => (
                            <li key={part.key} className="flex items-center gap-1.5 whitespace-nowrap">
                                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: part.colour }} />
                                {part.name} <span className="tabular-nums text-on-surface">{money(part.amount)}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {preview.moves.slice(0, 2).map(move => (
                <div key={move.id} className="mt-3 flex items-center gap-2.5 border-t border-hair pt-3">
                    {move.self
                        ? <SelfAvatar userProfile={userProfile} size={28} letter={meLetter} />
                        : <Avatar name={move.name} color={move.color} image={move.image} size={28} />}
                    <span className="min-w-0 flex-1 text-[14px] font-medium">
                        {(move.amount > 0 ? s.settlePaysYou : s.settleYouPay).replace('{name}', move.name)}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums">{money(move.amount)}</span>
                </div>
            ))}
        </section>
    );
};
