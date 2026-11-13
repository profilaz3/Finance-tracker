import React, { useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Upload, Image as ImageIcon, Check, Loader2, Users, Type, Palette, Camera } from 'lucide-react';
import { Person, Event } from '../types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { useImagePicker, base64ToFile, ImageResult } from '../hooks/useImagePicker';
import { ImagePickerSheet } from './ImagePickerSheet';
import { MOTION } from '../config';
import { useDialog } from '../hooks/useFocusTrap';
import { getSupabaseService } from '../services/runtimeServices';

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-safe-area bg-scrim/50 backdrop-blur-sm">
            <m.div
                {...dialogProps}
                initial={MOTION.modal.initial}
                animate={MOTION.modal.animate}
                exit={MOTION.modal.exit}
                transition={MOTION.modal.spring}
                className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="p-4 border-b border-outline/10 flex items-center justify-between">
                    <h2 id={titleId} className="text-xl font-bold font-display text-on-surface">Create Event</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container rounded-full transition-colors">
                        <X size={20} className="text-on-surface-variant" aria-hidden="true" />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 space-y-6">
                    {/* Image Upload */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-on-surface-variant">Event Photo</label>
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
                            aria-label="Event Photo"
                            className={clsx(
                                "relative w-full h-48 rounded-xl border-2 border-dashed border-outline/20 flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden group",
                                !previewUrl && "hover:bg-surface-container hover:border-primary/50"
                            )}
                        >
                            {previewUrl ? (
                                <>
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-scrim/40 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="bg-surface/20 backdrop-blur-md p-3 rounded-full text-white">
                                            <Camera size={24} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-4">
                                    <div className="w-12 h-12 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-3 text-primary">
                                        <ImageIcon size={24} />
                                    </div>
                                    <p className="text-sm font-medium text-on-surface">Add event photo</p>
                                    <p className="text-xs text-on-surface-variant mt-1">Take photo or choose from gallery</p>
                                </div>
                            )}
                            {isUploading && (
                                <div className="absolute inset-0 bg-scrim/50 flex items-center justify-center">
                                    <Loader2 className="animate-spin text-white" size={32} />
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
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                                <Type size={16} /> Event Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Trip to Bergamo"
                                className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20 transition-all"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-on-surface-variant pl-1">Description (Optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Add details about the trip..."
                                rows={3}
                                className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                            />
                        </div>
                    </div>

                    {/* People */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                            <Users size={16} /> Who's going?
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {/* Owner (userProfile) - always included */}
                            {userProfile && (
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border bg-primary/10 text-primary border-primary/20 opacity-80"
                                    title="You (event owner)"
                                >
                                    {userProfile.avatar ? (
                                        <img src={userProfile.avatar} alt={userProfile.name} className="w-5 h-5 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: userProfile.color + '20', color: userProfile.color }}>
                                            {userProfile.name?.[0] || 'Y'}
                                        </div>
                                    )}
                                    {userProfile.name || 'You'}
                                    <Check size={14} />
                                </div>
                            )}
                            {/* Other people */}
                            {people.map(person => (
                                <button
                                    key={person.id}
                                    type="button"
                                    onClick={() => togglePerson(person.id)}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                                        selectedPersonIds.includes(person.id)
                                            ? "bg-primary/10 text-primary border-primary/20"
                                            : "bg-surface-container text-on-surface-variant border-transparent hover:bg-surface-container-high"
                                    )}
                                >
                                    {person.avatar ? (
                                        <img src={person.avatar} alt={person.name} className="w-5 h-5 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: person.color + '20', color: person.color }}>
                                            {person.name[0]}
                                        </div>
                                    )}
                                    {person.name}
                                    {selectedPersonIds.includes(person.id) && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color */}
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
                            <Palette size={16} /> Theme Color
                        </label>
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {COLORS.map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setSelectedColor(color)}
                                    className={clsx(
                                        "w-8 h-8 rounded-full transition-all flex items-center justify-center",
                                        color,
                                        selectedColor === color ? "ring-2 ring-offset-2 ring-offset-surface ring-primary scale-110" : "opacity-70 hover:opacity-100"
                                    )}
                                >
                                    {selectedColor === color && <Check size={14} className="text-white" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

        <div className="p-4 border-t border-outline/10 bg-surface-container-low flex justify-end gap-3">
            <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={handleSubmit}
                disabled={!name.trim() || isUploading}
                className="px-6 py-2 bg-primary text-on-primary rounded-xl font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {isUploading ? 'Uploading...' : 'Create Event'}
            </button>
        </div>
    </m.div>

    <ImagePickerSheet
        isOpen={isPickerOpen}
        onClose={closePicker}
        onSelectCamera={handleCameraSelect}
        onSelectGallery={handleGallerySelect}
        title="Choose Event Photo"
    />
</div>
);
};
