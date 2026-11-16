import React from 'react';
import clsx from 'clsx';
import { Check, UserX } from 'lucide-react';
import type { Person } from '../../types';
import type { ViewerPick } from '../../domain/eventViewer';
import { getTranslations } from '../../utils/i18n';
import { GlassSheet } from '../ui/GlassSheet';
import { Avatar } from '../home/parts';

interface ViewerPickSheetProps {
    isOpen: boolean;
    /** Closing without an answer: treated as "not listed" for now, asked again next time. */
    onClose: () => void;
    /** The participants a guest can be (everyone but the organizer). */
    options: Person[];
    /** The current answer, to mark it. */
    current: ViewerPick | undefined;
    onPick: (pick: ViewerPick) => void;
    /** The guest's own invite placeholder, if the event has one (likely them). */
    ownInviteId?: string;
}

const row = 'flex min-h-[56px] w-full items-center gap-3 rounded-[20px] px-3 py-2 text-left transition-colors';

/** "Which one are you?" for a guest in a shared event (domain/eventViewer). */
export const ViewerPickSheet: React.FC<ViewerPickSheetProps> = ({ isOpen, onClose, options, current, onPick, ownInviteId }) => {
    const t = getTranslations();
    // Their own invite first: it is them, if the organizer has not linked it to a person yet.
    const ordered = ownInviteId
        ? [...options.filter(person => person.id === ownInviteId), ...options.filter(person => person.id !== ownInviteId)]
        : options;

    return (
        <GlassSheet
            isOpen={isOpen}
            onClose={onClose}
            title={t.eventWhoAreYou}
            closeLabel={t.close}
            footer={(
                <button
                    type="button"
                    onClick={onClose}
                    className="h-11 w-full rounded-full text-[15px] font-semibold text-muted hover:bg-chip"
                >
                    {t.eventNotNow}
                </button>
            )}
        >
            <div className="flex flex-col gap-3 px-1 pb-2">
                <p className="px-2 text-[14px] text-muted">{t.eventWhoAreYouHint}</p>
                <div role="radiogroup" aria-label={t.eventWhoAreYou} className="flex flex-col gap-1">
                    {ordered.map(person => {
                        const selected = current === person.id;
                        return (
                            <button
                                key={person.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => onPick(person.id)}
                                className={clsx(row, selected ? 'bg-accent-soft' : 'hover:bg-chip')}
                            >
                                <Avatar name={person.name} color={person.color} image={person.avatar} size={40} />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-[16px] font-semibold">{person.name}</span>
                                    {person.id === ownInviteId && <span className="text-[13px] text-muted">{t.eventYourInvite}</span>}
                                </span>
                                {selected && <Check size={18} className="shrink-0 text-accent" aria-hidden="true" />}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        role="radio"
                        aria-checked={current === null}
                        onClick={() => onPick(null)}
                        className={clsx(row, 'mt-1 border-t border-hair pt-3', current === null ? 'bg-accent-soft' : 'hover:bg-chip')}
                    >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted" aria-hidden="true">
                            <UserX size={19} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[16px] font-semibold">{t.eventNotListed}</span>
                            <span className="text-[13px] text-muted">{t.eventNotListedHint}</span>
                        </span>
                        {current === null && <Check size={18} className="shrink-0 text-accent" aria-hidden="true" />}
                    </button>
                </div>
            </div>
        </GlassSheet>
    );
};
