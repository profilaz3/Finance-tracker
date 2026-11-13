import React, { useState } from 'react';
import { QrCode } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { AppState, PaymentDetails } from '../../types';
import { formatAccountNumber } from '../../utils/ipsQr';
import { PaymentDetailsForm } from '../payments/PaymentDetailsForm';
import { openPaymentRequest } from '../payments/paymentBus';

interface PaymentSettingsProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="paper-tile flex items-start gap-3 p-4">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
          <QrCode size={20} />
        </span>
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-muted">{t.payIntro}</p>
      </div>

      <div className="paper-tile p-4">
        <PaymentDetailsForm
          key={formKey}
          initial={details}
          defaultName={state.userProfile?.name}
          language={state.language}
          onSave={save}
          onRemove={details ? () => save(null) : undefined}
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
