import React, { useState, useEffect, useId } from 'react';
import type { QueuedOperation } from '../services/offlineQueue';
import { getOfflineQueue } from '../services/runtimeServices';
import clsx from 'clsx';
import { useEscapeKey } from '../hooks/useFocusTrap';
import { AlertCircleIcon, CheckIcon, CloudIcon, RefreshIcon, WifiOffIcon } from './icons/UiIcons';
import { getTranslations } from '../utils/i18n';

interface SyncStatusProps {
    className?: string;
    showDetails?: boolean;
    /** Where the details popup opens relative to the button. */
    placement?: 'below' | 'above';
    /** Extra classes for the text label shown with showDetails (e.g. responsive visibility). */
    labelClassName?: string;
}

type SyncState = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';
type OfflineQueueInstance = Awaited<ReturnType<typeof getOfflineQueue>>;

export const SyncStatus: React.FC<SyncStatusProps> = ({ className, showDetails = false, placement = 'below', labelClassName }) => {
    const t = getTranslations();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState<OfflineQueueInstance | null>(null);
    const [queue, setQueue] = useState<QueuedOperation[]>([]);
    const [showPopup, setShowPopup] = useState(false);
    const popupId = useId();

    useEffect(() => {
        let unsubscribe = () => {};
        let cancelled = false;

        getOfflineQueue().then(queueService => {
            if (cancelled) return;

            setOfflineQueue(queueService);
            setQueue(queueService.getQueue());
            unsubscribe = queueService.subscribe(setQueue);
        });

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            cancelled = true;
            unsubscribe();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const hasErrors = queue.some(op => op.lastError);
    const pendingCount = queue.length;

    const getSyncState = (): SyncState => {
        if (!isOnline) return 'offline';
        if (hasErrors) return 'error';
        if (offlineQueue?.processing) return 'syncing';
        if (pendingCount > 0) return 'pending';
        return 'synced';
    };

    const state = getSyncState();
    const hasDetails = pendingCount > 0 || !isOnline;
    const isPopupOpen = showPopup && hasDetails;

    useEscapeKey(() => setShowPopup(false), isPopupOpen);

    const getIcon = () => {
        switch (state) {
            case 'offline':
                return <WifiOffIcon size={16} />;
            case 'syncing':
                return <RefreshIcon size={16} className="animate-spin" />;
            case 'error':
                return <AlertCircleIcon size={16} />;
            case 'pending':
                return <CloudIcon size={16} />;
            case 'synced':
            default:
                return <CheckIcon size={16} />;
        }
    };

    const getLabel = () => {
        switch (state) {
            case 'offline':
                return t.offline;
            case 'syncing':
                return t.syncing;
            case 'error':
                return t.syncFailedCount.replace('{count}', String(pendingCount));
            case 'pending':
                return t.syncPendingCount.replace('{count}', String(pendingCount));
            case 'synced':
            default:
                return t.synced;
        }
    };

    const getColor = () => {
        switch (state) {
            case 'offline':
                return 'text-error bg-error/20';
            case 'syncing':
                return 'text-primary bg-primary/10';
            case 'error':
                return 'text-error bg-error/10';
            case 'pending':
                return 'text-tertiary bg-tertiary/10';
            case 'synced':
            default:
                return 'text-on-surface-variant bg-surface-container';
        }
    };

    const handleRetry = async () => {
        if (!offlineQueue) return;
        await offlineQueue.retryAll();
    };

    return (
        <div className={clsx('relative', className)}>
            <button
                type="button"
                onClick={() => hasDetails && setShowPopup(!showPopup)}
                aria-label={getLabel()}
                aria-expanded={hasDetails ? isPopupOpen : undefined}
                aria-controls={isPopupOpen ? popupId : undefined}
                title={getLabel()}
                className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all relative',
                    getColor(),
                    hasDetails && 'cursor-pointer hover:opacity-80',
                    state === 'offline' && 'animate-pulse'
                )}
            >
                {/* Pulsing ring for offline state */}
                {state === 'offline' && (
                    <span
                        className="absolute inset-0 rounded-full bg-error/20 animate-ping"
                        aria-hidden="true"
                    />
                )}
                <span className="relative z-10 flex items-center gap-1.5" aria-hidden="true">
                    {getIcon()}
                    {showDetails && <span className={labelClassName}>{getLabel()}</span>}
                </span>
                {/* Badge for pending count */}
                {pendingCount > 0 && !showDetails && (
                    <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-primary text-on-primary text-[10px] font-bold rounded-full flex items-center justify-center">
                        {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                )}
            </button>

            {/* Popup with queue details */}
            {isPopupOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowPopup(false)}
                        aria-hidden="true"
                    />
                    <div
                        id={popupId}
                        className={clsx(
                            'app-view-enter absolute w-80 max-w-[calc(100vw-2rem)] bg-surface-container-high rounded-xl shadow-elevation-3 border border-outline-variant/20 overflow-hidden z-50',
                            placement === 'above' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'
                        )}
                    >
                            {/* Offline banner */}
                            {!isOnline && (
                                <div className="bg-error/20 p-3 flex items-center gap-2 border-b border-error/20">
                                    <WifiOffIcon size={18} className="text-error" />
                                    <div>
                                        <p className="text-sm font-medium text-error">{t.youAreOffline}</p>
                                        <p className="text-xs text-error/70">{t.changesWillSyncOnline}</p>
                                    </div>
                                </div>
                            )}

                            {pendingCount > 0 && (
                                <>
                                    <div className="p-3 border-b border-outline-variant/20">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-on-surface">
                                                {(pendingCount === 1 ? t.pendingOperationsOne : t.pendingOperationsOther).replace('{count}', String(pendingCount))}
                                            </span>
                                            {hasErrors && isOnline && (
                                                <button
                                                    onClick={handleRetry}
                                                    className="text-xs text-primary hover:underline font-medium"
                                                >
                                                    {t.retryAll}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {queue.map(op => (
                                            <div
                                                key={op.id}
                                                className="px-3 py-2 border-b border-outline-variant/10 last:border-0"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-on-surface capitalize">
                                                        {op.action} {op.type}
                                                    </span>
                                                    {op.lastError && (
                                                        <span className="text-xs text-error font-medium">
                                                            {t.syncFailedRetries.replace('{count}', String(op.retries))}
                                                        </span>
                                                    )}
                                                </div>
                                                {op.lastError && (
                                                    <p className="text-xs text-error/70 mt-0.5 truncate">
                                                        {op.lastError}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {isOnline && pendingCount === 0 && (
                                <div className="p-4 text-center">
                                    <CheckIcon size={24} className="text-tertiary mx-auto mb-2" />
                                    <p className="text-sm text-on-surface-variant">{t.allChangesSynced}</p>
                                </div>
                            )}
                    </div>
                </>
            )}
        </div>
    );
};

// Minimal version for mobile nav - more prominent when offline
export const SyncIndicator: React.FC<{ className?: string }> = ({ className }) => {
    const t = getTranslations();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        let unsubscribe = () => {};
        let cancelled = false;

        getOfflineQueue().then(queueService => {
            if (cancelled) return;

            setPendingCount(queueService.length);
            unsubscribe = queueService.subscribe(q => setPendingCount(q.length));
        });

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            cancelled = true;
            unsubscribe();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Only show indicator when there's something to show
    if (isOnline && pendingCount === 0) return null;

    return (
        <div className={clsx('flex items-center gap-1', className, !isOnline && 'animate-pulse')}>
            {!isOnline ? (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/20">
                    <WifiOffIcon size={12} className="text-error" />
                    <span className="text-[10px] font-medium text-error">{t.offline}</span>
                </div>
            ) : pendingCount > 0 ? (
                <div className="relative">
                    <RefreshIcon size={14} className="text-primary animate-spin" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary text-on-primary text-[8px] rounded-full flex items-center justify-center">
                        {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                </div>
            ) : null}
        </div>
    );
};
