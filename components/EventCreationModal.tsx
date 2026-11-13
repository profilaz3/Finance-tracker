import React, { useState, useEffect, useCallback } from 'react';
import { m } from 'motion/react';
import { X, Image as ImageIcon, Check, Loader2, Users, Palette, Camera } from 'lucide-react';
import { Person, Event } from '../types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { useImagePicker, base64ToFile, ImageResult } from '../hooks/useImagePicker';
import { ImagePickerSheet } from './ImagePickerSheet';
import { MOTION } from '../config';
import { useDialog } from '../hooks/useFocusTrap';
import { getSupabaseService } from '../services/runtimeServices';
import { getTranslations } from '../utils/i18n';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { Avatar } from './home/parts';

const label = 'mb-1.5 block px-1 text-[13px] font-semibold text-muted';
const chip = 'flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-[14px] font-semibold transition-colors';

interface EventCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (event: Event) => void;
    people: Person[];
    userProfile?: Person;
}

const COLORS = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500',
    'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
    'bg-fuchsia-500', 'bg-indigo-500'
];

export const EventCreationModal: React.FC<EventCreationModalProps> = ({
    isOpen,
    onClose,
    onCreate,
    people,
    userProfile
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);
    const [isUploading, setIsUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
    const [eventId, setEventId] = useState<string>('');
    const t = getTranslations();
    
    // Image picker hook
    const {
        openPicker,
        isPickerOpen,
        closePicker,
        pickFromCamera,
        pickFromGallery,
        fileInputRef,
        handleFileInputChange,
    } = useImagePicker({ quality: 80 });

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setName('');
            setDescription('');
            setSelectedPersonIds([]);
            setSelectedColor(COLORS[0]);
            setPreviewUrl(null);
            setUploadedImageUrl(null);
            setEventId(uuidv4());
        }
    }, [isOpen]);

    // Handle image result from picker (camera or gallery)
    const handleImageResult = useCallback(async (result: ImageResult | null) => {
        if (!result) return;
        
        // Show preview immediately
        setPreviewUrl(result.dataUrl);
        
        setIsUploading(true);
        try {
            // Convert to File if needed (for native platforms)
            const file = result.file || base64ToFile(result.dataUrl, `event_${eventId}_${Date.now()}.jpg`);
            const supabaseService = await getSupabaseService();
            const publicUrl = await supabaseService.uploadEventPhoto(file, eventId);
            setUploadedImageUrl(publicUrl);
        } catch (error) {
            console.error('Failed to upload image:', error);
        } finally {
            setIsUploading(false);
        }
    }, [eventId]);

    // Handle camera selection
    const handleCameraSelect = useCallback(async () => {
        const result = await pickFromCamera();
        await handleImageResult(result);
    }, [pickFromCamera, handleImageResult]);

    // Handle gallery selection
    const handleGallerySelect = useCallback(async () => {
        const result = await pickFromGallery();
        await handleImageResult(result);
    }, [pickFromGallery, handleImageResult]);

    // Handle file input change (web fallback)
    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const result = await handleFileInputChange(e);
        await handleImageResult(result);
    }, [handleFileInputChange, handleImageResult]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        vibrate(HAPTIC_PATTERNS.success);

        // Include userProfile in participants (owner is always part of the event)
        const allParticipants = userProfile
            ? [userProfile.id, ...selectedPersonIds.filter(id => id !== userProfile.id)]
            : selectedPersonIds;

        const newEvent: Event = {
            id: eventId,
            name: name.trim(),
            description: description.trim(),
            personIds: allParticipants,
            color: selectedColor,
            imageUrl: uploadedImageUrl || undefined,
            status: 'active',
            startDate: new Date().toISOString(), // Auto-start on creation
        };

        onCreate(newEvent);
        onClose();
    };

    const togglePerson = (id: string) => {
        setSelectedPersonIds(prev =>
            prev.includes(id)
                ? prev.filter(p => p !== id)
                : [...prev, id]
        );
    };

    const { dialogProps, titleId } = useDialog(isOpen, onClose);
    const { wrapRef, handleProps } = useSheetDrag(onClose);
    const nameId = `${titleId}-name`;
    const descriptionId = `${titleId}-description`;

    if (!isOpen) return null;

    const canCreate = !!name.trim() && !isUploading;

    return (
        <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center">
            <m.div
                className="paper-scrim absolute inset-0"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={MOTION.backdrop}
                onClick={onClose}
                aria-hidden="true"
            />
            <div ref={wrapRef} className="relative flex w-full justify-center">
            <m.div
                {...dialogProps}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={MOTION.sheet.exit}
                transition={MOTION.sheet.spring}
                className="glass-sheet flex max-h-[90dvh] w-full max-w-[500px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
            >
                <div className="shrink-0 touch-none" {...handleProps}>
                    <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                    <div className="flex items-center gap-2 px-5 pb-3 pt-2 md:pt-5">
                        <h2 id={titleId} className="flex-1 text-[22px] font-bold tracking-[-0.4px]">{t.createEvent}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t.close}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-1 custom-scrollbar">
                    {/* Image Upload */}
                    <div>
                        <p className={label}>{t.eventPhoto}</p>
                        <div
                            onClick={openPicker}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openPicker();
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={t.eventPhoto}
                            className="group relative flex h-40 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            {previewUrl ? (
                                <>
                                    <img src={previewUrl} alt={t.imagePreview} className="h-full w-full object-cover" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-60 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 group-focus-visible:opacity-100">
                                        <span className="glass flex h-12 w-12 items-center justify-center rounded-full text-white">
                                            <Camera size={22} aria-hidden="true" />
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div aria-hidden="true" className={clsx('absolute inset-0 transition-colors', selectedColor)} />
                                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/25" />
                                    <div className="relative px-4 text-center text-white">
                                        <span className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm">
                                            <ImageIcon size={22} aria-hidden="true" />
                                        </span>
                                        <p className="text-[15px] font-semibold">{t.addEventPhoto}</p>
                                        <p className="mt-0.5 text-[13px] text-white/80">{t.takeOrChoosePhoto}</p>
                                    </div>
                                </>
                            )}
                            {isUploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <Loader2 className="animate-spin text-white" size={30} aria-hidden="true" />
                                </div>
                            )}
                            {/* Hidden file input for web fallback */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </div>
                    </div>

                    {/* Name & Description */}
                    <div>
                        <label htmlFor={nameId} className={label}>{t.eventName}</label>
                        <input
                            id={nameId}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t.eventNamePlaceholder}
                            className="h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label htmlFor={descriptionId} className={label}>{t.descriptionOptional}</label>
                        <textarea
                            id={descriptionId}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t.eventDescriptionPlaceholder}
                            rows={3}
                            className="w-full resize-none rounded-[14px] border-none bg-chip px-4 py-3 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                        />
                    </div>

                    {/* People */}
                    <div>
                        <p className={clsx(label, 'flex items-center gap-1.5')}>
                            <Users size={14} aria-hidden="true" /> {t.whosGoing}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {/* Owner (userProfile) - always included */}
                            {userProfile && (
                                <div
                                    className={clsx(chip, 'bg-accent text-on-accent')}
                                    title={t.youEventOwner}
                                >
                                    <Avatar name={userProfile.name || t.you} color={userProfile.color} image={userProfile.avatar} size={32} />
                                    {userProfile.name || t.you}
                                    <Check size={14} aria-hidden="true" />
                                </div>
                            )}
                            {/* Other people */}
                            {people.filter(person => person.id !== userProfile?.id).map(person => {
                                const selected = selectedPersonIds.includes(person.id);
                                return (
                                    <button
                                        key={person.id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => togglePerson(person.id)}
                                        className={clsx(
                                            chip,
                                            selected ? 'bg-accent-soft text-accent ring-1 ring-accent/30' : 'bg-chip text-muted'
                                        )}
                                    >
                                        <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                        {person.name}
                                        {selected && <Check size={14} aria-hidden="true" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Color */}
                    <div>
                        <p className={clsx(label, 'flex items-center gap-1.5')}>
                            <Palette size={14} aria-hidden="true" /> {t.themeColor}
                        </p>
                        <div className="flex flex-wrap gap-3 px-1 pt-1" role="radiogroup" aria-label={t.themeColor}>
                            {COLORS.map((color, index) => {
                                const selected = selectedColor === color;
                                return (
                                    <button
                                        key={color}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        aria-label={`${t.themeColor} ${index + 1}`}
                                        onClick={() => setSelectedColor(color)}
                                        className={clsx(
                                            'flex h-9 w-9 items-center justify-center rounded-full transition-transform',
                                            color,
                                            selected ? 'scale-110 ring-2 ring-on-surface ring-offset-2 ring-offset-transparent' : 'opacity-80 hover:opacity-100'
                                        )}
                                    >
                                        {selected && <Check size={15} strokeWidth={3} className="text-white" aria-hidden="true" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t border-hair px-5 pb-5 pt-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-11 rounded-full px-5 text-[15px] font-semibold text-muted hover:bg-chip"
                    >
                        {t.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canCreate}
                        className={clsx(
                            'h-11 rounded-full px-6 text-[15px] font-semibold transition-colors',
                            canCreate ? 'bg-accent text-on-accent' : 'cursor-not-allowed bg-chip text-faint'
                        )}
                    >
                        {isUploading ? t.uploading : t.createEvent}
                    </button>
                </div>
            </m.div>
            </div>

            <ImagePickerSheet
                isOpen={isPickerOpen}
                onClose={closePicker}
                onSelectCamera={handleCameraSelect}
                onSelectGallery={handleGallerySelect}
                title={t.chooseEventPhoto}
            />
        </div>
    );
};
