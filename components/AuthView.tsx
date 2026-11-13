import React, { useState } from 'react';
import { getSupabaseService } from '../services/runtimeServices';
import { LogIn, UserPlus, AlertCircle, MailCheck, KeyRound, ArrowLeft } from 'lucide-react';
import { m } from 'motion/react';
import { TRANSLATIONS } from '../constants';
import type { AppLanguage } from '../utils/locale';
import { getAuthErrorKey, PASSWORD_ISSUE_KEYS, PASSWORD_MIN_LENGTH, validatePassword } from '../utils/authValidation';

type AuthMode = 'signIn' | 'signUp' | 'forgot';
type AuthNotice = { kind: 'checkEmail' | 'resetSent'; email: string } | null;

interface AuthViewProps {
    onAuthSuccess: () => void;
    language: AppLanguage;
    onLanguageChange?: (language: AppLanguage) => void;
    /** Sign up; resolves `needsConfirmation: true` when the user must confirm their email first. */
    onSignUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
    onRequestPasswordReset: (email: string) => Promise<void>;
    /** Error code from a failed email-link redirect (e.g. otp_expired). */
    redirectErrorCode?: string | null;
    onDismissRedirectError?: () => void;
}

const inputClass = 'w-full bg-surface-container-high border-none rounded-lg px-4 py-3 text-on-surface placeholder-on-surface-variant/60 focus:ring-2 focus:ring-primary';
const primaryButtonClass = 'w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';

const Spinner = () => (
    <div className="w-5 h-5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
);

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
    <div role="alert" className="bg-error-container text-on-error-container p-3 rounded-lg mb-4 flex items-center gap-2 text-sm">
        <AlertCircle size={16} aria-hidden="true" />
        {message}
    </div>
);

const AuthCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-container-low p-8 rounded-2xl shadow-elevation-3 w-full max-w-md border border-outline-variant/20"
        >
            {children}
        </m.div>
    </div>
);

