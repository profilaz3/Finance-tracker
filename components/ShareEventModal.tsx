import React, { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Mail, UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { MOTION } from '../config';
import { getTranslations } from '../utils/i18n';
import { useDialog } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';

// Known share errors raised by the service layer, mapped to translation keys.
const SHARE_ERROR_KEYS = {
    'Only the event owner can share this event': 'shareErrorNotOwner',
    'This event is already shared with this email': 'shareErrorAlreadyShared',
    'You cannot share an event with yourself': 'shareErrorSelf',
} as const;

interface ShareEventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onShare: (email: string) => Promise<void>;
    eventName: string;
}

export const ShareEventModal: React.FC<ShareEventModalProps> = ({
    isOpen,
    onClose,
    onShare,
    eventName
}) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const t = getTranslations();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            await onShare(email);
            vibrate(HAPTIC_PATTERNS.success);
            setSuccess(true);
            setEmail('');

            // Auto-close after success
            setTimeout(() => {
                onClose();
                setSuccess(false);
            }, 2000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            const key = SHARE_ERROR_KEYS[message as keyof typeof SHARE_ERROR_KEYS];
            // Handlers already throw translated messages; show those as-is.
            const isTranslated = !!message && (Object.values(t) as unknown[]).includes(message);
            setError(key ? t[key] : isTranslated ? message : t.shareEventFailed);
        } finally {
            setLoading(false);
        }
    };

    const { dialogProps, titleId } = useDialog(isOpen, () => handleClose());
    const emailId = `${titleId}-email`;
    const { wrapRef, handleProps } = useSheetDrag(() => handleClose());

    const handleClose = () => {
        setEmail('');
        setError(null);
        setSuccess(false);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center">
                    {/* Backdrop */}
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={MOTION.backdrop}
                        onClick={handleClose}
                        aria-hidden="true"
                        className="paper-scrim absolute inset-0"
                    />

                    <div ref={wrapRef} className="relative flex w-full justify-center">
                        <m.div
                            {...dialogProps}
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={MOTION.sheet.exit}
                            transition={MOTION.sheet.spring}
                            className="glass-sheet flex max-h-[90dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
                        >
                            {/* Header */}
                            <div className="shrink-0 touch-none" {...handleProps}>
                                <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                                <div className="flex items-center gap-3 px-5 pb-3 pt-2 md:pt-5">
                                    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-accent-soft text-accent">
                                        <UserPlus size={21} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h2 id={titleId} className="text-[22px] font-bold leading-tight tracking-[-0.4px]">{t.shareEvent}</h2>
                                        <p className="truncate text-[14px] text-muted">{eventName}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        aria-label={t.close}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                                    >
                                        <X size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
                                <p className="mb-4 px-1 text-[14px] leading-snug text-muted">
                                    {t.shareEventDescription}
                                </p>

                                {error && (
                                    <div role="alert" className="mb-4 flex items-center gap-2 rounded-[16px] bg-neg/10 px-4 py-3 text-[14px] font-medium text-neg">
                                        <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div role="status" className="mb-4 flex items-center gap-2 rounded-[16px] bg-pos/10 px-4 py-3 text-[14px] font-medium text-pos">
                                        <CheckCircle size={16} className="shrink-0" aria-hidden="true" />
                                        {t.eventSharedSuccess}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label htmlFor={emailId} className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">
                                            {t.emailAddress}
                                        </label>
                                        <div className="relative">
                                            <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                                            <input
                                                id={emailId}
                                                type="email"
                                                inputMode="email"
                                                autoComplete="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder={t.shareEmailPlaceholder}
                                                required
                                                disabled={loading || success}
                                                className="h-12 w-full rounded-[14px] border-none bg-chip pl-11 pr-4 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent disabled:opacity-50"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={handleClose}
                                            disabled={loading}
                                            className="h-12 flex-1 rounded-full bg-chip text-[15px] font-semibold text-on-surface transition-colors disabled:opacity-50"
                                        >
                                            {t.cancel}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading || success || !email}
                                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent transition-colors disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
                                        >
                                            {loading ? (
                                                <>
                                                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                    {t.sharing}
                                                </>
                                            ) : success ? (
                                                <>
                                                    <CheckCircle size={18} aria-hidden="true" />
                                                    {t.shared}
                                                </>
                                            ) : (
                                                <>
                                                    <UserPlus size={18} aria-hidden="true" />
                                                    {t.share}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </m.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};
