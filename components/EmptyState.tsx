import React from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';

// SVG Illustrations for different empty states
const illustrations = {
    transactions: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="30" y="40" width="140" height="90" rx="12" className="fill-[var(--paper-tile)]" />
            <rect x="45" y="55" width="80" height="8" rx="4" className="fill-accent/20" />
            <rect x="45" y="70" width="60" height="6" rx="3" className="fill-faint/20" />
            <rect x="45" y="85" width="80" height="8" rx="4" className="fill-accent/20" />
            <rect x="45" y="100" width="50" height="6" rx="3" className="fill-faint/20" />
            <circle cx="150" cy="62" r="12" className="fill-pos/25" />
            <circle cx="150" cy="92" r="12" className="fill-neg/25" />
            <path d="M145 60L148 63L155 56" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-pos" />
            <path d="M146 92H154M150 88V96" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="stroke-neg" />
        </svg>
    ),
    calendar: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="35" y="30" width="130" height="110" rx="12" className="fill-[var(--paper-tile)]" />
            <rect x="35" y="30" width="130" height="30" rx="12" className="fill-accent/20" />
            <circle cx="55" cy="20" r="6" className="fill-faint/30" />
            <circle cx="145" cy="20" r="6" className="fill-faint/30" />
            <rect x="53" y="12" width="4" height="20" rx="2" className="fill-faint/40" />
            <rect x="143" y="12" width="4" height="20" rx="2" className="fill-faint/40" />
            {[0, 1, 2, 3, 4].map((row) =>
                [0, 1, 2, 3, 4, 5, 6].map((col) => (
                    <rect
                        key={`${row}-${col}`}
                        x={48 + col * 16}
                        y={70 + row * 14}
                        width="12"
                        height="10"
                        rx="2"
                        className={col >= 5 ? "fill-accent/10" : "fill-chip"}
                    />
                ))
            )}
            <rect x="80" y="84" width="12" height="10" rx="2" className="fill-accent/40" />
        </svg>
    ),
    people: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="100" cy="60" r="30" className="fill-[var(--paper-tile)]" />
            <circle cx="100" cy="52" r="12" className="fill-accent/30" />
            <ellipse cx="100" cy="78" rx="18" ry="10" className="fill-accent/30" />
            <circle cx="55" cy="80" r="20" className="fill-[var(--paper-tile)]" />
            <circle cx="55" cy="74" r="8" className="fill-faint/20" />
            <ellipse cx="55" cy="90" rx="12" ry="6" className="fill-faint/20" />
            <circle cx="145" cy="80" r="20" className="fill-[var(--paper-tile)]" />
            <circle cx="145" cy="74" r="8" className="fill-faint/20" />
            <ellipse cx="145" cy="90" rx="12" ry="6" className="fill-faint/20" />
            <path d="M70 100C75 110 85 118 100 120C115 118 125 110 130 100" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" className="stroke-accent/30" />
        </svg>
    ),
    receipt: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M60 20L65 30L70 20L75 30L80 20L85 30L90 20L95 30L100 20L105 30L110 20L115 30L120 20L125 30L130 20L135 30L140 20V130L135 120L130 130L125 120L120 130L115 120L110 130L105 120L100 130L95 120L90 130L85 120L80 130L75 120L70 130L65 120L60 130V20Z" className="fill-[var(--paper-tile)]" />
            <rect x="75" y="45" width="50" height="6" rx="3" className="fill-faint/30" />
            <rect x="75" y="60" width="35" height="4" rx="2" className="fill-faint/20" />
            <rect x="75" y="75" width="50" height="6" rx="3" className="fill-faint/30" />
            <rect x="75" y="90" width="30" height="4" rx="2" className="fill-faint/20" />
            <rect x="75" y="105" width="50" height="8" rx="4" className="fill-accent/30" />
        </svg>
    ),
    chart: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="30" y="120" width="20" height="30" rx="4" className="fill-accent/30" />
            <rect x="60" y="90" width="20" height="60" rx="4" className="fill-accent/40" />
            <rect x="90" y="60" width="20" height="90" rx="4" className="fill-accent/50" />
            <rect x="120" y="80" width="20" height="70" rx="4" className="fill-accent/40" />
            <rect x="150" y="100" width="20" height="50" rx="4" className="fill-accent/30" />
            <path d="M40 110L70 80L100 50L130 70L160 90" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-pos" />
            <circle cx="40" cy="110" r="4" className="fill-pos" />
            <circle cx="70" cy="80" r="4" className="fill-pos" />
            <circle cx="100" cy="50" r="4" className="fill-pos" />
            <circle cx="130" cy="70" r="4" className="fill-pos" />
            <circle cx="160" cy="90" r="4" className="fill-pos" />
        </svg>
    ),
    wallet: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <rect x="30" y="40" width="140" height="90" rx="16" className="fill-[var(--paper-tile)]" />
            <rect x="30" y="40" width="140" height="30" rx="8" className="fill-accent/20" />
            <rect x="120" y="75" width="50" height="30" rx="8" className="fill-chip" />
            <circle cx="140" cy="90" r="8" className="fill-accent/40" />
            <rect x="45" y="85" width="50" height="6" rx="3" className="fill-faint/20" />
            <rect x="45" y="98" width="35" height="4" rx="2" className="fill-faint/10" />
        </svg>
    ),
    search: (
        <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="90" cy="70" r="40" className="fill-[var(--paper-tile)]" />
            <circle cx="90" cy="70" r="30" className="stroke-accent/40" strokeWidth="4" fill="none" />
            <path d="M115 95L145 125" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="stroke-accent/40" />
            <path d="M78 60L82 70L95 55" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-pos/70" />
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
        /** Leading icon; defaults to a plus. Pass null for none. */
        icon?: React.ComponentType<any> | null;
    };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, illustration, title, description, action }) => {
    const reduceMotion = useReducedMotion();
    const float = reduceMotion ? undefined : { y: [0, -6, 0] };

    return (
        <m.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center justify-center px-6 py-10 text-center sm:py-14"
        >
            {illustration ? (
                <m.div
                    className="relative mb-5 h-36 w-44"
                    animate={float}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    aria-hidden="true"
                >
                    <div className="absolute inset-x-6 inset-y-2 rounded-full bg-accent-soft" />
                    <div className="relative h-full w-full drop-shadow-[0_8px_18px_rgba(18,18,18,0.08)]">
                        {illustrations[illustration]}
                    </div>
                </m.div>
            ) : Icon ? (
                <m.div
                    className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent-soft text-accent"
                    animate={float}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    aria-hidden="true"
                >
                    <Icon size={30} strokeWidth={2} />
                </m.div>
            ) : null}

            <h3 className="text-[20px] font-semibold leading-tight tracking-tight text-on-surface">
                {title}
            </h3>

            <p className="mt-2 max-w-[300px] text-[15px] leading-snug text-muted">
                {description}
            </p>

            {action && (
                <m.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 420, damping: 28 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={action.onClick}
                    className="no-press mt-6 flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-on-accent shadow-[0_10px_24px_-12px_rgb(var(--accent-rgb)/0.7)]"
                >
                    {action.icon !== null && React.createElement(action.icon ?? Plus, { size: 18, strokeWidth: 2.6, 'aria-hidden': true })}
                    {action.label}
                </m.button>
            )}
        </m.div>
    );
};

export const LoadingSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <div className={`relative overflow-hidden bg-chip rounded-lg ${className}`}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-on-surface/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
        </div>
    );
};

export const TransactionSkeleton: React.FC = () => {
    return (
        <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
                <m.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="paper-tile flex items-center gap-4 !rounded-[20px] p-4"
                >
                    <LoadingSkeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <LoadingSkeleton className="h-4 w-1/3" />
                        <LoadingSkeleton className="h-3 w-1/2" />
                    </div>
                    <LoadingSkeleton className="h-4 w-16 flex-shrink-0" />
                </m.div>
            ))}
        </div>
    );
};
