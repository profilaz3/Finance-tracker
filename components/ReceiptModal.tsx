import React, { useState, useEffect } from 'react';
import { m } from 'motion/react';
import { X, Receipt } from 'lucide-react';
import { Transaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { useDialog } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { MOTION } from '../config';
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
    const { wrapRef, handleProps, contentProps } = useSheetDrag(onClose);

    if (!isOpen || !edited || !edited.receiptData) return null;

    return (
        <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center">
            <m.div
                className="paper-scrim absolute inset-0"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={MOTION.backdrop}
                onClick={onClose}
                aria-hidden="true"
            />
            <div ref={wrapRef} className="relative flex w-full justify-center">
            <m.div
                {...dialogProps}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={MOTION.sheet.exit}
                transition={MOTION.sheet.spring}
                className="glass-sheet flex max-h-[90dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
            >
                <div className="shrink-0 touch-none" {...handleProps}>
                    <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
                    <div className="flex items-center gap-3 px-5 pb-3 pt-2 md:pt-5">
                        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
                            <Receipt size={20} />
                        </span>
                        <h3 id={titleId} className="flex-1 text-[22px] font-bold tracking-[-0.4px]">
                            {t.receiptDetails}
                        </h3>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t.close}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 custom-scrollbar" {...contentProps}>
                    <div className="paper-tile p-4">
                        <p className="text-[13px] font-semibold text-muted">{t.merchant}</p>
                        <p className="mt-0.5 text-[20px] font-bold tracking-tight">{edited.receiptData.merchant}</p>

                        <p className="mt-4 text-[13px] font-semibold text-muted">{t.items}</p>
                        <div className="mt-1 divide-y divide-hair">
                            {edited.receiptData.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-3 py-2.5">
                                    <span className="min-w-0 text-[15px]">
                                        {item.quantity && item.quantity > 1 && <span className="mr-1.5 font-bold text-accent">{item.quantity}x</span>}
                                        {item.name}
                                    </span>
                                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatCurrency(item.price, edited.currency)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-1 flex items-center justify-between border-t border-hair pt-3 text-[17px] font-bold">
                            <span>{t.total}</span>
                            <span className="tabular-nums">{formatCurrency(edited.receiptData.total, edited.currency)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 justify-end px-5 pb-5">
                    <button type="button" onClick={onClose} className="h-11 rounded-full bg-accent px-6 text-[15px] font-semibold text-on-accent">
                        {t.close}
                    </button>
                </div>
            </m.div>
            </div>
        </div>
    );
};