export const AuthView: React.FC<AuthViewProps> = ({
    onAuthSuccess,
    language,
    onLanguageChange,
    onSignUp,
    onRequestPasswordReset,
    redirectErrorCode,
    onDismissRedirectError,
}) => {
    const t = TRANSLATIONS[language];
    const [mode, setMode] = useState<AuthMode>('signIn');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(
        redirectErrorCode ? t[getAuthErrorKey({ code: redirectErrorCode })] : null
    );
    const [notice, setNotice] = useState<AuthNotice>(null);

    const switchMode = (next: AuthMode) => {
        setMode(next);
        setError(null);
        onDismissRedirectError?.();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        onDismissRedirectError?.();

        if (mode === 'signUp') {
            const issue = validatePassword(password);
            if (issue) {
                setError(t[PASSWORD_ISSUE_KEYS[issue]]);
                return;
            }
        }

        setLoading(true);
        try {
            if (mode === 'forgot') {
                await onRequestPasswordReset(email);
                setNotice({ kind: 'resetSent', email });
                return;
            }

            if (mode === 'signIn') {
                const supabaseService = await getSupabaseService();
                const { error } = await supabaseService.signIn(email, password);
                if (error) throw error;
                onAuthSuccess();
                return;
            }

            const { needsConfirmation } = await onSignUp(email, password);
            if (needsConfirmation) {
                setPassword('');
                setNotice({ kind: 'checkEmail', email });
                return;
            }
            onAuthSuccess();
        } catch (err: unknown) {
            setError(t[getAuthErrorKey(err)]);
        } finally {
            setLoading(false);
        }
    };

    const languageToggle = onLanguageChange && (
        <div className="flex justify-end -mt-4 -mr-4 mb-2 gap-1" role="group" aria-label={t.language}>
            {(['en', 'sr'] as const).map(code => (
                <button
                    key={code}
                    type="button"
                    onClick={() => onLanguageChange(code)}
                    aria-pressed={language === code}
                    lang={code === 'sr' ? 'sr-Latn' : 'en'}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${language === code ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                    {code === 'en' ? 'EN' : 'SR'}
                </button>
            ))}
        </div>
    );

    if (notice) {
        return (
            <AuthCard>
                {languageToggle}
                <div className="text-center space-y-4" role="status">
                    <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <MailCheck size={28} className="text-primary" aria-hidden="true" />
                    </div>
                    <h1 className="text-2xl font-bold text-on-surface">{t.authCheckEmailTitle}</h1>
                    <p className="text-on-surface-variant text-sm">
                        {(notice.kind === 'checkEmail' ? t.authCheckEmailBody : t.authResetSentBody).replace('{email}', notice.email)}
                    </p>
                    <p className="text-on-surface-variant/80 text-xs">{t.authCheckSpam}</p>
                    <button
                        type="button"
                        onClick={() => { setNotice(null); switchMode('signIn'); }}
                        className="text-primary hover:underline text-sm font-medium inline-flex items-center gap-1"
                    >
                        <ArrowLeft size={16} aria-hidden="true" /> {t.authBackToSignIn}
                    </button>
                </div>
            </AuthCard>
        );
    }

    const subtitle = mode === 'signIn' ? t.authWelcomeBack : mode === 'signUp' ? t.authCreateAccountPrompt : t.authForgotPasswordPrompt;
    const submitLabel = mode === 'signIn' ? t.authSignIn : mode === 'signUp' ? t.authSignUp : t.authSendResetLink;
    const SubmitIcon = mode === 'signIn' ? LogIn : mode === 'signUp' ? UserPlus : KeyRound;

    return (
        <AuthCard>
            {languageToggle}
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-primary mb-2">{t.appName}</h1>
                <p className="text-on-surface-variant">{subtitle}</p>
            </div>

            {error && <ErrorBanner message={error} />}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="auth-email" className="block text-sm font-medium text-on-surface-variant mb-1">{t.authEmail}</label>
                    <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className={inputClass}
                        placeholder={t.authEmailPlaceholder}
                        required
                    />
                </div>
                {mode !== 'forgot' && (
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label htmlFor="auth-password" className="block text-sm font-medium text-on-surface-variant">{t.authPassword}</label>
                            {mode === 'signIn' && (
                                <button
                                    type="button"
                                    onClick={() => switchMode('forgot')}
                                    className="text-primary hover:underline text-xs font-medium"
                                >
                                    {t.authForgotPassword}
                                </button>
                            )}
                        </div>
                        <input
                            id="auth-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                            className={inputClass}
                            placeholder="••••••••••"
                            required
                            minLength={mode === 'signUp' ? PASSWORD_MIN_LENGTH : undefined}
                            aria-describedby={mode === 'signUp' ? 'auth-password-hint' : undefined}
                        />
                        {mode === 'signUp' && (
                            <p id="auth-password-hint" className="mt-1 text-xs text-on-surface-variant">
                                {t.authPasswordHint.replace('{min}', String(PASSWORD_MIN_LENGTH))}
                            </p>
                        )}
                    </div>
                )}

                <button type="submit" disabled={loading} className={primaryButtonClass}>
                    {loading ? <Spinner /> : (
                        <>
                            <SubmitIcon size={20} aria-hidden="true" />
                            {submitLabel}
                        </>
                    )}
                </button>
            </form>

            <div className="mt-6 space-y-4 text-center">
                {mode === 'forgot' ? (
                    <button
                        type="button"
                        onClick={() => switchMode('signIn')}
                        className="text-primary hover:underline text-sm font-medium inline-flex items-center gap-1"
                    >
                        <ArrowLeft size={16} aria-hidden="true" /> {t.authBackToSignIn}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                        className="text-primary hover:underline text-sm font-medium block w-full"
                    >
                        {mode === 'signIn' ? t.authNoAccount : t.authHaveAccount}
                    </button>
                )}
            </div>
        </AuthCard>
    );
};

interface SetNewPasswordViewProps {
    language: AppLanguage;
    onSubmit: (password: string) => Promise<void>;
    onCancel: () => void;
}

/** Shown after a password-recovery link (Supabase PASSWORD_RECOVERY event). */
export const SetNewPasswordView: React.FC<SetNewPasswordViewProps> = ({ language, onSubmit, onCancel }) => {
    const t = TRANSLATIONS[language];
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const issue = validatePassword(password);
        if (issue) {
            setError(t[PASSWORD_ISSUE_KEYS[issue]]);
            return;
        }
        if (password !== confirmPassword) {
            setError(t.authPasswordsDontMatch);
            return;
        }
        setLoading(true);
        try {
            await onSubmit(password);
        } catch (err: unknown) {
            setError(t[getAuthErrorKey(err)]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthCard>
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-primary mb-2">{t.authSetNewPasswordTitle}</h1>
                <p className="text-on-surface-variant">{t.authSetNewPasswordPrompt}</p>
            </div>

            {error && <ErrorBanner message={error} />}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="new-password" className="block text-sm font-medium text-on-surface-variant mb-1">{t.authNewPassword}</label>
                    <input
                        id="new-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        className={inputClass}
                        required
                        minLength={PASSWORD_MIN_LENGTH}
                        aria-describedby="new-password-hint"
                    />
                    <p id="new-password-hint" className="mt-1 text-xs text-on-surface-variant">
                        {t.authPasswordHint.replace('{min}', String(PASSWORD_MIN_LENGTH))}
                    </p>
                </div>
                <div>
                    <label htmlFor="confirm-password" className="block text-sm font-medium text-on-surface-variant mb-1">{t.authConfirmPassword}</label>
                    <input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        className={inputClass}
                        required
                        minLength={PASSWORD_MIN_LENGTH}
                    />
                </div>

                <button type="submit" disabled={loading} className={primaryButtonClass}>
                    {loading ? <Spinner /> : (
                        <>
                            <KeyRound size={20} aria-hidden="true" />
                            {t.authSaveNewPassword}
                        </>
                    )}
                </button>
            </form>

            <div className="mt-6 text-center">
                <button type="button" onClick={onCancel} className="text-on-surface-variant hover:underline text-sm font-medium">
                    {t.authSkipForNow}
                </button>
            </div>
        </AuthCard>
    );
};
