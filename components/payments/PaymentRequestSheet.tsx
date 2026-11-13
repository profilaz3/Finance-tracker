import React, { useEffect, useId, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Share2 } from 'lucide-react';
import { GlassSheet } from '../ui/GlassSheet';
import { TRANSLATIONS } from '../../constants';
import type { AppState, PaymentDetails } from '../../types';
import { convertAmount } from '../../services/currencyService';
import { formatMoney } from '../../utils/locale';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';
import { buildIpsPayload, formatAccountNumber, IPS_LIMITS, sanitizeIpsLine } from '../../utils/ipsQr';
import { PaymentDetailsForm } from './PaymentDetailsForm';
import { encodeQr, qrPath, QUIET_ZONE, renderQrPng, sharePng, type QrMatrix } from './qrCode';
import type { PaymentRequestInput } from './paymentBus';

export interface PaymentRequestSheetProps {
  isOpen: boolean;
  request: PaymentRequestInput | null;
  state: Pick<AppState, 'language' | 'rates' | 'paymentDetails' | 'userProfile'>;
  onClose: () => void;
  onSaveDetails: (details: PaymentDetails | null) => void;
  onToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/** The label NBS asks for next to a payee's IPS QR code (K:PR). */
const NBS_LABEL = 'NBS IPS QR';

const parseDinars = (value: string): number => {
  const normalized = value.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
};

/**
 * "Get paid back": an NBS IPS QR code the other person scans in any Serbian bank app.
 * IPS pays in dinars only, so other currencies are converted at the app's current rate and
 * rounded to whole dinars.
 */
export const PaymentRequestSheet: React.FC<PaymentRequestSheetProps> = ({ isOpen, request, state, onClose, onSaveDetails, onToast }) => {
  const t = TRANSLATIONS[state.language];
  const id = useId();
  const details = state.paymentDetails ?? null;
  const [editingDetails, setEditingDetails] = useState(false);

  // The debt in dinars, whole dinars (IPS is RSD only).
  const owedDinars = useMemo(() => {
    if (!request) return 0;
    const value = request.currency === 'RSD' ? request.amount : convertAmount(request.amount, request.currency, 'RSD', state.rates);
    return Math.max(0, Math.round(value));
  }, [request, state.rates]);

  const [amountText, setAmountText] = useState('');
  const [purpose, setPurpose] = useState('');
  const [matrix, setMatrix] = useState<QrMatrix | null>(null);
  const [sharing, setSharing] = useState(false);

  // A new request resets the fields.
  useEffect(() => {
    if (!request) return;
    setAmountText(owedDinars > 0 ? String(owedDinars) : '');
    setPurpose(sanitizeIpsLine(request.purpose ?? t.payPurposeDefault, IPS_LIMITS.purpose));
    setEditingDetails(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new request arrives
  }, [request]);

  const dinars = parseDinars(amountText);
  const amountValid = Number.isFinite(dinars) && dinars >= 1 && dinars <= 999_999_999_999;
  const payload = useMemo(() => {
    if (!details || !amountValid) return null;
    const result = buildIpsPayload({ ...details, amount: Math.round(dinars * 100) / 100, purpose });
    return result.ok ? result.payload : null;
  }, [details, amountValid, dinars, purpose]);

  useEffect(() => {
    let cancelled = false;
    if (!payload) {
      setMatrix(null);
      return;
    }
    encodeQr(payload)
      .then((next) => {
        if (!cancelled) setMatrix(next);
      })
      .catch(() => {
        if (!cancelled) setMatrix(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const amountLabel = amountValid
    ? formatMoney(dinars, 'RSD', state.language, { minimumFractionDigits: Number.isInteger(dinars) ? 0 : 2, maximumFractionDigits: 2 })
    : '';
  const converted = request && request.currency !== 'RSD';
  const showForm = !details || editingDetails;
  const cells = matrix ? matrix.size + QUIET_ZONE * 2 : 0;

  const share = async () => {
    if (!matrix || !details) return;
    setSharing(true);
    try {
      const lines = [details.name, purpose].filter(Boolean);
      const blob = await renderQrPng(matrix, { label: NBS_LABEL, amount: amountLabel, lines });
      const text = t.payShareText.replace('{amount}', amountLabel).replace('{name}', details.name);
      const outcome = await sharePng(blob, { fileName: 'payment-qr.png', text, title: t.payRequestTitle });
      if (outcome === 'downloaded') onToast(t.paySavedImage, 'success');
      if (outcome === 'failed') onToast(t.payShareFailed, 'error');
    } catch {
      onToast(t.payShareFailed, 'error');
    } finally {
      setSharing(false);
    }
  };

  const markSettled = () => {
    if (!request?.onSettled || !amountValid) return;
    const full = Math.round(dinars) >= owedDinars;
    const amount = full
      ? request.amount
      : request.currency === 'RSD'
        ? Math.round(dinars * 100) / 100
        : Math.round(convertAmount(dinars, 'RSD', request.currency, state.rates) * 100) / 100;
    vibrate(HAPTIC_PATTERNS.success);
    request.onSettled({ full, amount });
    onClose();
  };

  const subtitle = request?.payerName ? t.payScanBy.replace('{name}', request.payerName) : t.payScanAny;

  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title={t.payRequestTitle} closeLabel={t.close}>
      {showForm ? (
        <div className="flex flex-col gap-4 pb-1">
          <p className="text-[14px] leading-snug text-muted">{details ? t.payIntro : t.payNeedDetails}</p>
          <PaymentDetailsForm
            initial={details}
            defaultName={state.userProfile?.name}
            language={state.language}
            submitLabel={details ? t.paySave : t.payShowQr}
            onSave={(next) => {
              onSaveDetails(next);
              setEditingDetails(false);
              vibrate(HAPTIC_PATTERNS.success);
            }}
            onCancel={details ? () => setEditingDetails(false) : undefined}
          />
          <p className="text-[12px] text-faint">{t.payPrivacy}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-1">
          <p className="-mt-1 text-[14px] text-muted">{subtitle}</p>

          {/* Always black on white: bank apps read dark modules on a light quiet zone. */}
          <figure className="mx-auto flex w-full max-w-[300px] flex-col items-center rounded-[28px] bg-white px-3 pb-3 pt-3 text-slate-700 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.5)]">
            <div className="relative aspect-square w-full">
              {matrix ? (
                <svg
                  viewBox={`0 0 ${cells} ${cells}`}
                  className="h-full w-full"
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={`${NBS_LABEL}: ${amountLabel}, ${details?.name ?? ''}`}
                >
                  <rect width={cells} height={cells} fill="#FFFFFF" />
                  <path d={qrPath(matrix)} fill="#000000" />
                </svg>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  {amountValid ? <Loader2 size={28} className="animate-spin" aria-hidden="true" /> : <span className="px-6 text-center text-[13px]">{t.payAmountInvalid}</span>}
                </div>
              )}
            </div>
            <figcaption className="pt-1 text-[13px] font-semibold tracking-[0.4px] text-slate-600">{NBS_LABEL}</figcaption>
          </figure>

          <div className="paper-tile flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-amount`} className="px-1 text-[12px] font-semibold text-muted">{t.payAmount}</label>
              <div className="flex items-center gap-2">
                <input
                  id={`${id}-amount`}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={!amountValid}
                  aria-describedby={converted ? `${id}-converted` : undefined}
                  className="h-12 min-w-0 flex-1 rounded-[14px] bg-chip px-4 text-[20px] font-bold tabular-nums outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="flex h-12 shrink-0 items-center rounded-[14px] bg-chip px-3 text-[13px] font-bold text-muted">RSD</span>
              </div>
              {converted && request && (
                <p id={`${id}-converted`} className="px-1 text-[12px] text-faint">
                  {t.payConverted.replace('{original}', formatMoney(request.amount, request.currency, state.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between px-1">
                <label htmlFor={`${id}-purpose`} className="text-[12px] font-semibold text-muted">{t.payPurpose}</label>
                <span className="text-[11px] tabular-nums text-faint" aria-hidden="true">{Array.from(purpose).length}/{IPS_LIMITS.purpose}</span>
              </div>
              <input
                id={`${id}-purpose`}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                onBlur={() => setPurpose(sanitizeIpsLine(purpose, IPS_LIMITS.purpose))}
                maxLength={IPS_LIMITS.purpose}
                autoComplete="off"
                className="h-12 w-full rounded-[14px] bg-chip px-4 text-[16px] outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            {details && (
              <div className="flex items-center gap-3 border-t border-hair pt-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[12px] font-semibold text-muted">{t.payRecipient}</span>
                  <span className="truncate text-[15px] font-semibold">{details.name}</span>
                  <span className="truncate text-[13px] tabular-nums text-muted">{formatAccountNumber(details.account)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditingDetails(true)}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3.5 text-[13px] font-semibold"
                >
                  <Pencil size={14} aria-hidden="true" /> {t.payEdit}
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void share()}
              disabled={!matrix || sharing}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-chip px-4 text-[15px] font-semibold disabled:opacity-50"
            >
              {sharing ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
              {t.payShare}
            </button>
            {request?.onSettled && (
              <button
                type="button"
                onClick={markSettled}
                disabled={!amountValid}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent disabled:opacity-50"
              >
                <Check size={18} aria-hidden="true" />
                <span className="truncate">{t.payMarkSettled}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </GlassSheet>
  );
};
