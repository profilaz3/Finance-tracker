import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { Event, Person, Transaction } from '../../types';
import { parseOptionalNumberInput } from '../../utils/numberInput';

interface MoreOptionsFieldsProps {
    edited: Transaction;
    setEdited: React.Dispatch<React.SetStateAction<Transaction | null>>;
    people: Person[];
    events: Event[];
    isInternalTransfer: boolean;
    showMoreOptions: boolean;
    onToggle: () => void;
    t: typeof TRANSLATIONS['en'];
}

export const MoreOptionsFields: React.FC<MoreOptionsFieldsProps> = ({
    edited,
    setEdited,
    people,
    events,
    isInternalTransfer,
    showMoreOptions,
    onToggle,
    t
}) => (
    <>
        <button
            type="button"
            onClick={onToggle}
            className="flex h-11 w-full items-center justify-between rounded-[14px] px-1 text-[15px] text-muted transition-colors hover:text-on-surface"
        >
            <span className="font-medium">{t.moreOptions}</span>
            {showMoreOptions
                ? <ChevronUp size={16} aria-hidden="true" />
                : <ChevronDown size={16} aria-hidden="true" />}
        </button>

        <AnimatePresence initial={false}>
            {showMoreOptions && (
                <m.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                >
                    <div className="space-y-4 pb-1">
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label htmlFor="edit-tx-date" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.date}</label>
                                <input
                                    id="edit-tx-date"
                                    type="date"
                                    value={(() => {
                                        const date = new Date(edited.date);
                                        const year = date.getFullYear();
                                        const month = String(date.getMonth() + 1).padStart(2, '0');
                                        const day = String(date.getDate()).padStart(2, '0');
                                        return `${year}-${month}-${day}`;
                                    })()}
                                    onChange={e => {
                                        const [year, month, day] = e.target.value.split('-');
                                        const newDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                        const existingTime = new Date(edited.date);
                                        newDate.setHours(existingTime.getHours(), existingTime.getMinutes(), 0, 0);
                                        setEdited({ ...edited, date: newDate.toISOString() });
                                    }}
                                    className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                            <div className="w-28">
                                <label htmlFor="edit-tx-time" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.time}</label>
                                <input
                                    id="edit-tx-time"
                                    type="time"
                                    value={(() => {
                                        const date = new Date(edited.date);
                                        const hours = String(date.getHours()).padStart(2, '0');
                                        const minutes = String(date.getMinutes()).padStart(2, '0');
                                        return `${hours}:${minutes}`;
                                    })()}
                                    onChange={e => {
                                        const date = new Date(edited.date);
                                        const [hours, minutes] = e.target.value.split(':');
                                        date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                                        setEdited({ ...edited, date: date.toISOString() });
                                    }}
                                    className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                        </div>

                        {!isInternalTransfer && (
                            <div>
                                <label htmlFor="edit-tx-person" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.person}</label>
                                <select
                                    id="edit-tx-person"
                                    value={edited.personId || ''}
                                    onChange={e => setEdited({ ...edited, personId: e.target.value || undefined })}
                                    className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                                >
                                    <option value="">{t.none}</option>
                                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div>
                            <label htmlFor="edit-tx-event" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.eventOptional}</label>
                            <select
                                id="edit-tx-event"
                                value={edited.eventId || ''}
                                onChange={e => setEdited({ ...edited, eventId: e.target.value || undefined })}
                                className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                            >
                                <option value="">{t.none}</option>
                                {events
                                    .filter(e => e.status !== 'archived' || e.id === edited.eventId)
                                    .map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="edit-tx-fees" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.feesUsd}</label>
                            <input
                                id="edit-tx-fees"
                                type="number"
                                value={edited.fees || ''}
                                onChange={e => setEdited({ ...edited, fees: parseOptionalNumberInput(e.target.value) })}
                                placeholder="0.00"
                                className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>

                        <div>
                            <label htmlFor="edit-tx-note" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.note}</label>
                            <input
                                id="edit-tx-note"
                                value={edited.note || ''}
                                onChange={e => setEdited({ ...edited, note: e.target.value })}
                                placeholder={t.addNotePlaceholder}
                                className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>
                    </div>
                </m.div>
            )}
        </AnimatePresence>
    </>
);
