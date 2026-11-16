import React, { useState } from 'react';
import clsx from 'clsx';
import {
    ArrowLeft, Camera, CheckCircle2, ChevronDown, Loader2, MoreHorizontal, Pencil, Plane, Play, RotateCcw, Share2, Trash2, UserPlus, X,
} from 'lucide-react';
import type { Currency, Event, HomeHeaderTone, Person } from '../../types';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import { ConfirmDialog } from '../ConfirmDialog';
import { eventRange } from '../EventCard';
import { eventDayOf } from '../shared/sharedSummary';
import { HeroIconButton, HeroMenu, ON_COLOUR, ScreenHero, type HeroMenuItem } from '../ui/ScreenHero';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { Big, fitFont } from '../home/parts';
import type { EventPermissions } from '../../domain/eventPermissions';
import type { EventStrings } from './eventStrings';

export interface EventHeaderTile {
    label: string;
    value: string;
    sub: string;
}

interface EventHeaderProps {
    event: Event;
    eventPeople: Person[];
    tone: HomeHeaderTone;
    onBack: () => void;
    /** Beside the Shared list: Close (×) instead of the back arrow. */
    inPane?: boolean;
    onUpdateEvent: (id: string, updates: Partial<Event>) => void;
    onDeleteEvent: (id: string) => void;
    onOpenShareModal: () => void;
    /** Opens the edit sheet (name, dates, description, participants). */
    onEditEvent?: () => void;
    /** Opens the edit sheet at its people; left out when the viewer cannot change who is in it. */
    onAddPeople?: () => void;
    isUploadingPhoto: boolean;
    imageVersion: number;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    openPicker: () => void;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    language: 'en' | 'sr';
    /** What the signed-in user may do (domain/eventPermissions). */
    permissions: Pick<EventPermissions, 'canDelete' | 'canShare'>;
    /** The currency the screen shows its sums in. */
    currency: Currency;
    onCurrencyChange: (currency: Currency) => void;
    /** "You're owed", "You owe", "Left to settle" and the like. */
    balanceLabel: string;
    balance: string;
    /** "4 expenses · ends Tue, 17 Nov". */
    facts: string;
    tiles: EventHeaderTile[];
    s: EventStrings;
}

/** How many names the line under the title spells out before "+N". */
const NAMES_SHOWN = 3;

/**
 * The top of an event, in the Home header colour: its name and where it is in time, who is in it,
 * your balance, and what was spent, your share and what you paid. Rarer actions sit in the ⋯ menu.
 */
