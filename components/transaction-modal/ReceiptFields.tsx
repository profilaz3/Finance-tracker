import React from 'react';
import { Receipt } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { Transaction } from '../../types';
import { parseRequiredNumberInput } from '../../utils/numberInput';

interface ReceiptFieldsProps {
    edited: Transaction;
    setEdited: React.Dispatch<React.SetStateAction<Transaction | null>>;
    t: typeof TRANSLATIONS['en'];
}

type ReceiptItem = NonNullable<Transaction['receiptData']>['items'][number];

export const ReceiptFields: React.FC<ReceiptFieldsProps> = ({ edited, setEdited, t }) => {
    if (!edited.receiptData) return null;

    const { receiptData } = edited;
    const updateItem = (idx: number, item: ReceiptItem) => {
        const newItems = [...receiptData.items];
        newItems[idx] = item;
        setEdited({ ...edited, receiptData: { ...receiptData, items: newItems } });
    };

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
                    onChange={e => setEdited({
                        ...edited,
                        receiptData: { ...receiptData, merchant: e.target.value }
                    })}
                    className="w-full rounded-[10px] border-none bg-chip px-2.5 py-1.5 text-sm text-on-surface"
                />
            </div>

            <div className="space-y-2 mt-2">
                <label className="block text-[12px] font-semibold text-muted">{t.items}</label>
                {receiptData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                        <input
                            value={item.name}
                            onChange={e => updateItem(idx, { ...item, name: e.target.value })}
                            className="flex-1 rounded-[10px] border-none bg-chip px-2.5 py-1.5 text-xs text-on-surface"
                            placeholder={t.itemName}
                        />
                        <input
                            type="number"
                            value={item.quantity || 1}
                            onChange={e => updateItem(idx, { ...item, quantity: parseRequiredNumberInput(e.target.value) })}
                            className="w-12 rounded-[10px] border-none bg-chip px-2.5 py-1.5 text-xs text-on-surface text-center"
                            placeholder={t.qty}
                        />
                        <input
                            type="number"
                            value={item.price}
                            onChange={e => updateItem(idx, { ...item, price: parseRequiredNumberInput(e.target.value) })}
                            className="w-20 rounded-[10px] border-none bg-chip px-2.5 py-1.5 text-xs text-on-surface text-right"
                            placeholder="0.00"
                        />
                    </div>
                ))}
                <div className="flex justify-between text-xs font-bold text-on-surface pt-2 border-t border-outline-variant/20">
                    <span>{t.total}</span>
                    <span>{receiptData.total}</span>
                </div>
            </div>
        </div>
    );
};
