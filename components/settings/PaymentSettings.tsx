import React, { useState } from 'react';
import { QrCode } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { AppState, PaymentDetails } from '../../types';
import { formatAccountNumber } from '../../utils/ipsQr';
import { PaymentDetailsForm } from '../payments/PaymentDetailsForm';
import { openPaymentRequest } from '../payments/paymentBus';
import { IconTile } from '../ui/IconTile';

interface PaymentSettingsProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info', action?: { label: string; onClick: () => void }) => void;
}

/** Settings > Payment details: the account friends pay back to through an IPS QR code. */
export const PaymentSettings: React.FC<PaymentSettingsProps> = ({ state, setState, onToast }) => {
  const t = TRANSLATIONS[state.language];
  const details = state.paymentDetails ?? null;
  // Remount the form after a save or removal so it shows the stored values.
  const [formKey, setFormKey] = useState(0);

  const save = (next: PaymentDetails | null) => {
    setState(prev => ({ ...prev, paymentDetails: next }));
    setFormKey(key => key + 1);
    onToast?.(next ? t.paySaved : t.payRemoved, 'success');
  };

  // Removing is one tap, so it can be undone from the toast (settings sync picks up the restore).
  const remove = () => {
    const previous = details;
    if (!previous) return;
    setState(prev => ({ ...prev, paymentDetails: null }));
    setFormKey(key => key + 1);
    onToast?.(t.payRemoved, 'info', {
      label: t.undo,
      onClick: () => {
        setState(prev => (prev.paymentDetails ? prev : { ...prev, paymentDetails: previous }));
        setFormKey(key => key + 1);
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="paper-tile flex items-start gap-3 p-4">
        <IconTile icon={QrCode} size={40} color="#16A34A" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-muted">{t.payIntro}</p>
      </div>

      <div className="paper-tile p-4">
        <PaymentDetailsForm
          key={formKey}
          initial={details}
          defaultName={state.userProfile?.name}
          language={state.language}
          onSave={save}
          onRemove={details ? remove : undefined}
        />
      </div>

      {details && (
        <button
          type="button"
          onClick={() => openPaymentRequest({ amount: 0, currency: 'RSD' })}
          className="paper-tile flex min-h-[56px] items-center justify-center gap-2 text-[15px] font-semibold text-accent"
        >
          <QrCode size={18} aria-hidden="true" />
          {t.payTryQr}
        </button>
      )}

      <p className="px-4 text-[12px] text-faint">
        {details ? `${formatAccountNumber(details.account)}. ` : ''}{t.payPrivacy}
      </p>
    </div>
  );
};
