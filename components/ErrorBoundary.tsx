import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangleIcon, HomeIcon, RefreshIcon } from './icons/UiIcons';
import { getTranslations } from '../utils/i18n';

const IS_DEV = import.meta.env.DEV;

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    variant?: 'full' | 'inline';
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({ errorInfo });
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const variant = this.props.variant ?? 'full';
            const t = getTranslations();

            if (variant === 'inline') {
                return (
                    <div className="flex-1 flex items-center justify-center p-6">
                        <div className="bg-surface-container-low rounded-xl p-6 max-w-sm w-full text-center">
                            <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangleIcon className="w-6 h-6 text-error" />
                            </div>

                            <h3 className="text-lg font-medium text-on-surface mb-2">
                                {t.failedToLoad}
                            </h3>

                            <p className="text-sm text-on-surface-variant mb-4">
                                {t.sectionError}
                            </p>

                            <button
                                onClick={this.handleRetry}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-lg font-medium hover:bg-primary/90 transition-colors"
                            >
                                <RefreshIcon size={16} />
                                {t.retry}
                            </button>
                        </div>
                    </div>
                );
            }

            return (
                <div className="min-h-screen bg-surface flex items-center justify-center p-6">
                    <div className="bg-surface-container-low rounded-2xl p-8 max-w-md w-full text-center shadow-elevation-3">
                        <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangleIcon className="w-8 h-8 text-error" />
                        </div>

                        <h2 className="text-xl font-bold text-on-surface mb-2">
                            {t.somethingWentWrong}
                        </h2>

                        <p className="text-on-surface-variant mb-6">
                            {t.unexpectedErrorDataSafe}
                        </p>

                        {IS_DEV && this.state.error && (
                            <div className="bg-surface-container p-4 rounded-lg mb-6 text-left overflow-auto max-h-40">
                                <p className="text-xs font-mono text-error break-all">
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && (
                                    <pre className="text-xs font-mono text-on-surface-variant mt-2 whitespace-pre-wrap">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={this.handleRetry}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-on-primary rounded-xl font-medium hover:bg-primary/90 transition-colors"
                            >
                                <RefreshIcon size={18} />
                                {t.tryAgain}
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-surface-container text-on-surface rounded-xl font-medium hover:bg-surface-container-high transition-colors"
                            >
                                <HomeIcon size={18} />
                                {t.goHome}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

/** @deprecated Use `<ErrorBoundary variant="inline">` instead */
export const ViewErrorBoundary = (props: Omit<Props, 'variant'>) => (
    <ErrorBoundary {...props} variant="inline" />
);

// Hook for programmatic error reporting
export function useErrorHandler() {
    const handleError = (error: Error, context?: string) => {
        console.error(`Error${context ? ` in ${context}` : ''}:`, error);
    };

    return { handleError };
}

// Async error handler wrapper for try-catch patterns
export async function safeAsync<T>(
    fn: () => Promise<T>,
    fallback: T,
    onError?: (error: Error) => void
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('Async error:', err);
        onError?.(err);
        return fallback;
    }
}

// Type-safe result type for operations that can fail
export type Result<T, E = Error> =
    | { success: true; data: T }
    | { success: false; error: E };

export function ok<T>(data: T): Result<T> {
    return { success: true, data };
}

export function err<E = Error>(error: E): Result<never, E> {
    return { success: false, error };
}

// Wrap async functions to return Result type
export async function tryCatch<T>(
    fn: () => Promise<T>
): Promise<Result<T>> {
    try {
        const data = await fn();
        return ok(data);
    } catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
    }
}

// Error messages for common scenarios
export const ERROR_MESSAGES = {
    NETWORK: 'Network error. Please check your connection.',
    UNAUTHORIZED: 'Session expired. Please sign in again.',
    NOT_FOUND: 'The requested resource was not found.',
    VALIDATION: 'Please check your input and try again.',
    SERVER: 'Server error. Please try again later.',
    UNKNOWN: 'An unexpected error occurred.',
} as const;

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        if (error.message.includes('network') || error.message.includes('fetch')) {
            return ERROR_MESSAGES.NETWORK;
        }
        if (error.message.includes('401') || error.message.includes('unauthorized')) {
            return ERROR_MESSAGES.UNAUTHORIZED;
        }
        if (error.message.includes('404')) {
            return ERROR_MESSAGES.NOT_FOUND;
        }
        if (error.message.includes('500')) {
            return ERROR_MESSAGES.SERVER;
        }
        return error.message;
    }
    return ERROR_MESSAGES.UNKNOWN;
}
