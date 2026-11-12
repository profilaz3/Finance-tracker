import React, { useEffect } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { MOTION } from '../config';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    snapPoints?: number[]; // Heights as percentages [0.5, 0.9] means 50% and 90%
    initialSnap?: number; // Index of initial snap point
    className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
    isOpen,
    onClose,
    children,
    title,
    snapPoints = [0.9],
    initialSnap = 0,
    className
}) => {
    const dragControls = useDragControls();
    const [currentHeight, setCurrentHeight] = React.useState(snapPoints[initialSnap]);

    // Prevent body scroll when sheet is open
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

    const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const velocity = info.velocity.y;
        const offset = info.offset.y;

        // If dragged down fast or far enough, close
        if (velocity > 500 || offset > 150) {
            onClose();
            return;
        }

        // Snap to nearest point
        const windowHeight = window.innerHeight;
        const currentY = windowHeight * (1 - currentHeight) + offset;
        const currentPercent = 1 - (currentY / windowHeight);

        let nearestSnap = snapPoints[0];
        let minDiff = Math.abs(currentPercent - snapPoints[0]);

        for (const snap of snapPoints) {
            const diff = Math.abs(currentPercent - snap);
            if (diff < minDiff) {
                minDiff = diff;
                nearestSnap = snap;
            }
        }

        setCurrentHeight(nearestSnap);
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

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: `${(1 - currentHeight) * 100}%`, opacity: 1 }}
                        exit={MOTION.sheet.exit}
                        transition={MOTION.sheet.spring}
                        drag="y"
                        dragControls={dragControls}
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.15}
                        onDragEnd={handleDragEnd}
                        className={clsx(
                            "fixed bottom-0 left-0 right-0 z-50 bg-surface-container rounded-t-3xl flex flex-col",
                            "shadow-elevation-4",
                            className
                        )}
                        style={{
                            height: `${currentHeight * 100}vh`,
                            maxHeight: '95vh',
                            touchAction: 'none'
                        }}
                    >
                        {/* Drag Handle */}
                        <div
                            className="flex-shrink-0 flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
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
                        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                            {children}
                        </div>

                        {/* Safe area padding for mobile */}
                        <div className="flex-shrink-0 h-[env(safe-area-inset-bottom)]" />
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
