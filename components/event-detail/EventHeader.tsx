import React, { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import {
    ArrowLeft, Play, CheckCircle2,
    Trash2, MapPin, Share2, Clock, Camera, MoreVertical, Loader2
} from 'lucide-react';
import { Event, Person } from '../../types';
import clsx from 'clsx';
import { getParticipantInitials, getParticipantTooltipLabel } from '../../utils/eventParticipants';
import { getTranslations } from '../../utils/i18n';
import { formatDate as formatLocaleDate } from '../../utils/locale';
import { ConfirmDialog } from '../ConfirmDialog';

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

const formatDate = (dateString?: string) => {
    if (!dateString) return getTranslations().dateTbd;
    return formatLocaleDate(dateString, {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

export const EventHeader: React.FC<EventHeaderProps> = ({
    event,
    eventPeople,
    onBack,
    onUpdateEvent,
    onDeleteEvent,
    onShowToast,
    onOpenShareModal,
    isMenuOpen,
    setIsMenuOpen,
    isUploadingPhoto,
    setIsUploadingPhoto,
    imageVersion,
    setImageVersion,
    fileInputRef,
    openPicker,
    handleFileChange,
    language = 'en',
}) => {
    const t = getTranslations();
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const handleStartEvent = () => {
        onUpdateEvent(event.id, {
            startDate: new Date().toISOString(),
            status: 'active'
        });
    };

    const handleEndEvent = () => {
        onUpdateEvent(event.id, {
            endDate: new Date().toISOString(),
            status: 'completed'
        });
    };

    const handleReopenEvent = () => {
        onUpdateEvent(event.id, {
            endDate: undefined,
            status: 'active'
        });
    };

    return (
        <div className="relative h-64 md:h-80 rounded-3xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-scrim/40 to-transparent z-10" />
            {event.imageUrl ? (
                <img
                    key={`${event.imageUrl}-v${imageVersion}`}
                    src={`${event.imageUrl}?v=${imageVersion}`}
                    alt={event.name}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className={clsx("w-full h-full flex items-center justify-center", event.color || "bg-primary/20")}>
                    <MapPin size={64} className="text-on-surface/20" />
                </div>
            )}

            {/* Back Button */}
            <div className="absolute top-4 left-4 z-20">
                <button
                    onClick={onBack}
                    aria-label={t.backToEvents}
                    title={t.backToEvents}
                    className="p-2 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50 transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
            </div>

            {/* Menu Button */}
            <div className={clsx(
                "absolute top-4 right-4 z-20 transition-opacity duration-200",
                isMenuOpen ? "opacity-100" : "opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
            )}>
                <div className="relative">
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label={t.eventActions}
                        title={t.eventActions}
                        className="p-2 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50 transition-colors"
                    >
                        <MoreVertical size={24} />
                    </button>

                    {/* Hidden file input for web fallback */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <AnimatePresence>
                        {isMenuOpen && (
                            <m.div
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                className="absolute right-0 top-12 w-48 bg-surface rounded-xl shadow-xl border border-outline/10 overflow-hidden z-30"
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMenuOpen(false);
                                        openPicker();
                                    }}
                                    disabled={isUploadingPhoto}
                                    className="w-full px-4 py-3 text-left text-sm font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isUploadingPhoto ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Camera size={16} />
                                    )}
                                    {isUploadingPhoto ? t.uploading : t.changePhoto}
                                </button>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMenuOpen(false);
                                        onOpenShareModal();
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
                                >
                                    <Share2 size={16} /> {t.shareEvent}
                                </button>

                                {event.status === 'active' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsMenuOpen(false);
                                            handleEndEvent();
                                        }}
                                        className="w-full px-4 py-3 text-left text-sm font-medium text-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
                                    >
                                        <CheckCircle2 size={16} /> {t.endEvent}
                                    </button>
                                )}

                                {event.status === 'completed' && (
                                    <button
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            setIsConfirmingDelete(true);
                                        }}
                                        className="w-full px-4 py-3 text-left text-sm font-medium text-error hover:bg-error/10 transition-colors flex items-center gap-2"
                                    >
                                        <Trash2 size={16} /> {t.deleteEvent}
                                    </button>
                                )}


                            </m.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 z-20 text-white">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={clsx(
                                "px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-md border border-on-surface/20 flex items-center gap-1.5",
                                event.status === 'active' ? "bg-tertiary/30 text-white" :
                                    event.status === 'completed' ? "bg-primary/30 text-white" : "bg-on-surface/20 text-white/80"
                            )}>
                                {event.status === 'active' && <Play size={12} fill="currentColor" />}
                                {event.status === 'completed' && <CheckCircle2 size={12} />}
                                <span className="capitalize">{event.status === 'active' ? t.eventStatusActive : event.status === 'completed' ? t.eventStatusCompleted : t.eventStatusArchived}</span>
                            </span>

                            {/* Show dates */}
                            {event.startDate && (
                                <span className="text-sm font-medium opacity-90 flex items-center gap-1">
                                    <Clock size={14} />
                                    {formatDate(event.startDate)}
                                    {event.endDate ? ` - ${formatDate(event.endDate)}` : ''}
                                </span>
                            )}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold font-display">{event.name}</h1>
                        {event.description && <p className="mt-1 opacity-80 max-w-xl">{event.description}</p>}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                        <div className="flex -space-x-2">
                            {eventPeople.map(person => (
                                <div key={person.id} className="w-8 h-8 rounded-full border-2 border-black/50 overflow-hidden" title={getParticipantTooltipLabel(person)}>
                                    {person.avatar ? (
                                        <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold bg-white text-black">
                                            {getParticipantInitials(person.name)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Controls - Only Start and Reopen now */}
                        <div className="flex gap-2">
                            {event.status !== 'active' && event.status !== 'completed' && (
                                <button
                                    onClick={handleStartEvent}
                                    className="px-4 py-2 bg-tertiary hover:bg-tertiary/90 text-on-tertiary rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-tertiary/20"
                                >
                                    <Play size={16} fill="currentColor" /> {t.startEvent}
                                </button>
                            )}
                            {event.status === 'completed' && (
                                <button
                                    onClick={handleReopenEvent}
                                    className="px-4 py-2 bg-on-surface/20 backdrop-blur-md hover:bg-on-surface/30 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                                >
                                    <Play size={16} /> {t.reopenEvent}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

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
        </div >
    );
};
