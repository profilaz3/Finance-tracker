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
        <div className="bg-surface-container p-4 rounded-xl space-y-3">
            <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                <Receipt size={14} aria-hidden="true" /> {t.receiptDetails}
            </h4>
            <div>
                <label htmlFor="edit-tx-merchant" className="text-xs text-on-surface-variant mb-1 block">{t.merchant}</label>
                <input
                    id="edit-tx-merchant"
                    value={receiptData.merchant}
                    onChange={e => setEdited({
                        ...edited,
                        receiptData: { ...receiptData, merchant: e.target.value }
                    })}
                    className="w-full bg-surface-container-high border-none rounded px-2 py-1 text-sm text-on-surface"
                />
            </div>

            <div className="space-y-2 mt-2">
                <label className="text-xs text-on-surface-variant block">{t.items}</label>
                {receiptData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                        <input
                            value={item.name}
                            onChange={e => updateItem(idx, { ...item, name: e.target.value })}
                            className="flex-1 bg-surface-container-high border-none rounded px-2 py-1 text-xs text-on-surface"
                            placeholder={t.itemName}
                        />
                        <input
                            type="number"
                            value={item.quantity || 1}
                            onChange={e => updateItem(idx, { ...item, quantity: parseRequiredNumberInput(e.target.value) })}
                            className="w-12 bg-surface-container-high border-none rounded px-2 py-1 text-xs text-on-surface text-center"
                            placeholder={t.qty}
                        />
                        <input
                            type="number"
                            value={item.price}
                            onChange={e => updateItem(idx, { ...item, price: parseRequiredNumberInput(e.target.value) })}
                            className="w-20 bg-surface-container-high border-none rounded px-2 py-1 text-xs text-on-surface text-right"
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
