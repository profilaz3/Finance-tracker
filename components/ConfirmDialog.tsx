import React, { createContext, useContext, useState, useCallback, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'motion/react';
import { AlertTriangle, Info, CheckCircle, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { MOTION } from '../config';
import { getTranslations } from '../utils/i18n';
import { useDialog } from '../hooks/useFocusTrap';

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
                iconBg: 'bg-error/12',
                iconColor: 'text-error',
                buttonBg: 'bg-error',
                buttonText: 'text-on-error',
                Icon: Trash2
            };
        case 'warning':
            return {
                iconBg: 'bg-warning/12',
                iconColor: 'text-warning',
                buttonBg: 'bg-warning',
                buttonText: 'text-on-warning',
                Icon: AlertTriangle
            };
        case 'success':
            return {
                iconBg: 'bg-pos/12',
                iconColor: 'text-pos',
                buttonBg: 'bg-tertiary',
                buttonText: 'text-on-tertiary',
                Icon: CheckCircle
            };
        case 'info':
        default:
            return {
                iconBg: 'bg-accent-soft',
                iconColor: 'text-accent',
                buttonBg: 'bg-accent',
                buttonText: 'text-on-accent',
                Icon: Info
            };
    }
};

const SCRIM_CLASS = 'fixed inset-0 z-[200] flex items-center justify-center modal-safe-area paper-scrim backdrop-blur-[2px]';

interface DialogCardProps {
    type: DialogType;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    icon?: React.ReactNode;
    dialogProps: ReturnType<typeof useDialog>['dialogProps'];
    titleId: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/** The centered paper card shared by the provider and the standalone dialog. */
const DialogCard: React.FC<DialogCardProps> = ({
    type,
    title,
    message,
    confirmLabel,
    cancelLabel,
    icon,
    dialogProps,
    titleId,
    onConfirm,
    onCancel,
}) => {
    const typeStyles = getTypeStyles(type);
    const IconComponent = typeStyles.Icon;
    const isDanger = type === 'danger';
    const messageId = useId();

    return (
        <m.div
            initial={MOTION.modal.initial}
            animate={MOTION.modal.animate}
            exit={MOTION.modal.exit}
            transition={MOTION.modal.spring}
            onClick={(e) => e.stopPropagation()}
            {...dialogProps}
            role="alertdialog"
            aria-describedby={messageId}
            className="paper-tile w-full max-w-[340px] overflow-hidden !rounded-[32px] text-on-surface outline-none"
        >
            <div className="flex justify-center pt-7" aria-hidden="true">
                <div className={clsx('flex h-14 w-14 items-center justify-center rounded-full', typeStyles.iconBg)}>
                    {icon || <IconComponent size={26} strokeWidth={2.2} className={typeStyles.iconColor} />}
                </div>
            </div>

            <div className="px-6 pb-6 pt-4 text-center">
                <h3 id={titleId} className="text-[20px] font-semibold leading-tight tracking-tight">
                    {title}
                </h3>
                <p id={messageId} className="mt-2 text-[15px] leading-snug text-muted">
                    {message}
                </p>
            </div>

            <div className="flex gap-2.5 px-5 pb-5">
                <button
                    type="button"
                    onClick={onCancel}
                    autoFocus={isDanger}
                    className="h-12 flex-1 rounded-full bg-chip text-[15px] font-semibold text-on-surface outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent"
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    autoFocus={!isDanger}
                    className={clsx(
                        'h-12 flex-1 rounded-full text-[15px] font-semibold outline-none transition-[filter] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper-tile)]',
                        typeStyles.buttonBg,
                        typeStyles.buttonText
                    )}
                >
                    {confirmLabel}
                </button>
            </div>
        </m.div>
    );
};

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const t = getTranslations();
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

    // Memoized so consumers of useConfirmDialog do not re-render whenever the dialog opens.
    const contextValue = useMemo(() => ({ confirm }), [confirm]);

    const { dialogProps, titleId } = useDialog(isOpen && !!options, handleCancel);

    return (
        <ConfirmDialogContext.Provider value={contextValue}>
            {children}

            <AnimatePresence>
                {isOpen && options && (
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={MOTION.backdrop}
                        className={SCRIM_CLASS}
                        onClick={handleCancel}
                    >
                        <DialogCard
                            type={options.type ?? 'info'}
                            title={options.title}
                            message={options.message}
                            confirmLabel={options.confirmLabel || t.confirm}
                            cancelLabel={options.cancelLabel || t.cancel}
                            icon={options.icon}
                            dialogProps={dialogProps}
                            titleId={titleId}
                            onConfirm={handleConfirm}
                            onCancel={handleCancel}
                        />
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
    const { dialogProps, titleId } = useDialog(isOpen, onCancel);

    // Portalled so a transformed ancestor (animated view, reorder item) cannot clip the fixed overlay.
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={MOTION.backdrop}
                    className={SCRIM_CLASS}
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                >
                    <DialogCard
                        type={type}
                        title={title}
                        message={message}
                        confirmLabel={confirmLabel}
                        cancelLabel={cancelLabel}
                        dialogProps={dialogProps}
                        titleId={titleId}
                        onConfirm={onConfirm}
                        onCancel={onCancel}
                    />
                </m.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
