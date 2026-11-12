import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, User, AlertCircle, Palette, Coins, Camera } from 'lucide-react';
import { Currency, Person } from '../types';
import { TRANSLATIONS, CHART_COLORS, CURRENCIES } from '../constants';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import clsx from 'clsx';
import { useImagePicker, ImageResult } from '../hooks/useImagePicker';
import { ImagePickerSheet } from './ImagePickerSheet';
import { MOTION } from '../config';

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

    const {
        openPicker,
        isPickerOpen,
        closePicker,
        pickFromCamera,
        pickFromGallery,
        fileInputRef,
        handleFileInputChange,
    } = useImagePicker({ quality: 70 });

    const nameError = touched && !name.trim() ? (t.fieldRequired || 'Required') : null;

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

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-scrim/60 backdrop-blur-md" onClick={onClose}>
                    <motion.div
                        onClick={(e) => e.stopPropagation()}
                        initial={MOTION.modal.initial}
                        animate={MOTION.modal.animate}
                        exit={MOTION.modal.exit}
                        transition={MOTION.modal.spring}
                        className="bg-surface-container w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/10"
                    >
                        <div className="relative p-8">
                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-2 hover:bg-on-surface/10 rounded-full text-on-surface-variant transition-colors"
                            >
                                <X size={20} className="opacity-75" />
                            </button>

                            <h2 className="text-2xl font-display font-medium text-center mb-8 text-on-surface">
                                {initialData ? (t.editPerson || 'Edit Person') : (t.addPerson || 'Add Person')}
                            </h2>

                            <form onSubmit={handleSubmit} className="space-y-8">
                                {/* Avatar & Color Section */}
                                <div className="flex flex-col items-center gap-4">
                                    <div
                                        className="relative group cursor-pointer w-28 h-28"
                                        onClick={openPicker}
                                    >
                                        <div
                                            className="w-full h-full rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-xl transition-all duration-300 group-hover:scale-105"
                                            style={{ backgroundColor: color }}
                                        >
                                            {avatar ? (
                                                <img src={avatar} alt="Preview" className="w-full h-full object-cover rounded-full" />
                                            ) : (
                                                name.charAt(0).toUpperCase() || <User size={40} />
                                            )}
                                        </div>
                                        <div className="absolute inset-0 bg-scrim/40 rounded-full flex items-center justify-center opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <span className="text-white text-xs font-medium tracking-wider uppercase">{t.change}</span>
                                        </div>

                                        {/* Color Dots */}
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1 p-1 bg-surface-container-high rounded-full shadow-lg border border-outline-variant/10">
                                            {CHART_COLORS.slice(0, 4).map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setColor(c);
                                                    }}
                                                    className={clsx(
                                                        "w-4 h-4 rounded-full transition-transform",
                                                        color === c ? "scale-125 ring-1 ring-on-surface" : "hover:scale-110"
                                                    )}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                            <button
                                                type="button"
                                                className="w-4 h-4 rounded-full bg-surface-container-highest flex items-center justify-center"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const nextColorIndex = (CHART_COLORS.indexOf(color) + 1) % CHART_COLORS.length;
                                                    setColor(CHART_COLORS[nextColorIndex]);
                                                }}
                                            >
                                                <Palette size={8} className="text-on-surface-variant" />
                                            </button>
                                        </div>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </div>

                                {/* Inputs */}
                                <div className="space-y-5">
                                    <div className="relative group">
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            onBlur={() => setTouched(true)}
                                            className="block w-full px-0 py-2 text-lg text-on-surface bg-transparent border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 transition-colors peer placeholder-transparent"
                                            placeholder="Name"
                                            autoFocus
                                        />
                                        <label className="absolute left-0 -top-3.5 text-sm text-on-surface-variant transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-on-surface-variant/50 peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-sm peer-focus:text-primary">
                                            {t.name || 'Name'}
                                        </label>
                                        {nameError && (
                                            <span className="absolute right-0 top-3 text-xs text-error font-medium flex items-center gap-1">
                                                <AlertCircle size={10} /> {nameError}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-2 block flex items-center gap-1">
                                            <Coins size={12} /> {t.currency || 'Currency'}
                                        </label>
                                        <div className="flex bg-surface-container-high rounded-xl p-1">
                                            {CURRENCIES.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setCurrency(c)}
                                                    className={clsx(
                                                        "flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                                                        currency === c
                                                            ? "bg-primary text-on-primary shadow-sm"
                                                            : "text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5"
                                                    )}
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Button */}
                                <button
                                    type="submit"
                                    disabled={!name.trim()}
                                    className="w-full py-4 bg-primary text-on-primary font-medium rounded-xl shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 transition-all duration-300 flex items-center justify-center gap-2"
                                >
                                    {initialData ? (
                                        <>
                                            <Check size={20} />
                                            {t.save || 'Save Changes'}
                                        </>
                                    ) : (
                                        <>
                                            <Check size={20} />
                                            {t.add || 'Add Person'}
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </motion.div>

                    <ImagePickerSheet
                        isOpen={isPickerOpen}
                        onClose={closePicker}
                        onSelectCamera={handleCameraSelect}
                        onSelectGallery={handleGallerySelect}
                        language={language}
                        title={language === 'sr' ? 'Izaberi Sliku' : 'Choose Avatar'}
                    />
                </div>
            )}
        </AnimatePresence>
    );
};
