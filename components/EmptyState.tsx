import React from 'react';
import { motion } from 'motion/react';
import { Receipt, TrendingUp, Plus } from 'lucide-react';

// SVG Illustrations for different empty states
const illustrations = {
    transactions: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="30" y="40" width="140" height="90" rx="12" className="fill-surface-container-high" />
            <rect x="45" y="55" width="80" height="8" rx="4" className="fill-primary/20" />
            <rect x="45" y="70" width="60" height="6" rx="3" className="fill-on-surface-variant/20" />
            <rect x="45" y="85" width="80" height="8" rx="4" className="fill-primary/20" />
            <rect x="45" y="100" width="50" height="6" rx="3" className="fill-on-surface-variant/20" />
            <circle cx="150" cy="62" r="12" className="fill-tertiary/30" />
            <circle cx="150" cy="92" r="12" className="fill-error/30" />
            <path d="M145 60L148 63L155 56" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-tertiary" />
            <path d="M146 92H154M150 88V96" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="stroke-error" />
        </svg>
    ),
    calendar: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="35" y="30" width="130" height="110" rx="12" className="fill-surface-container-high" />
            <rect x="35" y="30" width="130" height="30" rx="12" className="fill-primary/20" />
            <circle cx="55" cy="20" r="6" className="fill-on-surface-variant/30" />
            <circle cx="145" cy="20" r="6" className="fill-on-surface-variant/30" />
            <rect x="55" cy="15" width="4" height="20" rx="2" className="fill-on-surface-variant/40" />
            <rect x="143" cy="15" width="4" height="20" rx="2" className="fill-on-surface-variant/40" />
            {[0, 1, 2, 3, 4].map((row) =>
                [0, 1, 2, 3, 4, 5, 6].map((col) => (
                    <rect
                        key={`${row}-${col}`}
                        x={48 + col * 16}
                        y={70 + row * 14}
                        width="12"
                        height="10"
                        rx="2"
                        className={col >= 5 ? "fill-primary/10" : "fill-surface-container"}
                    />
                ))
            )}
            <rect x="80" y="84" width="12" height="10" rx="2" className="fill-primary/40" />
        </svg>
    ),
    people: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="100" cy="60" r="30" className="fill-surface-container-high" />
            <circle cx="100" cy="52" r="12" className="fill-primary/30" />
            <ellipse cx="100" cy="78" rx="18" ry="10" className="fill-primary/30" />
            <circle cx="55" cy="80" r="20" className="fill-surface-container-high" />
            <circle cx="55" cy="74" r="8" className="fill-on-surface-variant/20" />
            <ellipse cx="55" cy="90" rx="12" ry="6" className="fill-on-surface-variant/20" />
            <circle cx="145" cy="80" r="20" className="fill-surface-container-high" />
            <circle cx="145" cy="74" r="8" className="fill-on-surface-variant/20" />
            <ellipse cx="145" cy="90" rx="12" ry="6" className="fill-on-surface-variant/20" />
            <path d="M70 100C75 110 85 118 100 120C115 118 125 110 130 100" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" className="stroke-primary/30" />
        </svg>
    ),
    receipt: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M60 20L65 30L70 20L75 30L80 20L85 30L90 20L95 30L100 20L105 30L110 20L115 30L120 20L125 30L130 20L135 30L140 20V130L135 120L130 130L125 120L120 130L115 120L110 130L105 120L100 130L95 120L90 130L85 120L80 130L75 120L70 130L65 120L60 130V20Z" className="fill-surface-container-high" />
            <rect x="75" y="45" width="50" height="6" rx="3" className="fill-on-surface-variant/30" />
            <rect x="75" y="60" width="35" height="4" rx="2" className="fill-on-surface-variant/20" />
            <rect x="75" y="75" width="50" height="6" rx="3" className="fill-on-surface-variant/30" />
            <rect x="75" y="90" width="30" height="4" rx="2" className="fill-on-surface-variant/20" />
            <rect x="75" y="105" width="50" height="8" rx="4" className="fill-primary/30" />
        </svg>
    ),
    chart: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="30" y="120" width="20" height="30" rx="4" className="fill-primary/30" />
            <rect x="60" y="90" width="20" height="60" rx="4" className="fill-primary/40" />
            <rect x="90" y="60" width="20" height="90" rx="4" className="fill-primary/50" />
            <rect x="120" y="80" width="20" height="70" rx="4" className="fill-primary/40" />
            <rect x="150" y="100" width="20" height="50" rx="4" className="fill-primary/30" />
            <path d="M40 110L70 80L100 50L130 70L160 90" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-tertiary" />
            <circle cx="40" cy="110" r="4" className="fill-tertiary" />
            <circle cx="70" cy="80" r="4" className="fill-tertiary" />
            <circle cx="100" cy="50" r="4" className="fill-tertiary" />
            <circle cx="130" cy="70" r="4" className="fill-tertiary" />
            <circle cx="160" cy="90" r="4" className="fill-tertiary" />
        </svg>
    ),
    wallet: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="30" y="40" width="140" height="90" rx="16" className="fill-surface-container-high" />
            <rect x="30" y="40" width="140" height="30" rx="8" className="fill-primary/20" />
            <rect x="120" y="75" width="50" height="30" rx="8" className="fill-surface-container" />
            <circle cx="140" cy="90" r="8" className="fill-primary/40" />
            <rect x="45" y="85" width="50" height="6" rx="3" className="fill-on-surface-variant/20" />
            <rect x="45" y="98" width="35" height="4" rx="2" className="fill-on-surface-variant/10" />
        </svg>
    ),
    search: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="90" cy="70" r="40" className="fill-surface-container-high" />
            <circle cx="90" cy="70" r="30" className="stroke-primary/40" strokeWidth="4" fill="none" />
            <path d="M115 95L145 125" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="stroke-primary/40" />
            <path d="M78 60L82 70L95 55" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-tertiary/50" />
        </svg>
    )
};

