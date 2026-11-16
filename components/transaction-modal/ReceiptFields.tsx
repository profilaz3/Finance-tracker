import React from 'react';
import { Receipt } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { Transaction } from '../../types';
import { AmountInput } from '../ui/AmountInput';
import { formatAmountForInput } from '../../utils/numberInput';

interface ReceiptFieldsProps {
    edited: Transaction;
    setEdited: React.Dispatch<React.SetStateAction<Transaction>>;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
}

type ReceiptItem = NonNullable<Transaction['receiptData']>['items'][number];

const cellClass = 'h-10 rounded-[10px] border-none bg-chip px-2.5 text-[14px] text-on-surface outline-none focus:ring-2 focus:ring-accent';

export const ReceiptFields: React.FC<ReceiptFieldsProps> = ({ edited, setEdited, language, t }) => {
    if (!edited.receiptData) return null;

    const { receiptData } = edited;
    const updateItem = (idx: number, item: ReceiptItem) =>
        setEdited(prev => {
            if (!prev.receiptData) return prev;
            const items = [...prev.receiptData.items];
            items[idx] = item;
            return { ...prev, receiptData: { ...prev.receiptData, items } };
        });

    return (
        <div className="paper-tile space-y-3 p-4">
            <h4 className="flex items-center gap-2 text-[14px] font-semibold text-accent">
                <Receipt size={14} aria-hidden="true" /> {t.receiptDetails}
            </h4>
            <div>
                <label htmlFor="edit-tx-merchant" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.merchant}</label>
                <input
                    id="edit-tx-merchant"
                    value={receiptData.merchant}
                    onChange={e => {
                        const merchant = e.target.value;
                        setEdited(prev => (prev.receiptData ? { ...prev, receiptData: { ...prev.receiptData, merchant } } : prev));
                    }}
                    className={`w-full ${cellClass}`}
                />
            </div>

            <div className="space-y-2 mt-2">
                <span className="block text-[12px] font-semibold text-muted">{t.items}</span>
                {receiptData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                        <input
                            value={item.name}
                            onChange={e => updateItem(idx, { ...item, name: e.target.value })}
                            aria-label={t.itemName}
                            className={`min-w-0 flex-1 ${cellClass}`}
                            placeholder={t.itemName}
                        />
                        <AmountInput
                            language={language}
                            value={item.quantity}
                            emptyWhenZero
                            onValueChange={quantity => updateItem(idx, { ...item, quantity: quantity ?? 0 })}
                            aria-label={t.qty}
                            className={`w-14 text-center ${cellClass}`}
                            placeholder={t.qty}
                        />
                        <AmountInput
                            language={language}
                            value={item.price}
                            emptyWhenZero
                            onValueChange={price => updateItem(idx, { ...item, price: price ?? 0 })}
                            aria-label={t.itemPrice}
                            className={`w-28 text-right tabular-nums ${cellClass}`}
                            placeholder="0"
                        />
                    </div>
                ))}
                <div className="flex justify-between text-xs font-bold text-on-surface pt-2 border-t border-outline-variant/20">
                    <span>{t.total}</span>
                    <span className="tabular-nums">{formatAmountForInput(receiptData.total, language)}</span>
                </div>
            </div>
        </div>
    );
};
