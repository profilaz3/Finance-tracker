import React, { Suspense, useState } from 'react';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { usePaymentRequests, type PaymentRequestInput } from './paymentBus';
import type { PaymentRequestSheetProps } from './PaymentRequestSheet';

const PaymentRequestSheet = lazyWithReload(() => import('./PaymentRequestSheet').then(m => ({ default: m.PaymentRequestSheet })));

type PaymentHostProps = Pick<PaymentRequestSheetProps, 'state' | 'onSaveDetails' | 'onToast'>;

/**
 * Listens for `openPaymentRequest` and owns the payment QR sheet. Lazy loaded by AppModals so the
 * listener, the sheet and the QR encoder stay out of the entry chunk; the sheet mounts on first request.
 */
const PaymentHost: React.FC<PaymentHostProps> = ({ state, onSaveDetails, onToast }) => {
  const [request, setRequest] = useState<PaymentRequestInput | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  usePaymentRequests((next) => {
    setRequest(next);
    setIsOpen(true);
  });

  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <PaymentRequestSheet
        isOpen={isOpen}
        request={request}
        state={state}
        onClose={() => setIsOpen(false)}
        onSaveDetails={onSaveDetails}
        onToast={onToast}
      />
    </Suspense>
  );
};

export default PaymentHost;
