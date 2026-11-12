import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Split } from 'lucide-react';
import { Account, Person, Currency } from '../types';
import { TRANSLATIONS } from '../constants';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';

interface SplitModalProps {
    isOpen: boolean;
    onClose: () => void;
    accounts: Account[];
    people: Person[];
    onSplit: (amount: number, currency: Currency, targetId: string, targetType: 'account' | 'person') => void;
    t: typeof TRANSLATIONS['en'];
}

export const SplitModal: React.FC<SplitModalProps> = ({
    isOpen,
    onClose,
    accounts,
    people,
    onSplit,
    t
}) => {
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<Currency>('RSD');
    const [targetType, setTargetType] = useState<'account' | 'person'>('account');
    const [selectedTarget, setSelectedTarget] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 backdrop-blur-sm p-4" onClick={onClose}>
            <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="bg-surface-container-high w-full max-w-sm rounded-xl shadow-elevation-3 overflow-hidden"
            >
                <div className="p-6 flex justify-between items-center border-b border-outline-variant">
                    <h3 className="text-lg font-display font-medium text-on-surface flex items-center gap-2">
                        <Split size={20} /> {t.splitTransaction}
                    </h3>
                    <button onClick={onClose} className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-highest rounded-full transition-colors text-on-surface-variant"><X size={20} /></button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-4">
                        {/* Amount Input */}
                        <div className="relative pt-2">
                            <label className="absolute -top-2 left-3 bg-surface-container-high px-1 text-xs text-primary">
                                {t.amount}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="flex-1 bg-transparent border border-outline rounded-l px-4 py-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50"
                                    autoFocus
                                />
                                <select
                                    value={currency}
                                    onChange={e => setCurrency(e.target.value as Currency)}
                                    className="bg-surface-container border border-outline rounded-r px-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary"
                                >
                                    <option value="RSD">RSD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="USD">USD</option>
                                </select>
                            </div>
                        </div>

                        {/* Target Type Toggle */}
                        <div className="flex bg-surface-container rounded-lg p-1">
                            <button
                                onClick={() => { setTargetType('account'); setSelectedTarget(''); }}
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${targetType === 'account' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                            >
                                {t.account}
                            </button>
                            <button
                                onClick={() => { setTargetType('person'); setSelectedTarget(''); }}
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${targetType === 'person' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                            >
                                {t.person}
                            </button>
                        </div>

                        {/* Target Selection */}
                        <div className="relative pt-2">
                            <label className="absolute -top-2 left-3 bg-surface-container-high px-1 text-xs text-primary">
                                {targetType === 'account' ? t.account : t.person}
                            </label>
                            <select
                                value={selectedTarget}
                                onChange={e => setSelectedTarget(e.target.value)}
                                className="w-full bg-transparent border border-outline rounded px-4 py-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
                            >
                                <option value="">{targetType === 'account' ? t.selectAccount : t.selectPerson}</option>
                                {targetType === 'person' && people.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.defaultCurrency})</option>
                                ))}
                                {targetType === 'account' && accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} className="px-6 py-2.5 text-primary font-medium hover:bg-surface-container-highest rounded-full transition-colors">{t.cancel}</button>
                        <button
                            onClick={() => { vibrate(HAPTIC_PATTERNS.success); onSplit(parseFloat(amount), currency, selectedTarget, targetType); }}
                            disabled={!amount || !selectedTarget}
                            className="px-6 py-2.5 bg-primary text-on-primary font-medium rounded-full shadow-elevation-1 hover:shadow-elevation-2 disabled:opacity-50 transition-all"
                        >
                            {t.confirm}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
