import React, { useId, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CircleCheck, CircleAlert, Landmark } from 'lucide-react';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { TRANSLATIONS } from '../../constants';
import type { AppState, PaymentDetails } from '../../types';
import { formatAccountNumber, IPS_LIMITS, parseAccountNumber } from '../../utils/ipsQr';

interface PaymentDetailsFormProps {
  initial?: PaymentDetails | null;
  /** Suggested name when nothing is saved yet (the profile name). */
  defaultName?: string;
  language: AppState['language'];
  onSave: (details: PaymentDetails) => void;
  onCancel?: () => void;
  onRemove?: () => void;
  submitLabel?: string;
}

const field = 'h-12 w-full min-w-0 rounded-[14px] border-none bg-chip px-4 text-[16px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent';
const label = 'px-1 text-[12px] font-semibold text-muted';

const GROUPS = [3, 13, 2];

/** A small bank card that mirrors the form as you type: account in 3-13-2 groups, missing digits as faint zeros. */
const AccountCardPreview: React.FC<{ digits: string; name: string; valid: boolean }> = ({ digits, name, valid }) => {
  let offset = 0;
  const groups = GROUPS.map(length => {
    const part = digits.slice(offset, offset + length);
    offset += length;
    return { part, rest: '0'.repeat(Math.max(0, length - part.length)) };
  });
  return (
    <div aria-hidden="true" className="relative overflow-hidden rounded-[24px] bg-accent p-4 text-on-accent shadow-[0_14px_30px_-18px_rgb(var(--accent-rgb)/0.9)]">
      <svg viewBox="0 0 300 160" preserveAspectRatio="xMaxYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
        <circle cx="270" cy="20" r="90" fill="currentColor" fillOpacity="0.08" />
        <circle cx="270" cy="20" r="54" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1.5" />
        <path d="M0 140 C 80 110, 160 170, 300 120" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" />
      </svg>
      <div className="relative flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/20 ring-1 ring-white/25">
          <Landmark size={20} />
        </span>
        <span className="flex items-center gap-2">
          {valid && <CircleCheck size={18} />}
          <span className="flex rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.35)]"><CurrencyFlag currency="RSD" size={28} /></span>
        </span>
      </div>
      <p className="relative mt-5 whitespace-nowrap text-[19px] font-semibold tabular-nums tracking-[0.6px]">
        {groups.map((group, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="opacity-60">-</span>}
            {group.part}
            <span className="opacity-40">{group.rest}</span>
          </React.Fragment>
        ))}
      </p>
      <p className="relative mt-1 truncate text-[13px] font-semibold uppercase tracking-[0.8px] opacity-85">{name || '\u00A0'}</p>
    </div>
  );
};

/** Account number (validated as you type), name and optional address for IPS QR requests. */
export const PaymentDetailsForm: React.FC<PaymentDetailsFormProps> = ({
  initial,
  defaultName,
  language,
  onSave,
  onCancel,
  onRemove,
  submitLabel,
}) => {
  const t = TRANSLATIONS[language];
  const id = useId();
  const [account, setAccount] = useState(initial?.account ? formatAccountNumber(initial.account) : '');
  const [name, setName] = useState(initial?.name ?? defaultName ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(() => parseAccountNumber(account), [account]);
  // Judge the number only once it could be complete, or after a save attempt.
  const digitCount = account.replace(/\D/g, '').length;
  const showStatus = touched || digitCount >= 18 || (parsed.ok && digitCount > 0);
  const accountError = !parsed.ok && showStatus
    ? parsed.reason === 'checksum'
      ? t.payAccountChecksum
      : parsed.reason === 'empty'
        ? t.payAccountRequired
        : t.payAccountFormat
    : null;
  const nameError = touched && !name.trim() ? t.payNameRequired : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!parsed.ok || !name.trim()) return;
    onSave({
      account: parsed.digits,
      name: name.trim().slice(0, IPS_LIMITS.name),
      ...(address.trim() ? { address: address.trim().slice(0, IPS_LIMITS.name) } : {}),
      ...(city.trim() ? { city: city.trim().slice(0, IPS_LIMITS.name) } : {}),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <AccountCardPreview
        digits={parsed.ok ? parsed.digits : account.replace(/\D/g, '').slice(0, 18)}
        name={name.trim()}
        valid={parsed.ok}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-account`} className={label}>{t.payAccount}</label>
        <input
          id={`${id}-account`}
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          onBlur={() => {
            if (parsed.ok) setAccount(formatAccountNumber(parsed.digits));
          }}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="000-0000000000000-00"
          aria-invalid={!!accountError}
          aria-describedby={`${id}-account-status`}
          maxLength={32}
          className={clsx(field, 'font-semibold tabular-nums tracking-[0.3px]')}
        />
        <p id={`${id}-account-status`} aria-live="polite" className="flex min-h-[18px] items-center gap-1.5 px-1 text-[12px] font-medium">
          {accountError ? (
            <span className="flex items-center gap-1.5 text-neg">
              <CircleAlert size={14} aria-hidden="true" /> {accountError}
            </span>
          ) : parsed.ok ? (
            <span className="flex items-center gap-1.5 text-pos">
              <CircleCheck size={14} aria-hidden="true" /> {t.payAccountOk}
            </span>
          ) : (
            <span className="text-faint">{t.payAccountHint}</span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className={label}>{t.payName}</label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={IPS_LIMITS.name}
          aria-invalid={!!nameError}
          aria-describedby={`${id}-name-hint`}
          className={field}
        />
        <p id={`${id}-name-hint`} className={clsx('px-1 text-[12px]', nameError ? 'font-medium text-neg' : 'text-faint')}>
          {nameError ?? t.payNameHint}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-address`} className={label}>{t.payAddress}</label>
          <input
            id={`${id}-address`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
            maxLength={IPS_LIMITS.name}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-city`} className={label}>{t.payCity}</label>
          <input
            id={`${id}-city`}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
            maxLength={IPS_LIMITS.name}
            className={field}
          />
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button type="submit" className="flex h-12 min-w-[120px] flex-1 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent">
          {submitLabel ?? t.paySave}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex h-12 items-center justify-center rounded-full bg-chip px-5 text-[15px] font-semibold">
            {t.cancel}
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="flex h-12 items-center justify-center rounded-full px-4 text-[15px] font-semibold text-neg">
            {t.payRemove}
          </button>
        )}
      </div>
    </form>
  );
};
