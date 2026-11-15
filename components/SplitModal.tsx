import React, { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { X, Split, ChevronDown, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { Account, Person, Currency } from '../types';
import { TRANSLATIONS } from '../constants';
import { useDialog } from '../hooks/useFocusTrap';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { MOTION } from '../config';
import { Segmented } from './ui/Segmented';
import { excludeOwnProfile } from '../domain/people';
import { AmountInput } from './ui/AmountInput';

const label = 'mb-1.5 block px-1 text-[13px] font-semibold text-muted';

interface SplitModalProps {
    isOpen: boolean;
    onClose: () => void;
    accounts: Account[];
    people: Person[];
    /** The user's own profile: money moved to it is a move to "me", so it is not a target here. */
    userProfile?: Person;
    onSplit: (amount: number, currency: Currency, targetId: string, targetType: 'account' | 'person') => void;
    t: typeof TRANSLATIONS['en'];
}

export const SplitModal: React.FC<SplitModalProps> = ({
    isOpen,
    onClose,
    accounts,
    people: allPeople,
    userProfile,
    onSplit,
    t
}) => {
    const people = useMemo(() => excludeOwnProfile(allPeople, userProfile), [allPeople, userProfile]);
    const language = t === TRANSLATIONS.sr ? 'sr' : 'en';
    const [amount, setAmount] = useState<number | undefined>(undefined);
    const [amountUnreadable, setAmountUnreadable] = useState(false);
    const [currency, setCurrency] = useState<Currency>('RSD');
    // The currency follows the chosen wallet or person until it is picked by hand.
    const [currencyPicked, setCurrencyPicked] = useState(false);
    const [targetType, setTargetType] = useState<'account' | 'person'>('account');
    const [selectedTarget, setSelectedTarget] = useState('');

    const { dialogProps, titleId } = useDialog(isOpen, onClose);
    const { wrapRef, handleProps } = useSheetDrag(onClose);
    const amountId = `${titleId}-amount`;
    const targetId = `${titleId}-target`;

    if (!isOpen) return null;

    const canConfirm = amount !== undefined && amount > 0 && !amountUnreadable && !!selectedTarget;
    const pickTarget = (id: string) => {
        setSelectedTarget(id);
        if (currencyPicked) return;
        const targetCurrency = targetType === 'account'
            ? accounts.find(a => a.id === id)?.currency
            : people.find(p => p.id === id)?.defaultCurrency;
        if (targetCurrency) setCurrency(targetCurrency);
    };

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
                            <Split size={20} />
                        </span>
                        <h3 id={titleId} className="flex-1 text-[22px] font-bold tracking-[-0.4px]">
                            {t.splitTransaction}
                        </h3>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t.close}
                            className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip">
                                <X size={18} aria-hidden="true" />
                            </span>
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">
                    {/* Amount Input */}
                    <div>
                        <label htmlFor={amountId} className={label}>{t.amount}</label>
                        <div className="flex gap-2">
                            <AmountInput
                                id={amountId}
                                language={language}
                                value={amount}
                                onValueChange={(value, text) => {
                                    setAmount(value);
                                    setAmountUnreadable(value === undefined && text.trim() !== '');
                                }}
                                placeholder="0"
                                aria-invalid={amountUnreadable || undefined}
                                aria-describedby={amountUnreadable ? `${amountId}-error` : undefined}
                                className={clsx(
                                    'h-14 min-w-0 flex-1 rounded-[16px] border-none bg-chip px-4 text-[24px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint',
                                    amountUnreadable ? 'ring-2 ring-neg' : 'focus:ring-2 focus:ring-accent'
                                )}
                                autoFocus
                            />
                            <div className="relative w-[104px] shrink-0">
                                <select
                                    value={currency}
                                    aria-label={t.currency}
                                    onChange={e => { setCurrency(e.target.value as Currency); setCurrencyPicked(true); }}
                                    className="h-14 w-full appearance-none rounded-[16px] border-none bg-chip pl-4 pr-9 text-[16px] font-semibold text-on-surface outline-none focus:ring-2 focus:ring-accent"
                                >
                                    <option value="RSD">RSD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="USD">USD</option>
                                </select>
                                <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                            </div>
                        </div>
                        {amountUnreadable && (
                            <div id={`${amountId}-error`} role="alert" className="mt-1 flex items-center gap-1 px-1 text-[12px] text-neg">
                                <AlertCircle size={12} aria-hidden="true" />
                                <span>{t.amountUnreadable}</span>
                            </div>
                        )}
                    </div>

                    {/* Target Type Toggle */}
                    <Segmented<'account' | 'person'>
                        ariaLabel={t.splitTransaction}
                        value={targetType}
                        onChange={(value) => { setTargetType(value); setSelectedTarget(''); }}
                        options={[
                            { value: 'account', label: t.wallet },
                            { value: 'person', label: t.person },
                        ]}
                    />

                    {/* Target Selection */}
                    <div>
                        <label htmlFor={targetId} className={label}>
                            {targetType === 'account' ? t.wallet : t.person}
                        </label>
                        <div className="relative">
                            <select
                                id={targetId}
                                value={selectedTarget}
                                onChange={e => pickTarget(e.target.value)}
                                className="h-12 w-full appearance-none rounded-[14px] border-none bg-chip pl-4 pr-10 text-[16px] text-on-surface outline-none focus:ring-2 focus:ring-accent"
                            >
                                <option value="">{targetType === 'account' ? t.chooseWallet : t.selectPerson}</option>
                                {targetType === 'person' && people.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.defaultCurrency})</option>
                                ))}
                                {targetType === 'account' && accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                                ))}
                            </select>
                            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-11 rounded-full px-5 text-[15px] font-semibold text-muted hover:bg-chip"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!canConfirm || amount === undefined) return;
                                vibrate(HAPTIC_PATTERNS.success);
                                onSplit(amount, currency, selectedTarget, targetType);
                            }}
                            disabled={!canConfirm}
                            className={clsx(
                                'h-11 rounded-full px-6 text-[15px] font-semibold transition-colors',
                                canConfirm ? 'bg-accent text-on-accent' : 'cursor-not-allowed bg-chip text-faint'
                            )}
                        >
                            {t.confirm}
                        </button>
                    </div>
                </div>
            </m.div>
            </div>
        </div>
    );
};
