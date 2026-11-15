import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, m, useReducedMotion } from 'motion/react';
import { ArrowLeft, Check, MailCheck, RotateCw } from 'lucide-react';
import { getSupabaseService } from '../services/runtimeServices';
import { TRANSLATIONS } from '../constants';
import { Segmented } from './ui/Segmented';
import type { AppLanguage } from '../utils/locale';
import type { TranslationKey } from '../utils/i18n';
import { getAuthErrorKey, passwordChecks, validateAuthForm, validatePassword, PASSWORD_ISSUE_KEYS } from '../utils/authValidation';
import { suggestEmail } from '../utils/emailSuggestion';
import {
    AuthLayout,
    ErrorBanner,
    FieldError,
    FieldNote,
    PasswordChecklist,
    PasswordField,
    Reveal,
    Spinner,
    SubmitButton,
    TextLink,
    fieldClass,
    labelClass,
} from './auth/AuthParts';

type AuthMode = 'signIn' | 'signUp' | 'forgot';
type AuthNotice = { kind: 'checkEmail' | 'resetSent'; email: string } | null;
type FieldErrors = { email?: TranslationKey; password?: TranslationKey };

/** Seconds before "Send it again" (Supabase refuses a second email sooner). */
const RESEND_COOLDOWN = 60;

const EMAIL_ISSUES: TranslationKey[] = ['authEmailRequired', 'authErrorInvalidEmail'];

interface AuthViewProps {
    onAuthSuccess: () => void;
    language: AppLanguage;
    onLanguageChange?: (language: AppLanguage) => void;
    /** Sign up; resolves `needsConfirmation: true` when the user must confirm their email first. */
    onSignUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
    onRequestPasswordReset: (email: string) => Promise<void>;
    /** Sends the sign-up confirmation email again. */
    onResendConfirmation?: (email: string) => Promise<void>;
    /** Error code from a failed email-link redirect (e.g. otp_expired). */
    redirectErrorCode?: string | null;
    onDismissRedirectError?: () => void;
}

/** Shakes the element once (a refused sign-in); still when motion is reduced. */
const useShake = () => {
    const ref = useRef<HTMLFormElement>(null);
    const reduceMotion = useReducedMotion();
    const shake = () => {
        if (reduceMotion || !ref.current) return;
        animate(ref.current, { x: [0, -10, 9, -6, 4, -2, 0] }, { duration: 0.45, ease: 'easeOut' });
    };
    return { ref, shake };
};

/** Splits a "{email}" template so the address can be emphasised. */
const withEmail = (template: string, email: string, render: (value: string) => React.ReactNode) => {
    const [before, after = ''] = template.split('{email}');
    return <>{before}{render(email)}{after}</>;
};

const LanguageToggle: React.FC<{ language: AppLanguage; onChange?: (language: AppLanguage) => void; label: string }> = ({ language, onChange, label }) =>
    onChange ? (
        <Segmented<AppLanguage>
            size="sm"
            ariaLabel={label}
            value={language}
            onChange={onChange}
            className="w-[104px]"
            options={[
                { value: 'en', label: <span lang="en">EN</span> },
                { value: 'sr', label: <span lang="sr-Latn">SR</span> },
            ]}
        />
    ) : null;

