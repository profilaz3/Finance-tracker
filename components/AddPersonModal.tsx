import React, { useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Check, User, AlertCircle, Camera } from 'lucide-react';
import { Currency, Person } from '../types';
import { TRANSLATIONS, CHART_COLORS, CURRENCIES } from '../constants';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import clsx from 'clsx';
import { useImagePicker, ImageResult } from '../hooks/useImagePicker';
import { ImagePickerSheet } from './ImagePickerSheet';
import { MOTION } from '../config';
import { useDialog } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { Segmented } from './ui/Segmented';
import { AVATAR_MAX_DIMENSION } from '../utils/imageResize';

interface AddPersonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (name: string, defaultCurrency: Currency, color: string, avatar?: string) => void;
    onUpdate?: (id: string, updates: Partial<Person>) => void;
    initialData?: Person | null;
    language: 'en' | 'sr';
}

export const AddPersonModal: React.FC<AddPersonModalProps> = ({ isOpen, onClose, onAdd, onUpdate, initialData, language }) => {
    const [name, setName] = useState('');
    const [currency, setCurrency] = useState<Currency>('RSD');
    const [color, setColor] = useState(CHART_COLORS[0]);
    const [avatar, setAvatar] = useState<string | undefined>(undefined);
    const [touched, setTouched] = useState(false);
    const t = TRANSLATIONS[language];
    const { dialogProps, titleId } = useDialog(isOpen, onClose);
    const { wrapRef, handleProps } = useSheetDrag(onClose);

    const {
        openPicker,
        isPickerOpen,
        closePicker,
        pickFromCamera,
        pickFromGallery,
        fileInputRef,
        handleFileInputChange,
    } = useImagePicker({ quality: 80, maxDimension: AVATAR_MAX_DIMENSION });

    const nameError = touched && !name.trim() ? t.fieldRequired : null;

    useEffect(() => {
        if (isOpen) {
            setTouched(false);
            if (initialData) {
                setName(initialData.name);
                setCurrency(initialData.defaultCurrency);
                setColor(initialData.color);
                setAvatar(initialData.avatar);
            } else {
                setName('');
                setCurrency('RSD');
                setColor(CHART_COLORS[0]);
                setAvatar(undefined);
            }
        }
    }, [isOpen, initialData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!name.trim()) {
            vibrate(HAPTIC_PATTERNS.error);
            return;
        }

        vibrate(HAPTIC_PATTERNS.success);

        if (initialData && onUpdate) {
            onUpdate(initialData.id, {
                name,
                defaultCurrency: currency,
                color,
                avatar
            });
        } else {
            onAdd(name, currency, color, avatar);
        }

        onClose();
    };

    const handleImageResult = useCallback((result: ImageResult | null) => {
        if (result?.dataUrl) {
            setAvatar(result.dataUrl);
        }
    }, []);

    const handleCameraSelect = useCallback(async () => {
        const result = await pickFromCamera();
        handleImageResult(result);
    }, [pickFromCamera, handleImageResult]);

    const handleGallerySelect = useCallback(async () => {
        const result = await pickFromGallery();
        handleImageResult(result);
    }, [pickFromGallery, handleImageResult]);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const result = await handleFileInputChange(e);
        handleImageResult(result);
    }, [handleFileInputChange, handleImageResult]);

    const title = initialData ? t.editPerson : t.addPerson;
    const initial = name.trim().charAt(0).toUpperCase();

    return (
        <AnimatePresence propagate>
            {isOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-end justify-center modal-safe-area max-md:px-2! max-md:pb-[max(8px,env(safe-area-inset-bottom))]! md:items-center"
                    data-no-swipe
                >
                    <m.div
                        className="paper-scrim absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={MOTION.backdrop}
                        onClick={onClose}
                        aria-hidden="true"
                    />
                    <div ref={wrapRef} className="relative flex max-h-full w-full justify-center">
                    <m.div
                        {...dialogProps}
                        onClick={(e) => e.stopPropagation()}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={MOTION.sheet.exit}
                        transition={MOTION.sheet.spring}
                        className="glass-sheet relative flex max-h-[88dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
                    >
                        <div className="shrink-0 touch-none" {...handleProps}>
                            <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                            <div className="flex items-center gap-2 px-5 pb-1 pt-3">
                                <h2 id={titleId} className="flex-1 text-[22px] font-semibold tracking-tight">
                                    {title}
                                </h2>
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

                        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">
                                {/* Avatar */}
                                <div className="flex flex-col items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={openPicker}
                                        aria-label={t.changePhoto}
                                        className="group relative h-24 w-24 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
                                    >
                                        <span
                                            className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[38px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(0,0,0,0.45)] transition-[background-color,transform] duration-300 group-active:scale-95"
                                            style={{ backgroundColor: color }}
                                        >
                                            {avatar ? (
                                                <img src={avatar} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                initial || <User size={38} aria-hidden="true" />
                                            )}
                                        </span>
                                        <span className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-[var(--paper-tile)] bg-accent text-on-accent" aria-hidden="true">
                                            <Camera size={14} strokeWidth={2.4} />
                                        </span>
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </div>

                                {/* Name */}
                                <div>
                                    <label htmlFor="add-person-name" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">
                                        {t.name}
                                    </label>
                                    <input
                                        id="add-person-name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        onBlur={() => setTouched(true)}
                                        autoComplete="off"
                                        enterKeyHint="done"
                                        aria-invalid={!!nameError}
                                        aria-describedby={nameError ? 'add-person-name-error' : undefined}
                                        className={clsx(
                                            'paper-field h-12 w-full rounded-[14px] border px-4 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent',
                                            nameError ? 'border-neg' : 'border-hair'
                                        )}
                                        placeholder={t.name}
                                        autoFocus={!initialData}
                                    />
                                    {nameError && (
                                        <p id="add-person-name-error" className="mt-1.5 flex items-center gap-1 px-1 text-[12px] font-medium text-neg">
                                            <AlertCircle size={12} aria-hidden="true" /> {nameError}
                                        </p>
                                    )}
                                </div>

                                {/* Color */}
                                <div role="radiogroup" aria-label={t.color}>
                                    <span className="mb-2 block px-1 text-[13px] font-semibold text-muted">{t.color}</span>
                                    <div className="grid grid-cols-8 justify-items-center gap-1 px-0.5">
                                        {CHART_COLORS.map((c, index) => {
                                            const selected = color === c;
                                            return (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={selected}
                                                    aria-label={`${t.color} ${index + 1}`}
                                                    onClick={() => setColor(c)}
                                                    className={clsx(
                                                        'flex h-8 w-8 items-center justify-center rounded-full outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                                                        selected ? 'scale-110 ring-2 ring-on-surface ring-offset-2 ring-offset-[var(--paper-tile)]' : 'active:scale-90'
                                                    )}
                                                    style={{ backgroundColor: c }}
                                                >
                                                    {selected && <Check size={15} strokeWidth={3} className="text-white drop-shadow" aria-hidden="true" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Currency */}
                                <div>
                                    <span className="mb-2 block px-1 text-[13px] font-semibold text-muted">{t.currency}</span>
                                    <Segmented
                                        ariaLabel={t.currency}
                                        value={currency}
                                        onChange={setCurrency}
                                        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                                    />
                                </div>
                            </div>

                            <div className="shrink-0 px-5 pb-5 pt-1">
                                <button
                                    type="submit"
                                    disabled={!name.trim()}
                                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent transition-opacity disabled:opacity-40"
                                >
                                    <Check size={18} strokeWidth={2.6} aria-hidden="true" />
                                    {initialData ? t.save : t.add}
                                </button>
                            </div>
                        </form>
                    </m.div>
                    </div>

                    <ImagePickerSheet
                        isOpen={isPickerOpen}
                        onClose={closePicker}
                        onSelectCamera={handleCameraSelect}
                        onSelectGallery={handleGallerySelect}
                        language={language}
                        title={t.chooseAvatar}
                    />
                </div>
            )}
        </AnimatePresence>
    );
};
