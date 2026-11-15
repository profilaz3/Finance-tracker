import React, { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Mail, UserPlus, AlertCircle, CheckCircle, UserMinus } from 'lucide-react';
import { Illustration } from './ui/Illustration';
import { IconTile } from './ui/IconTile';
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
    /** Addresses the event is shared with now. */
    sharedEmails?: string[];
    /** Owner only: stop sharing with an address. Without it the list is read-only. */
    onUnshare?: (email: string) => void;
}

export const ShareEventModal: React.FC<ShareEventModalProps> = ({
    isOpen,
    onClose,
    onShare,
    eventName,
    sharedEmails = [],
    onUnshare,
}) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The address just shared with, for the "they'll see it after signing in" hint.
    const [sharedWith, setSharedWith] = useState<string | null>(null);
    const success = sharedWith !== null;
    const t = getTranslations();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSharedWith(null);

        try {
            const address = email.trim();
            await onShare(address);
            vibrate(HAPTIC_PATTERNS.success);
            // Stay open: the hint explains when they will see it, and the list shows the new share.
            setSharedWith(address.toLowerCase());
            setEmail('');
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
        setSharedWith(null);
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
                                    <IconTile icon={UserPlus} size={44} />
                                    <div className="min-w-0 flex-1">
                                        <h2 id={titleId} className="text-[22px] font-bold leading-tight tracking-[-0.4px]">{t.shareEvent}</h2>
                                        <p className="truncate text-[14px] text-muted">{eventName}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        aria-label={t.close}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                                    >
                                        <X size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
                                <div className="mb-4 flex items-center gap-3 rounded-[22px] bg-chip py-2 pl-1 pr-4">
                                    <span className="h-[72px] w-[90px] shrink-0" aria-hidden="true"><Illustration name="people" /></span>
                                    <p className="min-w-0 flex-1 text-[14px] leading-snug text-muted">{t.shareEventDescription}</p>
                                </div>

                                {error && (
                                    <div role="alert" className="mb-4 flex items-center gap-2 rounded-[16px] bg-neg/10 px-4 py-3 text-[14px] font-medium text-neg">
                                        <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div role="status" className="mb-4 flex items-start gap-2 rounded-[16px] bg-pos/10 px-4 py-3 text-[14px] font-medium text-pos">
                                        <CheckCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                                        <span className="min-w-0 break-words">{t.eventSharedHint.replace('{email}', sharedWith ?? '')}</span>
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
                                                onChange={(e) => {
                                                    setEmail(e.target.value);
                                                    setError(null);
                                                }}
                                                placeholder={t.shareEmailPlaceholder}
                                                required
                                                disabled={loading}
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
                                            {success ? t.done : t.cancel}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading || !email.trim()}
                                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent transition-colors disabled:cursor-not-allowed disabled:bg-chip disabled:text-faint"
                                        >
                                            {loading ? (
                                                <>
                                                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                    {t.sharing}
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

                                <section className="mt-5" aria-labelledby={`${titleId}-list`}>
                                    <h3 id={`${titleId}-list`} className="mb-1.5 px-1 text-[13px] font-semibold text-muted">{t.sharedWithList}</h3>
                                    {sharedEmails.length === 0 ? (
                                        <p className="px-1 text-[14px] text-faint">{t.shareListEmpty}</p>
                                    ) : (
                                        <ul className="paper-tile divide-y divide-hair px-3">
                                            {sharedEmails.map(address => (
                                                <li key={address} className="flex min-h-[52px] items-center gap-3 py-1.5">
                                                    <Mail size={16} className="shrink-0 text-muted" aria-hidden="true" />
                                                    <span className="min-w-0 flex-1 break-all text-[15px]">{address}</span>
                                                    {onUnshare && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (sharedWith === address) setSharedWith(null);
                                                                onUnshare(address);
                                                            }}
                                                            aria-label={t.stopSharingWith.replace('{email}', address)}
                                                            title={t.stopSharingWith.replace('{email}', address)}
                                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neg hover:bg-neg/10"
                                                        >
                                                            <UserMinus size={17} aria-hidden="true" />
                                                        </button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            </div>
                        </m.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};
