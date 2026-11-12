import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ResponsiveModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    className?: string;
    maxWidth?: string; // For desktop modal width
}

export const ResponsiveModal: React.FC<ResponsiveModalProps> = ({
    isOpen,
    onClose,
    children,
    title,
    className,
    maxWidth = 'max-w-md'
}) => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const handleDragEnd = (_: any, info: PanInfo) => {
        if (info.velocity.y > 500 || info.offset.y > 150) {
            onClose();
        }
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
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        onClick={onClose}
                        className="fixed inset-0 bg-scrim/40 backdrop-blur-md z-50"
                    />

                    {isMobile ? (
                        /* Mobile: Bottom Sheet */
                        <motion.div
                            initial={{ y: '100%', opacity: 0.8 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0.5 }}
                            transition={{
                                type: 'spring',
                                damping: 28,
                                stiffness: 350,
                                mass: 0.8
                            }}
                            drag="y"
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={{ top: 0, bottom: 0.4 }}
                            onDragEnd={handleDragEnd}
                            className={clsx(
                                "fixed bottom-0 left-0 right-0 z-50 bg-surface-container rounded-t-3xl flex flex-col max-h-[95vh]",
                                "shadow-elevation-4",
                                className
                            )}
                            style={{ touchAction: 'none' }}
                        >
                            {/* Drag Handle */}
                            <div className="flex-shrink-0 flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
                                <div className="w-12 h-1.5 bg-outline-variant/40 rounded-full" />
                            </div>

                            {/* Header */}
                            {title && (
                                <div className="flex-shrink-0 flex items-center justify-between px-6 pb-4 border-b border-outline-variant/20">
                                    <h2 className="text-xl font-display font-semibold text-on-surface">
                                        {title}
                                    </h2>
                                    <button
                                        onClick={onClose}
                                        className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                                    >
                                        <X size={20} className="text-on-surface-variant" />
                                    </button>
                                </div>
                            )}

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto overscroll-contain">
                                {children}
                            </div>

                            {/* Safe area padding */}
                            <div className="flex-shrink-0 h-[env(safe-area-inset-bottom)]" />
                        </motion.div>
                    ) : (
                        /* Desktop: Centered Modal */
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 8 }}
                            transition={{
                                type: 'spring',
                                stiffness: 400,
                                damping: 28,
                                mass: 0.8
                            }}
                            className={clsx(
                                "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
                                "bg-surface-container rounded-2xl flex flex-col max-h-[90vh] w-full",
                                "shadow-elevation-5",
                                maxWidth,
                                className
                            )}
                        >
                            {/* Header */}
                            {title && (
                                <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-outline-variant/20">
                                    <h2 className="text-xl font-display font-semibold text-on-surface">
                                        {title}
                                    </h2>
                                    <button
                                        onClick={onClose}
                                        className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                                    >
                                        <X size={20} className="text-on-surface-variant" />
                                    </button>
                                </div>
                            )}

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto">
                                {children}
                            </div>
                        </motion.div>
                    )}
                </>
            )}
        </AnimatePresence>
    );
};
