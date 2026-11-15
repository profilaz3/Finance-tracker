import React from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import { Illustration, type IllustrationName } from './ui/Illustration';

type IllustrationType = IllustrationName;

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
                    <div className="absolute inset-x-6 inset-y-2 rounded-full bg-accent-soft blur-[2px]" />
                    <div className="relative h-full w-full drop-shadow-[0_8px_18px_rgba(18,18,18,0.08)]">
                        <Illustration name={illustration} />
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