/** "Check your email" with a resend countdown. */
const CheckEmail: React.FC<{
    notice: NonNullable<AuthNotice>;
    t: typeof TRANSLATIONS['en'];
    onResend?: () => Promise<void>;
    onBack: () => void;
}> = ({ notice, t, onResend, onBack }) => {
    const reduceMotion = useReducedMotion();
    const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [cooldown]);

    const resend = async () => {
        if (!onResend || cooldown > 0 || sending) return;
        setSending(true);
        setStatus(null);
        try {
            await onResend();
            setStatus({ ok: true, message: t.authResent });
            setCooldown(RESEND_COOLDOWN);
        } catch (error) {
            setStatus({ ok: false, message: t[getAuthErrorKey(error)] });
        } finally {
            setSending(false);
        }
    };

    const body = notice.kind === 'checkEmail' ? t.authCheckEmailBody : t.authResetSentBody;

    return (
        <div className="text-center" role="status">
            <Reveal index={0}>
                <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
                    {!reduceMotion && (
                        <m.span
                            className="absolute inset-0 rounded-[26px] bg-accent/20"
                            animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                            aria-hidden="true"
                        />
                    )}
                    <m.span
                        initial={{ scale: 0.5, rotate: -10, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                        className="accent-card relative flex h-20 w-20 items-center justify-center rounded-[26px] text-white"
                    >
                        <MailCheck size={34} strokeWidth={2} aria-hidden="true" />
                    </m.span>
                </div>
            </Reveal>
            <Reveal index={1}>
                <h1 className="text-[30px] font-bold leading-tight tracking-[-0.04em]">{t.authCheckEmailTitle}</h1>
                <p className="mx-auto mt-2.5 max-w-[340px] text-[15.5px] leading-relaxed text-muted">
                    {withEmail(body, notice.email, email => <strong className="font-semibold text-on-surface [overflow-wrap:anywhere]">{email}</strong>)}
                </p>
                <p className="mt-2 text-[13.5px] text-faint">{t.authCheckSpam}</p>
            </Reveal>
            <Reveal index={2} className="mt-7 space-y-2">
                {onResend && (
                    <button
                        type="button"
                        onClick={() => void resend()}
                        disabled={cooldown > 0 || sending}
                        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full border border-hair bg-tile text-[15.5px] font-semibold text-on-surface transition-colors hover:bg-chip disabled:cursor-default disabled:text-muted disabled:hover:bg-tile"
                    >
                        {sending ? <Spinner className="h-4 w-4" /> : <RotateCw size={17} aria-hidden="true" />}
                        <span className="tabular-nums">
                            {cooldown > 0 ? t.authResendIn.replace('{seconds}', String(cooldown)) : t.authResend}
                        </span>
                    </button>
                )}
                <FieldNote show={!!status} tone={status?.ok ? 'muted' : 'error'}>
                    <span className="flex w-full items-center justify-center gap-1.5">
                        {status?.ok && <Check size={14} className="text-pos" aria-hidden="true" />}
                        {status?.message}
                    </span>
                </FieldNote>
                <TextLink onClick={onBack} className="mx-auto mt-1">
                    <ArrowLeft size={16} aria-hidden="true" /> {notice.kind === 'checkEmail' ? t.authUseDifferentEmail : t.authBackToSignIn}
                </TextLink>
            </Reveal>
        </div>
    );
};

export const AuthView: React.FC<AuthViewProps> = ({
    onAuthSuccess,
    language,
    onLanguageChange,
    onSignUp,
    onRequestPasswordReset,
    onResendConfirmation,
    redirectErrorCode,
    onDismissRedirectError,
}) => {
    const t = TRANSLATIONS[language];
    const reduceMotion = useReducedMotion();
    const [mode, setMode] = useState<AuthMode>('signIn');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [emailTouched, setEmailTouched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [errorKey, setErrorKey] = useState<TranslationKey | null>(
        redirectErrorCode ? getAuthErrorKey({ code: redirectErrorCode }) : null
    );
    const [resending, setResending] = useState(false);
    const [notice, setNotice] = useState<AuthNotice>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const { ref: formRef, shake } = useShake();

    const switchMode = (next: AuthMode) => {
        setMode(next);
        setErrorKey(null);
        setFieldErrors({});
        onDismissRedirectError?.();
    };

    const suggestion = emailTouched ? suggestEmail(email) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorKey(null);
        onDismissRedirectError?.();

        const issue = validateAuthForm(mode, email, password);
        if (issue) {
            const onEmail = EMAIL_ISSUES.includes(issue);
            setFieldErrors(onEmail ? { email: issue } : { password: issue });
            (onEmail ? emailRef : passwordRef).current?.focus();
            return;
        }
        setFieldErrors({});

        const address = email.trim();
        setLoading(true);
        try {
            if (mode === 'forgot') {
                await onRequestPasswordReset(address);
                setNotice({ kind: 'resetSent', email: address });
                return;
            }

            if (mode === 'signIn') {
                const supabaseService = await getSupabaseService();
                const { error } = await supabaseService.signIn(address, password);
                if (error) throw error;
                onAuthSuccess();
                return;
            }

            const { needsConfirmation } = await onSignUp(address, password);
            if (needsConfirmation) {
                setPassword('');
                setNotice({ kind: 'checkEmail', email: address });
                return;
            }
            onAuthSuccess();
        } catch (err: unknown) {
            const key = getAuthErrorKey(err);
            setErrorKey(key);
            if (key === 'authErrorInvalidCredentials') {
                shake();
                passwordRef.current?.select();
            }
        } finally {
            setLoading(false);
        }
    };

    const resendConfirmation = async () => {
        if (!onResendConfirmation) return;
        const address = email.trim();
        setResending(true);
        try {
            await onResendConfirmation(address);
            setErrorKey(null);
            setNotice({ kind: 'checkEmail', email: address });
        } catch (err: unknown) {
            setErrorKey(getAuthErrorKey(err));
        } finally {
            setResending(false);
        }
    };

    const languageToggle = <LanguageToggle language={language} onChange={onLanguageChange} label={t.language} />;

    if (notice) {
        return (
            <AuthLayout t={t} language={language} topRight={languageToggle} showcase={false}>
                <CheckEmail
                    key={notice.email + notice.kind}
                    notice={notice}
                    t={t}
                    onResend={notice.kind === 'checkEmail'
                        ? (onResendConfirmation ? () => onResendConfirmation(notice.email) : undefined)
                        : () => onRequestPasswordReset(notice.email)}
                    onBack={() => { setNotice(null); switchMode(notice.kind === 'checkEmail' ? 'signUp' : 'signIn'); }}
                />
            </AuthLayout>
        );
    }

    const title = mode === 'signIn' ? t.authSignInTitle : mode === 'signUp' ? t.authSignUpTitle : t.authForgotTitle;
    const subtitle = mode === 'signIn' ? t.authSignInSubtitle : mode === 'signUp' ? t.authSignUpSubtitle : t.authForgotPasswordPrompt;
    const submitLabel = mode === 'signIn' ? t.authSignIn : mode === 'signUp' ? t.authSignUp : t.authSendResetLink;
    const emailErrorId = 'auth-email-error';
    const passwordErrorId = 'auth-password-error';
    const passwordHintId = 'auth-password-hint';
    const swap = reduceMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

    return (
        <AuthLayout t={t} language={language} topRight={languageToggle}>
            <Reveal index={0} className="mb-6">
                <AnimatePresence mode="wait" initial={false}>
                    <m.div key={mode} {...swap} transition={{ duration: 0.18, ease: 'easeOut' }}>
                        <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.04em] lg:text-[34px]">{title}</h1>
                        <p className="mt-2 text-[15.5px] leading-snug text-muted">{subtitle}</p>
                    </m.div>
                </AnimatePresence>
            </Reveal>

            <ErrorBanner
                message={errorKey ? t[errorKey] : null}
                action={errorKey === 'authErrorEmailNotConfirmed' && onResendConfirmation
                    ? { label: t.authResend, onClick: () => void resendConfirmation(), busy: resending }
                    : undefined}
            />

            <m.form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
                <Reveal index={1}>
                    <label htmlFor="auth-email" className={labelClass}>{t.authEmail}</label>
                    <input
                        ref={emailRef}
                        id="auth-email"
                        type="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: undefined }));
                        }}
                        onBlur={() => setEmailTouched(true)}
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={fieldClass}
                        placeholder={t.authEmailPlaceholder}
                        aria-invalid={fieldErrors.email ? true : undefined}
                        aria-describedby={fieldErrors.email ? emailErrorId : undefined}
                        required
                    />
                    <FieldError id={emailErrorId} message={fieldErrors.email ? t[fieldErrors.email] : null} />
                    <FieldNote show={!fieldErrors.email && !!suggestion} tone="muted">
                        <span>
                            {suggestion && withEmail(t.authDidYouMean, suggestion, value => (
                                <button
                                    type="button"
                                    onClick={() => { setEmail(value); passwordRef.current?.focus(); }}
                                    className="no-press font-semibold text-accent underline decoration-[rgb(var(--accent-rgb)/0.4)] underline-offset-2"
                                >
                                    {value}
                                </button>
                            ))}
                        </span>
                    </FieldNote>
                </Reveal>

                <AnimatePresence initial={false}>
                    {mode !== 'forgot' && (
                        <m.div
                            key="password"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="-m-1 overflow-hidden p-1"
                        >
                            <Reveal index={2}>
                                <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                                    <label htmlFor="auth-password" className="text-[13.5px] font-semibold">{t.authPassword}</label>
                                    {mode === 'signIn' && (
                                        <TextLink onClick={() => switchMode('forgot')} className="-my-2 min-h-[36px] text-[13.5px]">
                                            {t.authForgotPassword}
                                        </TextLink>
                                    )}
                                </div>
                                <PasswordField
                                    ref={passwordRef}
                                    id="auth-password"
                                    t={t}
                                    value={password}
                                    onValueChange={(value) => {
                                        setPassword(value);
                                        if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined }));
                                    }}
                                    autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                                    placeholder={mode === 'signIn' ? '••••••••••' : undefined}
                                    invalid={!!fieldErrors.password}
                                    describedBy={[fieldErrors.password ? passwordErrorId : null, mode === 'signUp' ? passwordHintId : null].filter(Boolean).join(' ')}
                                    required
                                />
                                <FieldError id={passwordErrorId} message={fieldErrors.password ? t[fieldErrors.password] : null} />
                                {mode === 'signUp' && <PasswordChecklist checks={passwordChecks(password)} t={t} hintId={passwordHintId} />}
                            </Reveal>
                        </m.div>
                    )}
                </AnimatePresence>

                <Reveal index={3} className="pt-2">
                    <SubmitButton loading={loading} label={submitLabel} t={t} />
                </Reveal>
            </m.form>

            <Reveal index={4} className="mt-6 flex flex-wrap items-center justify-center gap-x-1.5 text-[14px] text-muted">
                {mode === 'forgot' ? (
                    <TextLink onClick={() => switchMode('signIn')}>
                        <ArrowLeft size={16} aria-hidden="true" /> {t.authBackToSignIn}
                    </TextLink>
                ) : (
                    <>
                        <span>{mode === 'signIn' ? t.authNoAccount : t.authHaveAccount}</span>
                        <TextLink onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
                            {mode === 'signIn' ? t.authSignUp : t.authSignIn}
                        </TextLink>
                    </>
                )}
            </Reveal>
        </AuthLayout>
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
    const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
    const [error, setError] = useState<string | null>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const confirmRef = useRef<HTMLInputElement>(null);
    const matches = confirmPassword.length > 0 && confirmPassword === password;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const issue = validatePassword(password);
        if (issue) {
            setFieldErrors({ password: t[PASSWORD_ISSUE_KEYS[issue]] });
            passwordRef.current?.focus();
            return;
        }
        if (password !== confirmPassword) {
            setFieldErrors({ confirm: t.authPasswordsDontMatch });
            confirmRef.current?.focus();
            return;
        }
        setFieldErrors({});
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
        <AuthLayout t={t} language={language} showcase={false}>
            <Reveal index={0} className="mb-6">
                <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.04em] lg:text-[34px]">{t.authSetNewPasswordTitle}</h1>
                <p className="mt-2 text-[15.5px] leading-snug text-muted">{t.authSetNewPasswordPrompt}</p>
            </Reveal>

            <ErrorBanner message={error} />

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <Reveal index={1}>
                    <label htmlFor="new-password" className={labelClass}>{t.authNewPassword}</label>
                    <PasswordField
                        ref={passwordRef}
                        id="new-password"
                        t={t}
                        value={password}
                        onValueChange={(value) => { setPassword(value); setFieldErrors({}); }}
                        autoComplete="new-password"
                        invalid={!!fieldErrors.password}
                        describedBy={[fieldErrors.password ? 'new-password-error' : null, 'new-password-hint'].filter(Boolean).join(' ')}
                        required
                    />
                    <FieldError id="new-password-error" message={fieldErrors.password} />
                    <PasswordChecklist checks={passwordChecks(password)} t={t} hintId="new-password-hint" />
                </Reveal>
                <Reveal index={2}>
                    <label htmlFor="confirm-password" className={labelClass}>{t.authConfirmPassword}</label>
                    <div className="relative">
                        <input
                            ref={confirmRef}
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors({}); }}
                            autoComplete="new-password"
                            className={fieldClass}
                            style={{ paddingRight: 48 }}
                            aria-invalid={fieldErrors.confirm ? true : undefined}
                            aria-describedby={fieldErrors.confirm ? 'confirm-password-error' : undefined}
                            required
                        />
                        <AnimatePresence>
                            {matches && (
                                <m.span
                                    initial={{ scale: 0.4, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.4, opacity: 0 }}
                                    className="pointer-events-none absolute right-4 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-pos/14 text-pos"
                                    aria-hidden="true"
                                >
                                    <Check size={14} strokeWidth={3} />
                                </m.span>
                            )}
                        </AnimatePresence>
                    </div>
                    <FieldError id="confirm-password-error" message={fieldErrors.confirm} />
                </Reveal>

                <Reveal index={3} className="pt-2">
                    <SubmitButton loading={loading} label={t.authSaveNewPassword} t={t} />
                </Reveal>
            </form>

            <Reveal index={4} className="mt-5 text-center">
                <button type="button" onClick={onCancel} className="no-press inline-flex min-h-[40px] items-center rounded-full px-3 text-[14px] font-semibold text-muted hover:text-on-surface">
                    {t.authSkipForNow}
                </button>
            </Reveal>
        </AuthLayout>
    );
};
