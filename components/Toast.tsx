import React from 'react';
import { AlertCircleIcon, CheckCircleIcon, CloseIcon, InfoIcon, XCircleIcon } from './icons/UiIcons';

import type { Toast } from '../hooks/useToasts';

export type { Toast, ToastType } from '../hooks/useToasts';

interface ToastContainerProps {
    toasts: Toast[];
    onDismiss: (id: string) => void;
}

interface ToastItemProps {
    toast: Toast;
    onDismiss: (id: string) => void;
}

const ToastItem = React.memo<ToastItemProps>(({ toast, onDismiss }) => {
    const duration = toast.duration || 4000;

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
                    aria-label="Dismiss notification"
                    className="flex-shrink-0 hover:opacity-70 transition-opacity"
                >
                    <CloseIcon size={14} aria-hidden="true" />
                </button>
            </div>
            {/* Progress bar: a compositor-only CSS animation instead of a 50ms state interval */}
            <div className="h-0.5 w-full bg-scrim/10" aria-hidden="true">
                <div
                    className={`toast-progress h-full ${progressColors[toast.type]}`}
                    style={{ animationDuration: `${duration}ms` }}
                />
            </div>
        </div>
    );
});
ToastItem.displayName = 'ToastItem';

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
    return (
        <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] z-[200] space-y-2 max-w-xs w-auto">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
};