export const EventHeader: React.FC<EventHeaderProps> = ({
    event,
    eventPeople,
    tone,
    onBack,
    inPane = false,
    onDeleteEvent,
    onUpdateEvent,
    onOpenShareModal,
    onEditEvent,
    onAddPeople,
    isUploadingPhoto,
    imageVersion,
    fileInputRef,
    openPicker,
    handleFileChange,
    language,
    permissions,
    currency,
    onCurrencyChange,
    balanceLabel,
    balance,
    facts,
    tiles,
    s,
}) => {
    const t = TRANSLATIONS[language];
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const dayOf = event.status === 'active' ? eventDayOf(event) : null;
    const startsLater = event.status === 'active' && !!event.startDate && new Date(event.startDate).getTime() > Date.now();
    const status = dayOf
        ? s.dayOf.replace('{day}', String(dayOf.day)).replace('{total}', String(dayOf.total))
        : startsLater ? s.upcoming
            : event.status === 'completed' ? s.ended
                : event.status === 'archived' ? t.eventStatusArchived
                    : t.eventStatusActive;
    const names = eventPeople.slice(0, NAMES_SHOWN).map(person => person.name).join(', ')
        + (eventPeople.length > NAMES_SHOWN ? ` +${eventPeople.length - NAMES_SHOWN}` : '');

    const menu: HeroMenuItem[] = [
        ...(onEditEvent ? [{ icon: Pencil, label: t.editEvent, onSelect: onEditEvent }] : []),
        { icon: isUploadingPhoto ? Loader2 : Camera, label: isUploadingPhoto ? t.uploading : t.changePhoto, onSelect: openPicker, disabled: isUploadingPhoto },
        ...(permissions.canShare ? [{ icon: Share2, label: s.shareEvent, onSelect: onOpenShareModal }] : []),
        ...(event.status === 'active'
            ? [{ icon: CheckCircle2, label: s.endEvent, onSelect: () => onUpdateEvent(event.id, { endDate: new Date().toISOString(), status: 'completed' }) }]
            : event.status === 'completed'
                ? [{ icon: RotateCcw, label: s.reopen, onSelect: () => onUpdateEvent(event.id, { endDate: undefined, status: 'active' }) }]
                : [{ icon: Play, label: s.startEvent, onSelect: () => onUpdateEvent(event.id, { startDate: new Date().toISOString(), status: 'active' }) }]),
        // Owner (or team admin) only, in any state; the dialog below confirms.
        ...(permissions.canDelete ? [{ icon: Trash2, label: s.deleteEvent, onSelect: () => setIsConfirmingDelete(true), danger: true }] : []),
    ];

    return (
        <ScreenHero tone={tone} label={event.name}>
            {/* The event photo, tinted by the header colour so white text stays readable. */}
            {event.imageUrl && (
                <img
                    key={`${event.imageUrl}-v${imageVersion}`}
                    src={`${event.imageUrl}?v=${imageVersion}`}
                    alt=""
                    className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30 mix-blend-luminosity"
                />
            )}
            <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
                <HeroIconButton icon={inPane ? X : ArrowLeft} label={inPane ? t.close : t.backToEvents} onClick={onBack} />
                <span className="flex-1" />
                {isUploadingPhoto && (
                    <span className={clsx(ON_COLOUR, 'flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white')} role="status">
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        {t.uploading}
                    </span>
                )}
                {onAddPeople && <HeroIconButton icon={UserPlus} label={s.addPeople} onClick={onAddPeople} />}
                <HeroMenu label={t.eventActions} icon={MoreHorizontal} items={menu} />
            </div>

            <div className="px-4 pb-[42px] pt-1 md:px-5 md:pb-5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <h1 className="min-w-0 break-words text-[30px] font-bold leading-[1.12] tracking-[-0.03em] text-white">{event.name}</h1>
                    <span className={clsx(ON_COLOUR, 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold text-white')}>
                        {dayOf ? <Plane size={13} aria-hidden="true" /> : event.status === 'active' && !startsLater && <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />}
                        {status}
                    </span>
                </div>
                <p className="mt-1.5 text-[14.5px] font-medium text-white/80">
                    {[eventRange(event, language), names].filter(Boolean).join(' · ')}
                </p>
                {event.description && <p className="mt-1 line-clamp-2 text-[13.5px] text-white/65">{event.description}</p>}

                <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="min-w-0 text-[14.5px] font-semibold text-white/80">{balanceLabel}</p>
                    <span className={clsx(ON_COLOUR, 'relative flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-white')}>
                        <CurrencyFlag currency={currency} size={24} />
                        <span className="text-[13px] font-bold">{currency}</span>
                        <ChevronDown size={14} aria-hidden="true" className="text-white/65" />
                        <select
                            aria-label={s.showIn}
                            value={currency}
                            onChange={event => onCurrencyChange(event.target.value as Currency)}
                            className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
                        >
                            {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
                        </select>
                    </span>
                </div>
                <div style={{ containerType: 'inline-size' }}>
                    <p
                        className="whitespace-nowrap font-bold leading-[1.08] tracking-[-0.045em] tabular-nums text-white"
                        style={{ fontSize: fitFont(50, balance, 0.6) }}
                    >
                        {balance}
                    </p>
                </div>
                {facts && <p className="mt-1 text-[14px] font-medium text-white/70">{facts}</p>}

                <dl className="mt-4 grid grid-cols-3 gap-2">
                    {tiles.map(tile => (
                        <div key={tile.label} className={clsx(ON_COLOUR, 'flex min-w-0 flex-col rounded-[18px] px-3 pb-2.5 pt-2')}>
                            <dt className="truncate text-[12.5px] font-semibold text-white/75">{tile.label}</dt>
                            <dd className="mt-0.5 text-white">
                                <Big size={17}>{tile.value}</Big>
                                <span className="block truncate text-[11.5px] font-medium text-white/60">{tile.sub}</span>
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>

            {/* Hidden file input for the web photo fallback */}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

            <ConfirmDialog
                isOpen={isConfirmingDelete}
                type="danger"
                title={t.deleteEventTitle}
                message={t.deleteEventMessage}
                confirmLabel={t.delete}
                cancelLabel={t.cancel}
                onCancel={() => setIsConfirmingDelete(false)}
                onConfirm={() => {
                    setIsConfirmingDelete(false);
                    onDeleteEvent(event.id);
                    onBack();
                }}
            />
        </ScreenHero>
    );
};
