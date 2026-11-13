import React, { useState } from 'react';
import { getSupabaseService } from '../services/runtimeServices';
import { LogIn, UserPlus, AlertCircle, MailCheck, KeyRound, ArrowLeft, Mail, Lock, Wallet, Eye, EyeOff } from 'lucide-react';
import { m } from 'motion/react';
import { TRANSLATIONS } from '../constants';
import { Segmented } from './ui/Segmented';
import type { AppLanguage } from '../utils/locale';
import { getAuthErrorKey, PASSWORD_ISSUE_KEYS, PASSWORD_MIN_LENGTH, validateAuthForm, validatePassword } from '../utils/authValidation';

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

const fieldClass = 'paper-field h-12 w-full rounded-[14px] border border-hair pl-11 pr-4 text-[16px] text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent';
const labelClass = 'mb-1.5 block px-1 text-[13px] font-semibold text-muted';
const primaryButtonClass = 'flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-on-accent shadow-[0_12px_28px_-14px_rgb(var(--accent-rgb)/0.8)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50';
const linkClass = 'inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-accent';

const Spinner = () => (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
);

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
    <m.div
        role="alert"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-start gap-2.5 rounded-[16px] bg-neg/10 px-4 py-3 text-[14px] leading-snug text-neg"
    >
        <AlertCircle size={17} className="mt-px shrink-0" aria-hidden="true" />
        <span>{message}</span>
    </m.div>
);

/** A form field with a leading icon. */
const IconField: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
    <div className="relative">
        <Icon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        {children}
    </div>
);

const BrandMark: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
    <div className="mb-7 flex flex-col items-center text-center">
        <m.div
            initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 22, delay: 0.05 }}
            className="accent-card mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] text-white"
            aria-hidden="true"
        >
            <Wallet size={30} strokeWidth={2.1} />
        </m.div>
        <h1 className="text-[30px] font-bold leading-none tracking-[-0.035em] text-on-surface">{title}</h1>
        <p className="mt-2.5 max-w-[300px] text-[15px] leading-snug text-muted">{subtitle}</p>
    </div>
);

const AuthShell: React.FC<{ children: React.ReactNode; topRight?: React.ReactNode }> = ({ children, topRight }) => (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-paper px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] text-on-surface">
        <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
            style={{ background: 'radial-gradient(70% 60% at 50% 0%, rgb(var(--accent-rgb) / 0.16), transparent 70%)' }}
            aria-hidden="true"
        />
        <div className="relative flex h-10 justify-end">{topRight}</div>
        <div className="relative flex flex-1 items-center justify-center py-6">
            <m.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-[400px]"
            >
                {children}
            </m.div>
        </div>
    </div>
);

const AuthCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="paper-tile !rounded-[32px] p-5 sm:p-6">{children}</div>
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
    const [showPassword, setShowPassword] = useState(false);
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

        const issue = validateAuthForm(mode, email, password);
        if (issue) {
            setError(t[issue]);
            return;
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
        <Segmented<AppLanguage>
            size="sm"
            ariaLabel={t.language}
            value={language}
            onChange={onLanguageChange}
            className="w-[104px]"
            options={[
                { value: 'en', label: <span lang="en">EN</span> },
                { value: 'sr', label: <span lang="sr-Latn">SR</span> },
            ]}
        />
    );

    if (notice) {
        return (
            <AuthShell topRight={languageToggle}>
                <AuthCard>
                    <div className="space-y-3 py-2 text-center" role="status">
                        <m.div
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft"
                        >
                            <MailCheck size={30} className="text-accent" aria-hidden="true" />
                        </m.div>
                        <h1 className="text-[24px] font-bold tracking-[-0.03em]">{t.authCheckEmailTitle}</h1>
                        <p className="text-[15px] leading-snug text-muted">
                            {(notice.kind === 'checkEmail' ? t.authCheckEmailBody : t.authResetSentBody).replace('{email}', notice.email)}
                        </p>
                        <p className="text-[13px] text-faint">{t.authCheckSpam}</p>
                        <button
                            type="button"
                            onClick={() => { setNotice(null); switchMode('signIn'); }}
                            className={`${linkClass} mt-2`}
                        >
                            <ArrowLeft size={16} aria-hidden="true" /> {t.authBackToSignIn}
                        </button>
                    </div>
                </AuthCard>
            </AuthShell>
        );
    }

    const subtitle = mode === 'signIn' ? t.authWelcomeBack : mode === 'signUp' ? t.authCreateAccountPrompt : t.authForgotPasswordPrompt;
    const submitLabel = mode === 'signIn' ? t.authSignIn : mode === 'signUp' ? t.authSignUp : t.authSendResetLink;
    const SubmitIcon = mode === 'signIn' ? LogIn : mode === 'signUp' ? UserPlus : KeyRound;

    return (
        <AuthShell topRight={languageToggle}>
            <BrandMark title={t.appName} subtitle={subtitle} />

            <AuthCard>
                {mode !== 'forgot' && (
                    <Segmented<AuthMode>
                        ariaLabel={`${t.authSignIn} / ${t.authSignUp}`}
                        value={mode}
                        onChange={switchMode}
                        className="mb-5"
                        options={[
                            { value: 'signIn', label: t.authSignIn },
                            { value: 'signUp', label: t.authSignUp },
                        ]}
                    />
                )}

                {error && <ErrorBanner message={error} />}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    <div>
                        <label htmlFor="auth-email" className={labelClass}>{t.authEmail}</label>
                        <IconField icon={Mail}>
                            <input
                                id="auth-email"
                                type="email"
                                inputMode="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                autoCapitalize="none"
                                spellCheck={false}
                                className={fieldClass}
                                placeholder={t.authEmailPlaceholder}
                                required
                            />
                        </IconField>
                    </div>
                    {mode !== 'forgot' && (
                        <div>
                            <div className="mb-1.5 flex items-center justify-between px-1">
                                <label htmlFor="auth-password" className="block text-[13px] font-semibold text-muted">{t.authPassword}</label>
                                {mode === 'signIn' && (
                                    <button
                                        type="button"
                                        onClick={() => switchMode('forgot')}
                                        className="text-[13px] font-semibold text-accent"
                                    >
                                        {t.authForgotPassword}
                                    </button>
                                )}
                            </div>
                            <IconField icon={Lock}>
                                <input
                                    id="auth-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                                    className={fieldClass}
                                    placeholder="••••••••••"
                                    required
                                    minLength={mode === 'signUp' ? PASSWORD_MIN_LENGTH : undefined}
                                    aria-describedby={mode === 'signUp' ? 'auth-password-hint' : undefined}
                                    style={{ paddingRight: 48 }}
                                />
                                {/* The span positions the toggle: the global button rule in theme.css forces position: relative. */}
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    aria-label={showPassword ? t.hidePassword : t.showPassword}
                                    aria-pressed={showPassword}
                                    className="no-press flex h-9 w-9 items-center justify-center rounded-full text-faint transition-colors hover:text-on-surface focus-visible:ring-2 focus-visible:ring-accent"
                                >
                                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                </button>
                                </span>
                            </IconField>
                            {mode === 'signUp' && (
                                <p id="auth-password-hint" className="mt-1.5 px-1 text-[12px] leading-snug text-faint">
                                    {t.authPasswordHint.replace('{min}', String(PASSWORD_MIN_LENGTH))}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="pt-1">
                        <button type="submit" disabled={loading} className={primaryButtonClass}>
                            {loading ? <Spinner /> : (
                                <>
                                    <SubmitIcon size={19} aria-hidden="true" />
                                    {submitLabel}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </AuthCard>

            {mode === 'forgot' && (
                <div className="mt-4 text-center">
                    <button type="button" onClick={() => switchMode('signIn')} className={linkClass}>
                        <ArrowLeft size={16} aria-hidden="true" /> {t.authBackToSignIn}
                    </button>
                </div>
            )}
        </AuthShell>
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
        <AuthShell>
            <BrandMark title={t.authSetNewPasswordTitle} subtitle={t.authSetNewPasswordPrompt} />

            <AuthCard>
                {error && <ErrorBanner message={error} />}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    <div>
                        <label htmlFor="new-password" className={labelClass}>{t.authNewPassword}</label>
                        <IconField icon={Lock}>
                            <input
                                id="new-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                className={fieldClass}
                                required
                                minLength={PASSWORD_MIN_LENGTH}
                                aria-describedby="new-password-hint"
                            />
                        </IconField>
                        <p id="new-password-hint" className="mt-1.5 px-1 text-[12px] leading-snug text-faint">
                            {t.authPasswordHint.replace('{min}', String(PASSWORD_MIN_LENGTH))}
                        </p>
                    </div>
                    <div>
                        <label htmlFor="confirm-password" className={labelClass}>{t.authConfirmPassword}</label>
                        <IconField icon={Lock}>
                            <input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                className={fieldClass}
                                required
                                minLength={PASSWORD_MIN_LENGTH}
                            />
                        </IconField>
                    </div>

                    <div className="pt-1">
                        <button type="submit" disabled={loading} className={primaryButtonClass}>
                            {loading ? <Spinner /> : (
                                <>
                                    <KeyRound size={19} aria-hidden="true" />
                                    {t.authSaveNewPassword}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </AuthCard>

            <div className="mt-4 text-center">
                <button type="button" onClick={onCancel} className="inline-flex h-10 items-center rounded-full px-3 text-[14px] font-semibold text-muted">
                    {t.authSkipForNow}
                </button>
            </div>
        </AuthShell>
    );
};
