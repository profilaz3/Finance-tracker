import React, { useEffect, useState } from 'react';
import { AlertCircleIcon, CheckCircleIcon, CloseIcon, InfoIcon, XCircleIcon } from './icons/UiIcons';
import { getTranslations } from '../utils/i18n';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    action?: {
        label: string;
        onClick: () => void;
    };
}

interface ToastContainerProps {
    toasts: Toast[];
    onDismiss: (id: string) => void;
}

interface ToastItemProps {
    toast: Toast;
    onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
    const t = getTranslations();
    const [progress, setProgress] = useState(100);
    const duration = toast.duration || 4000;

    useEffect(() => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
            setProgress(remaining);

            if (remaining <= 0) {
                clearInterval(interval);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [duration]);

    const icons = {
        success: CheckCircleIcon,
        error: XCircleIcon,
        warning: AlertCircleIcon,
        info: InfoIcon
    };

    const colors = {
        success: 'bg-tertiary text-on-tertiary',
        error: 'bg-error text-on-error',
        warning: 'bg-warning text-on-warning',
        info: 'bg-primary text-on-primary'
    };

    const progressColors = {
        success: 'bg-on-tertiary/30',
        error: 'bg-on-error/30',
        warning: 'bg-on-warning/30',
        info: 'bg-on-primary/30'
    };

    const Icon = icons[toast.type];

    return (
        <div
            role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' || toast.type === 'warning' ? 'assertive' : 'polite'}
            className={`${colors[toast.type]} toast-enter rounded-xl shadow-elevation-3 overflow-hidden`}
        >
            <div className="p-3 flex items-start gap-2">
                <Icon size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium break-words">{toast.message}</p>
                    {toast.action && (
                        <button
                            onClick={() => {
                                toast.action!.onClick();
                                onDismiss(toast.id);
                            }}
                            className="text-xs font-bold underline mt-2 hover:opacity-80"
                        >
                            {toast.action.label}
                        </button>
                    )}
                </div>
                <button
                    onClick={() => onDismiss(toast.id)}
                    aria-label={t.dismissNotification}
                    className="flex-shrink-0 hover:opacity-70 transition-opacity"
                >
                    <CloseIcon size={14} aria-hidden="true" />
                </button>
            </div>
            {/* Progress bar */}
            <div className="h-0.5 w-full bg-scrim/10">
                <div
                    className={`h-full ${progressColors[toast.type]}`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
    return (
        <div className="fixed top-4 right-4 z-[200] space-y-2 max-w-xs w-auto">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
};
