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
            className="w-full flex items-center justify-between py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
            <span className="font-medium">More options</span>
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
                                <label htmlFor="edit-tx-date" className="text-xs text-on-surface-variant mb-1 block">Date</label>
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
                                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
                                />
                            </div>
                            <div className="w-28">
                                <label htmlFor="edit-tx-time" className="text-xs text-on-surface-variant mb-1 block">Time</label>
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
                                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
                                />
                            </div>
                        </div>

                        {!isInternalTransfer && (
                            <div>
                                <label htmlFor="edit-tx-person" className="text-xs text-on-surface-variant mb-1 block">{t.person}</label>
                                <select
                                    id="edit-tx-person"
                                    value={edited.personId || ''}
                                    onChange={e => setEdited({ ...edited, personId: e.target.value || undefined })}
                                    className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
                                >
                                    <option value="">{t.none}</option>
                                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div>
                            <label htmlFor="edit-tx-event" className="text-xs text-on-surface-variant mb-1 block">Event (Optional)</label>
                            <select
                                id="edit-tx-event"
                                value={edited.eventId || ''}
                                onChange={e => setEdited({ ...edited, eventId: e.target.value || undefined })}
                                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
                            >
                                <option value="">None</option>
                                {events
                                    .filter(e => e.status !== 'archived' || e.id === edited.eventId)
                                    .map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="edit-tx-fees" className="text-xs text-on-surface-variant mb-1 block">Fees (USD)</label>
                            <input
                                id="edit-tx-fees"
                                type="number"
                                value={edited.fees || ''}
                                onChange={e => setEdited({ ...edited, fees: parseOptionalNumberInput(e.target.value) })}
                                placeholder="0.00"
                                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
                            />
                        </div>

                        <div>
                            <label htmlFor="edit-tx-note" className="text-xs text-on-surface-variant mb-1 block">{t.note}</label>
                            <input
                                id="edit-tx-note"
                                value={edited.note || ''}
                                onChange={e => setEdited({ ...edited, note: e.target.value })}
                                placeholder="Add a note..."
                                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
                            />
                        </div>
                    </div>
                </m.div>
            )}
        </AnimatePresence>
    </>
);