type IllustrationType = keyof typeof illustrations;

interface EmptyStateProps {
    icon?: React.ComponentType<any>;
    illustration?: IllustrationType;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, illustration, title, description, action }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-col items-center justify-center p-8 sm:p-12 text-center"
        >
            {/* Floating illustration with subtle animation */}
            {illustration ? (
                <motion.div
                    className="w-48 h-40 mb-6 relative"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                    {/* Soft glow behind illustration */}
                    <div className="absolute inset-0 bg-primary/5 rounded-full blur-3xl scale-75" />
                    <div className="relative">
                        {illustrations[illustration]}
                    </div>
                </motion.div>
            ) : Icon ? (
                <motion.div
                    className="relative mb-6"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                    {/* Animated rings */}
                    <motion.div
                        className="absolute inset-0 rounded-full bg-primary/10"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    />
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-surface-container-high to-surface-container-highest flex items-center justify-center shadow-lg">
                        <Icon size={36} className="text-on-surface-variant" />
                    </div>
                </motion.div>
            ) : null}

            {/* Title with staggered animation */}
            <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="text-xl sm:text-2xl font-display font-semibold text-on-surface mb-2"
            >
                {title}
            </motion.h3>

            {/* Description */}
            <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="text-on-surface-variant mb-8 max-w-sm text-sm sm:text-base leading-relaxed"
            >
                {description}
            </motion.p>

            {/* Enhanced CTA button */}
            {action && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 400, damping: 25 }}
                    whileHover={{ scale: 1.05, boxShadow: "0 10px 30px -10px rgba(var(--primary-rgb), 0.4)" }}
                    whileTap={{ scale: 0.95 }}
                    onClick={action.onClick}
                    className="group relative px-8 py-3 bg-primary text-on-primary rounded-full font-semibold shadow-lg hover:shadow-xl transition-all overflow-hidden"
                >
                    {/* Button shine effect */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <span className="relative flex items-center gap-2">
                        <Plus size={18} className="opacity-80" />
                        {action.label}
                    </span>
                </motion.button>
            )}
        </motion.div>
    );
};

export const LoadingSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <div className={`relative overflow-hidden bg-surface-container-high rounded-lg ${className}`}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-on-surface/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
        </div>
    );
};

export const TransactionSkeleton: React.FC = () => {
    return (
        <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-4 p-4 bg-surface-container rounded-xl"
                >
                    <LoadingSkeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <LoadingSkeleton className="h-4 w-1/3" />
                        <LoadingSkeleton className="h-3 w-1/2" />
                    </div>
                    <LoadingSkeleton className="h-4 w-16 flex-shrink-0" />
                </motion.div>
            ))}
        </div>
    );
};
