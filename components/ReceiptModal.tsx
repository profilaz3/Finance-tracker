import React, { useState, useEffect } from 'react';
import { m } from 'motion/react';
import { X, Receipt } from 'lucide-react';
import { Transaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { useDialog } from '../hooks/useFocusTrap';
import { formatCurrency } from '../utils/formatters';

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction | null;
    onSave: (updated: Transaction) => void;
    t: typeof TRANSLATIONS['en'];
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
    isOpen,
    onClose,
    transaction,
    onSave,
    t
}) => {
    const [edited, setEdited] = useState<Transaction | null>(null);

    useEffect(() => {
        setEdited(transaction);
    }, [transaction]);

    const { dialogProps, titleId } = useDialog(isOpen && !!edited?.receiptData, onClose);

    if (!isOpen || !edited || !edited.receiptData) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 backdrop-blur-sm modal-safe-area">
            <m.div
                {...dialogProps}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="bg-surface-container-high w-full max-w-md rounded-xl shadow-elevation-3 overflow-hidden flex flex-col"
            >
                <div className="p-6 flex justify-between items-center border-b border-outline-variant">
                    <h3 id={titleId} className="text-lg font-display font-medium text-on-surface flex items-center gap-2">
                        <Receipt size={20} aria-hidden="true" /> {t.receiptDetails}
                    </h3>
                    <button type="button" onClick={onClose} aria-label={t.close} className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-highest rounded-full transition-colors text-on-surface-variant"><X size={20} aria-hidden="true" /></button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar max-h-[70vh]">
                    <div>
                        <label className="text-xs text-on-surface-variant mb-1 block">{t.merchant}</label>
                        <p className="text-lg font-medium text-on-surface">{edited.receiptData.merchant}</p>
                    </div>

                    <div className="space-y-2 mt-2">
                        <label className="text-xs text-on-surface-variant block">{t.items}</label>
                        {edited.receiptData.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center py-2 border-b border-outline-variant/10 last:border-0">
                                <span className="text-sm text-on-surface">
                                    {item.quantity && item.quantity > 1 && <span className="text-primary font-bold mr-1">{item.quantity}x</span>}
                                    {item.name}
                                </span>
                                <span className="text-sm font-medium text-on-surface">{formatCurrency(item.price, edited.currency)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between text-base font-bold text-on-surface pt-3 border-t border-outline-variant/20">
                            <span>{t.total}</span>
                            <span>{formatCurrency(edited.receiptData.total, edited.currency)}</span>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-outline-variant flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-primary text-on-primary font-medium rounded-full shadow-elevation-1 hover:shadow-elevation-2 transition-all">
                        {t.close}
                    </button>
                </div>
            </m.div>
        </div>
    );
};
