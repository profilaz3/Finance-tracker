import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getSupabaseService } from '../services/runtimeServices';

/**
 * Auth redirect handling that complements useAuth:
 * - sign-up with an email-confirmation redirect,
 * - "forgot password" (resetPasswordForEmail) and the PASSWORD_RECOVERY event,
 * - setting a new password (updateUser),
 * - cleaning Supabase tokens / error params out of the URL after supabase-js
 *   (detectSessionInUrl) has consumed them.
 */

export interface AuthRedirectInfo {
    /** `type` from an implicit-flow callback (recovery, signup, magiclink, ...). */
    type: string | null;
    /** Supabase error code from a failed redirect (e.g. otp_expired). */
    errorCode: string | null;
    hasAuthParams: boolean;
}

const AUTH_PARAM_KEYS = [
    'access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'provider_token',
    'provider_refresh_token', 'type', 'code', 'error', 'error_code', 'error_description', 'sb',
];

export const parseAuthRedirect = (href: string): AuthRedirectInfo => {
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return { type: null, errorCode: null, hasAuthParams: false };
    }
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const query = url.searchParams;
    const read = (key: string) => hash.get(key) ?? query.get(key);
    const hasAuthParams = AUTH_PARAM_KEYS.some(key => hash.has(key) || query.has(key));
    const errorCode = read('error_code') ?? read('error');
    return { type: read('type'), errorCode, hasAuthParams };
};

/** URL without Supabase auth params (and without an empty trailing '#'). */
export const stripAuthParams = (href: string): string => {
    const url = new URL(href);
    for (const key of AUTH_PARAM_KEYS) url.searchParams.delete(key);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const hashLooksLikeAuth = AUTH_PARAM_KEYS.some(key => hash.has(key));
    if (hashLooksLikeAuth || url.hash === '#') url.hash = '';
    return url.toString().replace(/#$/, '');
};

// Snapshot the URL at module load, before supabase-js strips the hash.
const initialRedirect: AuthRedirectInfo = typeof window !== 'undefined'
    ? parseAuthRedirect(window.location.href)
    : { type: null, errorCode: null, hasAuthParams: false };

/** Where Supabase email links should land. Native apps fall back to the project Site URL. */
const getEmailRedirectUrl = (): string | undefined => {
    if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return undefined;
    return window.location.origin;
};

export function usePasswordRecovery() {
    const [isRecovering, setIsRecovering] = useState(initialRedirect.type === 'recovery' && !initialRedirect.errorCode);
    const [redirectErrorCode, setRedirectErrorCode] = useState<string | null>(initialRedirect.errorCode);

    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;

        getSupabaseService()
            .then(async service => {
                if (cancelled || !service.isConfigured()) return;
                const { data } = service.client.auth.onAuthStateChange((event) => {
                    if (event === 'PASSWORD_RECOVERY') setIsRecovering(true);
                });
                unsubscribe = () => data.subscription.unsubscribe();

                // getSession() resolves after supabase-js has finished reading the URL.
                await service.client.auth.getSession();
                if (!cancelled && initialRedirect.hasAuthParams && typeof window !== 'undefined') {
                    const cleaned = stripAuthParams(window.location.href);
                    if (cleaned !== window.location.href) {
                        window.history.replaceState(window.history.state, '', cleaned);
                    }
                }
            })
            .catch(error => {
                console.error('Failed to initialise auth redirect handling:', error);
            });

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, []);

    /** Returns `needsConfirmation: true` when Supabase did not return a session (email confirmation on). */
    const signUp = useCallback(async (email: string, password: string) => {
        const service = await getSupabaseService();
        const { data, error } = await service.client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: getEmailRedirectUrl() },
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
    }, []);

    /** Sends the sign-up confirmation email again (Supabase allows one per minute). */
    const resendConfirmation = useCallback(async (email: string) => {
        const service = await getSupabaseService();
        const { error } = await service.client.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: getEmailRedirectUrl() },
        });
        if (error) throw error;
    }, []);

    const requestPasswordReset = useCallback(async (email: string) => {
        const service = await getSupabaseService();
        const { error } = await service.client.auth.resetPasswordForEmail(email, {
            redirectTo: getEmailRedirectUrl(),
        });
        if (error) throw error;
    }, []);

    const updatePassword = useCallback(async (password: string) => {
        const service = await getSupabaseService();
        const { error } = await service.client.auth.updateUser({ password });
        if (error) throw error;
        setIsRecovering(false);
    }, []);

    const finishRecovery = useCallback(() => setIsRecovering(false), []);
    const clearRedirectError = useCallback(() => setRedirectErrorCode(null), []);

    return {
        isRecovering,
        redirectErrorCode,
        signUp,
        resendConfirmation,
        requestPasswordReset,
        updatePassword,
        finishRecovery,
        clearRedirectError,
    };
}
