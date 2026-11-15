import React, { useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { AlertCircle, ArrowRight, ArrowUp, Check, Eye, EyeOff, QrCode, ScanLine, Wallet, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import type { TRANSLATIONS } from '../../constants';
import type { AppLanguage } from '../../utils/locale';
import type { PasswordChecks } from '../../utils/authValidation';
import { PASSWORD_MIN_LENGTH } from '../../utils/authValidation';
import { AuthShowcase } from './AuthShowcase';

type T = typeof TRANSLATIONS['en'];

const EASE = [0.22, 1, 0.36, 1] as const;

// Film grain for the accent panel (inline SVG noise; data: images are allowed by the CSP).
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`;

const Brand: React.FC<{ t: T; onStage?: boolean; className?: string }> = ({ t, onStage, className }) => (
  <div className={clsx('flex items-center gap-2.5', className)}>
    <span
      className={clsx(
        'flex h-9 w-9 items-center justify-center rounded-[12px] text-white',
        onStage ? 'bg-white/16 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)] backdrop-blur' : 'accent-card',
      )}
      aria-hidden="true"
    >
      <Wallet size={18} strokeWidth={2.2} />
    </span>
    <span className="text-[16px] font-bold tracking-[-0.02em]">{t.appName}</span>
  </div>
);

// Near-black panel lit by the accent from two corners.
const STAGE_BACKGROUND = 'radial-gradient(65% 50% at 92% 0%, rgb(var(--accent-rgb) / 0.55), transparent 66%), radial-gradient(55% 45% at 0% 100%, rgb(var(--accent-rgb) / 0.26), transparent 70%), linear-gradient(#0B0D0C, #0B0D0C)';

/** Desktop only: the dark panel with the receipt story, the tagline and three things the app does. */
const AuthStage: React.FC<{ t: T; language: AppLanguage }> = ({ t, language }) => {
  const reduceMotion = useReducedMotion();
  const features = [
    { icon: ScanLine, label: t.authFeatureReceipts },
    { icon: QrCode, label: t.authFeatureSplits },
    { icon: WifiOff, label: t.authFeatureOffline },
  ];
  return (
    <aside
      className="relative hidden overflow-hidden rounded-[32px] text-white lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-24px)] lg:min-h-[620px] lg:flex-col lg:p-10 xl:p-12"
      style={{ backgroundImage: STAGE_BACKGROUND }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-overlay" style={{ backgroundImage: GRAIN }} aria-hidden="true" />
      <svg className="pointer-events-none absolute -right-40 top-1/2 h-[760px] w-[760px] -translate-y-1/2 text-white" viewBox="0 0 760 760" fill="none" aria-hidden="true">
        {[150, 230, 310, 370].map((r, i) => (
          <circle key={r} cx="380" cy="380" r={r} stroke="currentColor" strokeOpacity={0.1 - i * 0.018} strokeWidth="1.5" strokeDasharray={i % 2 ? '2 8' : undefined} strokeLinecap="round" />
        ))}
      </svg>
      <Brand t={t} onStage className="relative" />
      <AuthShowcase t={t} language={language} tone="stage" maxScale={1.5} className="relative my-6 flex-1" />
      <div className="relative">
        <m.h2
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}
          className="max-w-[460px] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.045em] xl:text-[46px]"
        >
          {t.authTagline}
        </m.h2>
        <ul className="mt-6 flex flex-wrap gap-2">
          {features.map(({ icon: Icon, label }, index) => (
            <m.li
              key={label}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.4 + index * 0.06 }}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white/12 px-3.5 text-[13.5px] font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] backdrop-blur"
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </m.li>
          ))}
        </ul>
      </div>
    </aside>
  );
};

interface AuthLayoutProps {
  t: T;
  language: AppLanguage;
  topRight?: React.ReactNode;
  /** The app preview above the form on phones (it steps aside on short screens). */
  showcase?: boolean;
  children: React.ReactNode;
}

/**
 * Signed-out page: on desktop a split screen (dark panel left, form right); on phones the
 * brand bar, the receipt story filling the free space, and the form near the thumb.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ t, language, topRight, showcase = true, children }) => (
  <div className="relative min-h-dvh bg-paper text-on-surface lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(480px,1fr)] lg:p-3">
    <AuthStage t={t} language={language} />
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(10px,env(safe-area-inset-top))] sm:px-8 lg:min-h-[calc(100dvh-24px)] lg:overflow-visible lg:px-12">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px] lg:hidden"
        style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgb(var(--accent-rgb) / 0.15), transparent 72%)' }}
        aria-hidden="true"
      />
      <header className="relative flex h-12 shrink-0 items-center justify-between gap-3">
        <Brand t={t} className="lg:invisible" />
        {topRight}
      </header>
      {showcase && <AuthShowcase t={t} language={language} tone="paper" className="-mx-4 flex-1 py-2 lg:hidden" />}
      <div className={clsx('relative mx-auto w-full max-w-[400px] shrink-0 lg:my-auto lg:py-10', !showcase && 'my-auto py-8')}>
        {children}
      </div>
    </main>
  </div>
);

/** Fades and lifts its children in, one after another. */
export const Reveal: React.FC<{ index: number; className?: string; children: React.ReactNode }> = ({ index, className, children }) => {
  const reduceMotion = useReducedMotion();
  return (
    <m.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.08 + index * 0.05 }}
      className={className}
    >
      {children}
    </m.div>
  );
};

export const fieldClass = clsx(
  'h-[52px] w-full rounded-[16px] border border-hair bg-tile px-4 text-[16px] text-on-surface outline-none',
  'transition-[border-color,box-shadow] placeholder:text-faint',
  'focus:border-accent focus:shadow-[0_0_0_4px_rgb(var(--accent-rgb)/0.16)]',
  'aria-[invalid=true]:border-neg aria-[invalid=true]:focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--paper-neg)_18%,transparent)]',
);
export const labelClass = 'mb-1.5 block px-1 text-[13.5px] font-semibold text-on-surface';

/** A line under a field that slides open: an error, a warning or a hint. */
export const FieldNote: React.FC<{ id?: string; show: boolean; tone?: 'error' | 'warn' | 'muted'; children: React.ReactNode }> = ({ id, show, tone = 'error', children }) => (
  <AnimatePresence initial={false}>
    {show && (
      <m.div
        key="note"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="overflow-hidden"
      >
        <p
          id={id}
          className={clsx(
            'flex items-start gap-1.5 px-1 pt-1.5 text-[13px] font-medium leading-snug',
            tone === 'error' ? 'text-neg' : tone === 'warn' ? 'text-warning' : 'text-muted',
          )}
        >
          {children}
        </p>
      </m.div>
    )}
  </AnimatePresence>
);

export const FieldError: React.FC<{ id: string; message: string | null | undefined }> = ({ id, message }) => (
  <FieldNote id={id} show={!!message}>
    <AlertCircle size={14} className="mt-[2px] shrink-0" aria-hidden="true" />
    <span>{message}</span>
  </FieldNote>
);

interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  t: T;
  invalid?: boolean;
  /** Extra ids for aria-describedby (errors, hints). */
  describedBy?: string;
}

/** Password input with a show / hide toggle and a Caps Lock warning. */
export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ id, value, onValueChange, t, invalid, describedBy, onKeyDown, onKeyUp, onBlur, ...rest }, ref) => {
    const [visible, setVisible] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const readCaps = (event: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState?.('CapsLock') ?? false);
    const capsId = `${id}-caps`;
    return (
      <>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={event => onValueChange(event.target.value)}
            onKeyDown={event => { readCaps(event); onKeyDown?.(event); }}
            onKeyUp={event => { readCaps(event); onKeyUp?.(event); }}
            onBlur={event => { setCapsLock(false); onBlur?.(event); }}
            aria-invalid={invalid || undefined}
            aria-describedby={[describedBy, capsLock ? capsId : null].filter(Boolean).join(' ') || undefined}
            spellCheck={false}
            autoCapitalize="none"
            className={fieldClass}
            style={{ paddingRight: 52 }}
            {...rest}
          />
          {/* The span positions the toggle: the global button rule in theme.css forces position: relative. */}
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              aria-label={visible ? t.hidePassword : t.showPassword}
              aria-pressed={visible}
              aria-controls={id}
              className="no-press flex h-10 w-10 items-center justify-center rounded-full text-faint transition-colors hover:bg-chip hover:text-on-surface focus-visible:ring-2 focus-visible:ring-accent"
            >
              {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
        </div>
        <FieldNote id={capsId} show={capsLock} tone="warn">
          <ArrowUp size={14} className="mt-[2px] shrink-0" strokeWidth={2.6} aria-hidden="true" />
          <span>{t.authCapsLock}</span>
        </FieldNote>
      </>
    );
  },
);
PasswordField.displayName = 'PasswordField';

/** The password rules as chips that tick green while typing. The same text is in `hintId` for screen readers. */
export const PasswordChecklist: React.FC<{ checks: PasswordChecks; t: T; hintId: string }> = ({ checks, t, hintId }) => {
  const items = [
    { key: 'length', met: checks.length, label: t.authReqLength.replace('{min}', String(PASSWORD_MIN_LENGTH)) },
    { key: 'letter', met: checks.letter, label: t.authReqLetter },
    { key: 'digit', met: checks.digit, label: t.authReqDigit },
  ];
  return (
    <>
      <p id={hintId} className="sr-only">{t.authPasswordHint.replace('{min}', String(PASSWORD_MIN_LENGTH))}</p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-hidden="true">
        {items.map(item => (
          <li
            key={item.key}
            className={clsx(
              'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold transition-colors duration-200',
              item.met ? 'bg-pos/12 text-pos' : 'bg-chip text-muted',
            )}
          >
            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
              <AnimatePresence initial={false} mode="popLayout">
                {item.met ? (
                  <m.span key="on" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 24 }} className="flex">
                    <Check size={13} strokeWidth={3} />
                  </m.span>
                ) : (
                  <m.span key="off" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                )}
              </AnimatePresence>
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </>
  );
};

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <span className={clsx('h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} aria-hidden="true" />
);

export const SubmitButton: React.FC<{ loading: boolean; label: string; t: T }> = ({ loading, label, t }) => (
  <button
    type="submit"
    disabled={loading}
    aria-busy={loading || undefined}
    className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-on-accent shadow-[0_14px_30px_-14px_rgb(var(--accent-rgb)/0.9)] transition-[opacity,box-shadow] hover:shadow-[0_18px_38px_-14px_rgb(var(--accent-rgb))] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper-bg)] disabled:cursor-wait disabled:opacity-70"
  >
    {loading ? (
      <>
        <Spinner />
        <span className="sr-only">{t.loading}</span>
      </>
    ) : (
      <>
        {label}
        <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      </>
    )}
  </button>
);

export const ErrorBanner: React.FC<{ message: string | null; action?: { label: string; onClick: () => void; busy?: boolean } }> = ({ message, action }) => (
  <AnimatePresence initial={false}>
    {message && (
      <m.div
        key="banner"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="overflow-hidden"
      >
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-[16px] bg-neg/10 px-4 py-3 text-[14px] leading-snug text-neg">
          <AlertCircle size={17} className="mt-px shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p>{message}</p>
            {action && (
              <button
                type="button"
                onClick={action.onClick}
                disabled={action.busy}
                className="no-press mt-1 inline-flex min-h-[32px] items-center gap-1.5 font-semibold underline decoration-neg/40 underline-offset-2 disabled:opacity-60"
              >
                {action.busy && <Spinner className="h-3.5 w-3.5" />}
                {action.label}
              </button>
            )}
          </div>
        </div>
      </m.div>
    )}
  </AnimatePresence>
);

export const TextLink: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...rest }) => (
  <button
    type="button"
    className={clsx('no-press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-1 text-[14px] font-semibold text-accent underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-accent', className)}
    {...rest}
  >
    {children}
  </button>
);
