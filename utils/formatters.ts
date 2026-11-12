import { Currency } from '../types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getLocalCalendarDayTime = (date: Date): number => (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
);

export const formatCurrency = (amount: number, currency: Currency): string => {
    const safeAmount = Number.isFinite(amount) ? amount : 0;

    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(safeAmount);
    } catch {
        return `${safeAmount.toFixed(2)} ${currency}`;
    }
};

export const getRelativeDate = (dateString: string): string => {
    const date = new Date(dateString);
    const diffDays = Math.floor((getLocalCalendarDayTime(new Date()) - getLocalCalendarDayTime(date)) / MS_PER_DAY);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';

    if (diffDays < 0) {
        return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    }

    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

export const getShortDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
};
