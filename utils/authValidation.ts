import type { TranslationKey } from './i18n';

/**
 * Client-side mirror of the Supabase Auth password policy
 * (Auth settings: minimum length 10, must contain letters and digits).
 * The server remains the source of truth; this only gives early feedback.
 */
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordIssue = 'tooShort' | 'needsLetterAndDigit';

export const validatePassword = (password: string): PasswordIssue | null => {
    if (password.length < PASSWORD_MIN_LENGTH) return 'tooShort';
    if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) return 'needsLetterAndDigit';
    return null;
};

/** Each rule of the password policy on its own, for the live checklist under the field. */
export interface PasswordChecks {
    length: boolean;
    letter: boolean;
    digit: boolean;
}

export const passwordChecks = (password: string): PasswordChecks => ({
    length: password.length >= PASSWORD_MIN_LENGTH,
    letter: /\p{L}/u.test(password),
    digit: /\p{Nd}/u.test(password),
});

export const PASSWORD_ISSUE_KEYS: Record<PasswordIssue, TranslationKey> = {
    tooShort: 'authPasswordTooShort',
    needsLetterAndDigit: 'authPasswordNeedsLetterAndDigit',
};

// Deliberately loose: one @, no spaces, a dot in the domain. The server does the real check.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the sign-in / sign-up / reset form before it is sent, so errors show in the
 * app's own banner instead of the browser's validation popups (the form is noValidate).
 */
export const validateAuthForm = (
    mode: 'signIn' | 'signUp' | 'forgot',
    email: string,
    password: string,
): TranslationKey | null => {
    const trimmed = email.trim();
    if (!trimmed) return 'authEmailRequired';
    if (!EMAIL_SHAPE.test(trimmed)) return 'authErrorInvalidEmail';
    if (mode === 'forgot') return null;
    if (!password) return 'authPasswordRequired';
    if (mode === 'signUp') {
        const issue = validatePassword(password);
        if (issue) return PASSWORD_ISSUE_KEYS[issue];
    }
    return null;
};

interface AuthErrorLike {
    code?: unknown;
    status?: unknown;
    name?: unknown;
    message?: unknown;
    reasons?: unknown;
}

/**
 * Maps a Supabase auth error (AuthApiError / AuthWeakPasswordError / fetch
 * failures) to a translation key so users never see raw server text.
 */
export const getAuthErrorKey = (error: unknown): TranslationKey => {
    if (!error || typeof error !== 'object') return 'authErrorGeneric';
    const { code, status, name, message, reasons } = error as AuthErrorLike;
    const codeStr = typeof code === 'string' ? code : '';
    const messageStr = typeof message === 'string' ? message.toLowerCase() : '';

    if (codeStr === 'weak_password' || name === 'AuthWeakPasswordError') {
        if (Array.isArray(reasons) && reasons.includes('pwned')) return 'authErrorPwnedPassword';
        return 'authErrorWeakPassword';
    }
    if (codeStr === 'invalid_credentials' || messageStr.includes('invalid login credentials')) return 'authErrorInvalidCredentials';
    if (codeStr === 'email_not_confirmed' || messageStr.includes('email not confirmed')) return 'authErrorEmailNotConfirmed';
    if (codeStr.startsWith('over_') || status === 429 || messageStr.includes('rate limit')) return 'authErrorRateLimit';
    if (codeStr === 'user_already_exists' || codeStr === 'email_exists') return 'authErrorUserExists';
    if (codeStr === 'same_password') return 'authErrorSamePassword';
    if (codeStr === 'email_address_invalid' || codeStr === 'validation_failed') return 'authErrorInvalidEmail';
    if (codeStr === 'signup_disabled') return 'authErrorSignupDisabled';
    if (codeStr === 'otp_expired' || codeStr === 'flow_state_expired' || codeStr === 'bad_jwt' || codeStr === 'session_not_found' || name === 'AuthSessionMissingError') {
        return 'authErrorLinkExpired';
    }
    if (name === 'AuthRetryableFetchError' || status === 0 || messageStr.includes('failed to fetch') || messageStr.includes('network')) {
        return 'authErrorNetwork';
    }
    if (messageStr.includes('supabase not configured')) return 'authErrorNotConfigured';
    return 'authErrorGeneric';
};
