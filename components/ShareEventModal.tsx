import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { MOTION } from '../config';
import { getTranslations } from '../utils/i18n';

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
            setError(key ? t[key] : t.shareEventFailed);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setEmail('');
        setError(null);
        setSuccess(false);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-scrim/50 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
                        <motion.div
                            initial={MOTION.modal.initial}
                            animate={MOTION.modal.animate}
                            exit={MOTION.modal.exit}
                            transition={MOTION.modal.spring}
                            className="bg-surface-container-low rounded-2xl shadow-elevation-3 w-full max-w-md border border-outline-variant/20 pointer-events-auto"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <UserPlus size={20} className="text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-on-surface">{t.shareEvent}</h2>
                                        <p className="text-sm text-on-surface-variant">{eventName}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container rounded-full transition-colors"
                                >
                                    <X size={20} className="text-on-surface-variant" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6">
                                <p className="text-sm text-on-surface-variant mb-4">
                                    {t.shareEventDescription}
                                </p>

                                {error && (
                                    <div className="bg-error-container text-on-error-container p-3 rounded-lg mb-4 flex items-center gap-2 text-sm">
                                        <AlertCircle size={16} />
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="bg-primary/10 text-primary p-3 rounded-lg mb-4 flex items-center gap-2 text-sm">
                                        <CheckCircle size={16} />
                                        {t.eventSharedSuccess}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-on-surface-variant mb-2">
                                            {t.emailAddress}
                                        </label>
                                        <div className="relative">
                                            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder={t.shareEmailPlaceholder}
                                                required
                                                disabled={loading || success}
                                                className="w-full pl-10 pr-4 py-3 bg-surface-container-high border-none rounded-lg text-on-surface placeholder-on-surface-variant/60 focus:ring-2 focus:ring-primary disabled:opacity-50"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleClose}
                                            disabled={loading}
                                            className="flex-1 px-4 py-3 bg-surface-container text-on-surface rounded-lg font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50"
                                        >
                                            {t.cancel}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading || success || !email}
                                            className="flex-1 px-4 py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {loading ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                                                    {t.sharing}
                                                </>
                                            ) : success ? (
                                                <>
                                                    <CheckCircle size={18} />
                                                    {t.shared}
                                                </>
                                            ) : (
                                                <>
                                                    <UserPlus size={18} />
                                                    {t.share}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};
