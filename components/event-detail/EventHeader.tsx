import React, { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import {
    ArrowLeft, CalendarDays, Camera, CheckCircle2, Loader2, MoreHorizontal, Share2, Trash2,
} from 'lucide-react';
import { Event, Person } from '../../types';
import { getParticipantInitials, getParticipantTooltipLabel } from '../../utils/eventParticipants';
import { getTranslations } from '../../utils/i18n';
import { eventBannerStyle } from '../../utils/eventVisuals';
import { useEscapeKey } from '../../hooks/useFocusTrap';
import { MOTION } from '../../config';
import { ConfirmDialog } from '../ConfirmDialog';
import { EventStatusChip, formatEventDates } from '../EventCard';

interface EventHeaderProps {
    event: Event;
    eventPeople: Person[];
    onBack: () => void;
    onUpdateEvent: (id: string, updates: Partial<Event>) => void;
    onDeleteEvent: (id: string) => void;
    onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
    onOpenShareModal: () => void;
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
    isUploadingPhoto: boolean;
    setIsUploadingPhoto: (uploading: boolean) => void;
    imageVersion: number;
    setImageVersion: React.Dispatch<React.SetStateAction<number>>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    openPicker: () => void;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    language?: 'en' | 'sr';
}

const glassButton = 'flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white ring-1 ring-white/20 backdrop-blur-md';
const menuItem = 'flex h-12 w-full items-center gap-3 rounded-[18px] px-3 text-left text-[15px] font-medium hover:bg-chip disabled:opacity-50';

export const EventHeader: React.FC<EventHeaderProps> = ({
    event,
    eventPeople,
    onBack,
    onDeleteEvent,
    onUpdateEvent,
    onOpenShareModal,
    isMenuOpen,
    setIsMenuOpen,
    isUploadingPhoto,
    imageVersion,
    fileInputRef,
    openPicker,
    handleFileChange,
    language = 'en',
}) => {
    const t = getTranslations();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    useEscapeKey(() => setIsMenuOpen(false), isMenuOpen);

    const handleEndEvent = () => {
        onUpdateEvent(event.id, {
            endDate: new Date().toISOString(),
            status: 'completed'
        });
    };

    const runFromMenu = (action: () => void) => () => {
        setIsMenuOpen(false);
        action();
    };

    return (
        <div className="relative">
            <div
                className="relative flex h-[300px] flex-col justify-between overflow-hidden rounded-[30px] p-3 text-white shadow-[0_14px_40px_-18px_rgba(0,0,0,0.55)] md:h-[340px] md:p-4"
                style={eventBannerStyle(event)}
            >
                {event.imageUrl && (
                    <img
                        key={`${event.imageUrl}-v${imageVersion}`}
                        src={`${event.imageUrl}?v=${imageVersion}`}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/25" aria-hidden="true" />

                <div className="relative flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={t.backToEvents}
                        title={t.backToEvents}
                        className={glassButton}
                    >
                        <ArrowLeft size={22} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label={t.eventActions}
                        title={t.eventActions}
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        className={glassButton}
                    >
                        {isUploadingPhoto ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <MoreHorizontal size={22} aria-hidden="true" />}
                    </button>
                </div>

                <div className="relative flex flex-col gap-2 px-1 pb-1">
                    <span><EventStatusChip status={event.status} t={t} /></span>
                    <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.8px] md:text-[40px]">{event.name}</h1>
                    {event.description && <p className="line-clamp-2 max-w-xl text-[14px] text-white/80">{event.description}</p>}
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] font-medium text-white/85">
                            <CalendarDays size={14} aria-hidden="true" className="shrink-0" />
                            {formatEventDates(event, t, language)}
                        </span>
                        <span className="flex -space-x-2">
                            {eventPeople.slice(0, 5).map(person => (
                                <span
                                    key={person.id}
                                    title={getParticipantTooltipLabel(person)}
                                    className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white ring-2 ring-black/30"
                                    style={{ background: person.color }}
                                >
                                    {person.avatar
                                        ? <img src={person.avatar} alt={person.name} className="h-full w-full object-cover" />
                                        : getParticipantInitials(person.name)}
                                </span>
                            ))}
                            {eventPeople.length > 5 && (
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-[11px] font-bold ring-2 ring-black/30 backdrop-blur-md">
                                    +{eventPeople.length - 5}
                                </span>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {/* Hidden file input for the web photo fallback */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />

            <AnimatePresence>
                {isMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setIsMenuOpen(false)} aria-hidden="true" />
                        <m.div
                            key="event-menu"
                            initial={{ opacity: 0, scale: 0.92, y: -6 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: -6 }}
                            transition={MOTION.modal.spring}
                            style={{ transformOrigin: 'top right' }}
                            className="glass-sheet absolute right-3 top-[60px] z-40 w-[232px] rounded-[26px] p-1.5 text-on-surface"
                        >
                            <button type="button" onClick={runFromMenu(openPicker)} disabled={isUploadingPhoto} className={menuItem}>
                                {isUploadingPhoto ? <Loader2 size={19} className="animate-spin text-muted" aria-hidden="true" /> : <Camera size={19} className="text-muted" aria-hidden="true" />}
                                {isUploadingPhoto ? t.uploading : t.changePhoto}
                            </button>
                            <button type="button" onClick={runFromMenu(onOpenShareModal)} className={menuItem}>
                                <Share2 size={19} className="text-muted" aria-hidden="true" />
                                {t.shareEvent}
                            </button>
                            {event.status === 'active' && (
                                <button type="button" onClick={runFromMenu(handleEndEvent)} className={menuItem}>
                                    <CheckCircle2 size={19} className="text-muted" aria-hidden="true" />
                                    {t.endEvent}
                                </button>
                            )}
                            {event.status === 'completed' && (
                                <button
                                    type="button"
                                    onClick={runFromMenu(() => setIsConfirmingDelete(true))}
                                    className={clsx(menuItem, 'mt-1 border-t border-hair text-neg')}
                                >
                                    <Trash2 size={19} aria-hidden="true" />
                                    {t.deleteEvent}
                                </button>
                            )}
                        </m.div>
                    </>
                )}
            </AnimatePresence>

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
        </div>
    );
};
