import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className,
    variant = 'text',
    width,
    height,
    animation = 'pulse'
}) => {
    const baseClasses = 'bg-on-surface/10';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: '',
        rounded: 'rounded-xl'
    };

    const animationClasses = {
        pulse: 'animate-pulse',
        wave: 'animate-shimmer',
        none: ''
    };

    const style: React.CSSProperties = {
        width: width,
        height: height || (variant === 'text' ? '1em' : undefined)
    };

    return (
        <div
            className={clsx(
                baseClasses,
                variantClasses[variant],
                animationClasses[animation],
                className
            )}
            style={style}
        />
    );
};

// Pre-built skeleton patterns for common use cases
export const TransactionSkeleton: React.FC = () => (
    <div className="bg-surface-container-low p-4 rounded-xl flex items-center gap-4">
        <Skeleton variant="circular" width={44} height={44} />
        <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="60%" height={16} />
            <Skeleton variant="text" width="40%" height={12} />
        </div>
        <div className="text-right space-y-2">
            <Skeleton variant="text" width={80} height={16} />
            <Skeleton variant="text" width={50} height={12} />
        </div>
    </div>
);

export const AccountCardSkeleton: React.FC = () => (
    <div className="bg-surface-container p-5 rounded-2xl space-y-3">
        <div className="flex items-center gap-3">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="50%" height={16} />
                <Skeleton variant="text" width="30%" height={12} />
            </div>
        </div>
        <Skeleton variant="text" width="70%" height={24} />
    </div>
);

export const BalanceCardSkeleton: React.FC = () => (
    <div className="bg-surface-container-low p-6 rounded-2xl space-y-4">
        <Skeleton variant="text" width="40%" height={14} />
        <Skeleton variant="text" width="60%" height={32} />
        <div className="flex gap-4">
            <Skeleton variant="rounded" width="45%" height={60} />
            <Skeleton variant="rounded" width="45%" height={60} />
        </div>
    </div>
);

export const ChartSkeleton: React.FC = () => (
    <div className="bg-surface-container-low p-4 rounded-2xl">
        <Skeleton variant="text" width="30%" height={18} className="mb-4" />
        <Skeleton variant="rounded" width="100%" height={200} />
    </div>
);

export const DashboardSkeleton: React.FC = () => (
    <div className="space-y-6 p-6">
        {/* Balance cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BalanceCardSkeleton />
            <BalanceCardSkeleton />
            <BalanceCardSkeleton />
        </div>

        {/* Chart */}
        <ChartSkeleton />

        {/* Recent transactions */}
        <div className="space-y-3">
            <Skeleton variant="text" width="40%" height={20} className="mb-4" />
            <TransactionSkeleton />
            <TransactionSkeleton />
            <TransactionSkeleton />
        </div>
    </div>
);

export const TransactionsListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
    <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
            <TransactionSkeleton key={i} />
        ))}
    </div>
);

export const GenericViewSkeleton: React.FC = () => (
    <div className="space-y-6 p-6">
        <Skeleton variant="text" width="40%" height={28} />
        {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" width="100%" height={56} />
        ))}
    </div>
);

export const CalendarSkeleton: React.FC = () => (
    <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
            <Skeleton variant="text" width="40%" height={28} />
            <div className="flex gap-2">
                <Skeleton variant="circular" width={36} height={36} />
                <Skeleton variant="circular" width={36} height={36} />
            </div>
        </div>
        <div className="bg-surface-container-low rounded-2xl p-4">
            <div className="grid grid-cols-7 gap-2 mb-2">
                {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} variant="text" width="100%" height={14} />
                ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} variant="rounded" width="100%" height={48} />
                ))}
            </div>
        </div>
    </div>
);
