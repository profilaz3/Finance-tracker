import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { AlertTriangle, Info, CheckCircle, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { MOTION } from '../config';

type DialogType = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: DialogType;
    icon?: React.ReactNode;
}

interface ConfirmDialogContextType {
    confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

export const useConfirmDialog = () => {
    const context = useContext(ConfirmDialogContext);
    if (!context) {
        throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
    }
    return context;
};

const getTypeStyles = (type: DialogType) => {
    switch (type) {
        case 'danger':
            return {
                iconBg: 'bg-error/10',
                iconColor: 'text-error',
                buttonBg: 'bg-error hover:bg-error/90',
                Icon: Trash2
            };
        case 'warning':
            return {
                iconBg: 'bg-warning/10',
                iconColor: 'text-warning',
                buttonBg: 'bg-warning hover:bg-warning/90',
                Icon: AlertTriangle
            };
        case 'success':
            return {
                iconBg: 'bg-tertiary/10',
                iconColor: 'text-tertiary',
                buttonBg: 'bg-tertiary hover:bg-tertiary/90',
                Icon: CheckCircle
            };
        case 'info':
        default:
            return {
                iconBg: 'bg-primary/10',
                iconColor: 'text-primary',
                buttonBg: 'bg-primary hover:bg-primary/90',
                Icon: Info
            };
    }
};

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
    const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
        setOptions(opts);
        setIsOpen(true);

        return new Promise<boolean>((resolve) => {
            setResolvePromise(() => resolve);
        });
    }, []);

    const handleConfirm = () => {
        setIsOpen(false);
        resolvePromise?.(true);
        setResolvePromise(null);
    };

    const handleCancel = () => {
        setIsOpen(false);
        resolvePromise?.(false);
        setResolvePromise(null);
    };

    const typeStyles = options?.type ? getTypeStyles(options.type) : getTypeStyles('info');
    const IconComponent = typeStyles.Icon;

    return (
        <ConfirmDialogContext.Provider value={{ confirm }}>
            {children}

            <AnimatePresence>
                {isOpen && options && (
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-sm"
                        onClick={handleCancel}
                    >
                    <m.div
                            initial={MOTION.modal.initial}
                            animate={MOTION.modal.animate}
                            exit={MOTION.modal.exit}
                            transition={MOTION.modal.spring}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="confirm-dialog-title"
                            aria-describedby="confirm-dialog-message"
                            className="bg-surface-container w-full max-w-sm rounded-2xl shadow-elevation-3 overflow-hidden"
                        >
                            {/* Icon */}
                            <div className="pt-6 flex justify-center">
                                <div className={clsx(
                                    "w-16 h-16 rounded-full flex items-center justify-center",
                                    typeStyles.iconBg
                                )}>
                                    {options.icon || <IconComponent size={32} className={typeStyles.iconColor} />}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-6 text-center">
                                <h3 id="confirm-dialog-title" className="text-xl font-display font-medium text-on-surface mb-2">
                                    {options.title}
                                </h3>
                                <p id="confirm-dialog-message" className="text-on-surface-variant">
                                    {options.message}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="px-6 pb-6 flex gap-3">
                                <button
                                    onClick={handleCancel}
                                    className="flex-1 py-3 bg-surface-container-high text-on-surface rounded-xl font-medium hover:bg-surface-container-highest transition-colors"
                                >
                                    {options.cancelLabel || 'Cancel'}
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    autoFocus
                                    className={clsx(
                                        "flex-1 py-3 text-on-primary rounded-xl font-medium transition-colors",
                                        typeStyles.buttonBg
                                    )}
                                >
                                    {options.confirmLabel || 'Confirm'}
                                </button>
                            </div>
                        </m.div>
                    </m.div>
                )}
            </AnimatePresence>
        </ConfirmDialogContext.Provider>
    );
};

// Standalone dialog component for simpler use cases
interface ConfirmDialogProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: DialogType;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onConfirm,
    onCancel,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    type = 'info'
}) => {
    const typeStyles = getTypeStyles(type);
    const IconComponent = typeStyles.Icon;

    return (
        <AnimatePresence>
            {isOpen && (
                <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-scrim/50 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    <m.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="standalone-dialog-title"
                        aria-describedby="standalone-dialog-message"
                        className="bg-surface-container w-full max-w-sm rounded-2xl shadow-elevation-3 overflow-hidden"
                    >
                        <div className="pt-6 flex justify-center">
                            <div className={clsx(
                                "w-16 h-16 rounded-full flex items-center justify-center",
                                typeStyles.iconBg
                            )}>
                                <IconComponent size={32} className={typeStyles.iconColor} />
                            </div>
                        </div>

                        <div className="p-6 text-center">
                            <h3 id="standalone-dialog-title" className="text-xl font-display font-medium text-on-surface mb-2">
                                {title}
                            </h3>
                            <p id="standalone-dialog-message" className="text-on-surface-variant">
                                {message}
                            </p>
                        </div>

                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 py-3 bg-surface-container-high text-on-surface rounded-xl font-medium hover:bg-surface-container-highest transition-colors"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={onConfirm}
                                autoFocus
                                className={clsx(
                                    "flex-1 py-3 text-on-primary rounded-xl font-medium transition-colors",
                                    typeStyles.buttonBg
                                )}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </m.div>
                </m.div>
            )}
        </AnimatePresence>
    );
};
