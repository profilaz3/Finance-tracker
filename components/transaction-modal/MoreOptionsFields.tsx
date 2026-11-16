import React from 'react';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { AlertCircle, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { Event, Person } from '../../types';
import { AmountInput } from '../ui/AmountInput';
import { formatCurrency } from '../../utils/formatters';
import type { EntryForm } from './useEntryForm';
import type { EntryStrings } from './entryStrings';
import { TimeField } from './DateFields';

interface MoreOptionsFieldsProps {
    form: EntryForm;
    people: Person[];
    events: Event[];
    showMoreOptions: boolean;
    onToggle: () => void;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
    s: EntryStrings;
    /** Fields shown last when open (the receipt's lines). */
    children?: React.ReactNode;
}

const fieldClass = 'h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent';

/** What the folded section holds: the values that are set, or what can be set there. */
const moreOptionsSummary = (
    form: EntryForm,
    people: Person[],
    events: Event[],
    language: 'en' | 'sr',
    t: typeof TRANSLATIONS['en'],
    s: EntryStrings,
): string => {
    const { edited } = form;
    const isTransfer = form.kind === 'transfer';
    const parts = [
        !isTransfer && edited.personId ? people.find(p => p.id === edited.personId)?.name : undefined,
        !isTransfer && edited.eventId ? events.find(e => e.id === edited.eventId)?.name : undefined,
        form.feeShown ? t.feeAmount.replace('{amount}', formatCurrency(form.feeShown, form.feeCurrency, language)) : undefined,
    ].filter((part): part is string => !!part);
    if (parts.length > 0) return parts.join(' · ');
    return [isTransfer ? s.moreHintTransfer : s.moreHint, edited.receiptData ? s.receipt : ''].filter(Boolean).join(', ');
};

export const MoreOptionsFields: React.FC<MoreOptionsFieldsProps> = ({
    form,
    people,
    events,
    showMoreOptions,
    onToggle,
    language,
    t,
    s,
    children,
}) => {
    const { edited, setEdited, errors } = form;
    const summary = moreOptionsSummary(form, people, events, language, t, s);
    const isTransfer = form.kind === 'transfer';
    return (
        <>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={showMoreOptions}
                className="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-[14px] px-1.5 text-left text-[14px] text-muted"
            >
                <SlidersHorizontal size={17} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                    <b className="font-semibold text-on-surface">{s.more}</b>
                    {!showMoreOptions && <span className="font-medium"> · {summary}</span>}
                </span>
                <ChevronDown size={17} aria-hidden="true" className={clsx('shrink-0 transition-transform duration-200', showMoreOptions && 'rotate-180')} />
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
                        <div className="space-y-4 px-0.5 pb-1 pt-2">
                            <TimeField date={edited.date} onChange={date => setEdited(prev => ({ ...prev, date }))} t={t} />
                            {!isTransfer && (
                                <div>
                                    <label htmlFor="edit-tx-person" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.person}</label>
                                    <select
                                        id="edit-tx-person"
                                        value={edited.personId || ''}
                                        onChange={e => form.setPerson(e.target.value || undefined)}
                                        className={fieldClass}
                                    >
                                        <option value="">{t.none}</option>
                                        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {!isTransfer && (
                                <div>
                                    <label htmlFor="edit-tx-event" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.eventOptional}</label>
                                    <select
                                        id="edit-tx-event"
                                        value={edited.eventId || ''}
                                        onChange={e => setEdited(prev => ({ ...prev, eventId: e.target.value || undefined }))}
                                        className={fieldClass}
                                    >
                                        <option value="">{t.none}</option>
                                        {events
                                            .filter(e => e.status !== 'archived' || e.id === edited.eventId)
                                            .map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div>
                                {/* Typed in the entry's currency; stored in USD (see useEntryForm). */}
                                <label htmlFor="edit-tx-fees" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">
                                    {t.feeIn.replace('{currency}', form.feeCurrency)}
                                </label>
                                <AmountInput
                                    id="edit-tx-fees"
                                    language={language}
                                    value={form.feeShown}
                                    emptyWhenZero
                                    onValueChange={form.setFees}
                                    placeholder="0"
                                    aria-invalid={!!errors.fees}
                                    className={`${fieldClass} ${errors.fees ? 'ring-2 ring-neg' : ''}`}
                                />
                                {errors.fees && (
                                    <div role="alert" className="mt-1 flex items-center gap-1 px-1 text-[12px] text-neg">
                                        <AlertCircle size={12} aria-hidden="true" />
                                        <span>{errors.fees}</span>
                                    </div>
                                )}
                            </div>
                            {children}
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </>
    );
};
