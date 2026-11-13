import React, { useState } from 'react';
import { Account } from '../types';
import { useDragControls } from 'motion/react';
import { Reorder } from 'motion/react-m';
import { GripVertical, Banknote, CreditCard, Trash2 } from 'lucide-react';
import { ICONS, IconName, IconPicker } from './IconPicker';
import { BalanceInput } from './BalanceInput';
import clsx from 'clsx';
import { formatCurrency } from '../utils/formatters';
import { calculateAdjustedInitialBalance } from '../utils/balanceMutations';
import { ConfirmDialog } from './ConfirmDialog';
import { TRANSLATIONS } from '../constants';

interface AccountItemProps {
    account: Account;
    onUpdate: (id: string, updates: Partial<Account>) => void;
    onDelete?: (id: string) => void;
    getAccountBalance: (account: Account) => number;
    language: 'en' | 'sr';
}

export const AccountItem: React.FC<AccountItemProps> = React.memo(({
    account,
    onUpdate,
    onDelete,
    getAccountBalance,
    language
}) => {
    const t = TRANSLATIONS[language];
    const dragControls = useDragControls();
    const [isEditingIcon, setIsEditingIcon] = useState(false);
    const [isEditingBalance, setIsEditingBalance] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    // Determine icon
    const Icon = ICONS[account.icon as IconName] || (account.type === 'cash' ? Banknote : CreditCard);

    // Calculate current balance (initial + transactions)
    const currentBalance = getAccountBalance(account);
    const tint = account.color || (account.type === 'cash' ? '#15803D' : account.type === 'bank' ? '#2563EB' : '#7C3AED');
    const typeLabel = account.type === 'cash' ? t.cash : account.type === 'bank' ? t.bank : t.other;

    return (
        <Reorder.Item
            value={account}
            id={account.id}
            dragListener={false}
            dragControls={dragControls}
            className="touch-none"
        >
            <div className="paper-tile group relative flex items-center gap-2.5 py-3 pl-2 pr-3">
                {/* Drag handle */}
                <div
                    onPointerDown={(e) => dragControls.start(e)}
                    aria-hidden="true"
                    className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-faint active:cursor-grabbing"
                >
                    <GripVertical size={18} />
                </div>

                {/* Icon and picker */}
                <div className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsEditingIcon(!isEditingIcon)}
                        aria-label={t.chooseIcon}
                        title={t.chooseIcon}
                        className="flex h-11 w-11 items-center justify-center rounded-[14px] transition-transform active:scale-95"
                        style={{
                            background: `color-mix(in oklab, ${tint} 16%, var(--paper-tile))`,
                            color: `color-mix(in oklab, ${tint} 72%, var(--paper-text))`,
                        }}
                    >
                        <Icon size={21} aria-hidden="true" />
                    </button>
                    {isEditingIcon && (
                        <div className="glass-sheet absolute left-0 top-12 z-20 w-72 rounded-[22px] p-4">
                            <IconPicker
                                selectedIcon={account.icon || 'wallet'}
                                onSelect={(icon) => {
                                    onUpdate(account.id, { icon });
                                    setIsEditingIcon(false);
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Name and type */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <input
                        value={account.name}
                        onChange={e => onUpdate(account.id, { name: e.target.value })}
                        aria-label={t.accountName}
                        className="w-full border-none bg-transparent p-0 text-[16px] font-semibold focus:ring-0"
                        placeholder={t.accountName}
                    />
                    <span className="text-[12px] text-muted">{typeLabel} · {account.currency}</span>
                </div>

                {/* Balance */}
                {!isEditingBalance ? (
                    <button
                        type="button"
                        onClick={() => setIsEditingBalance(true)}
                        className="shrink-0 rounded-lg px-1 text-right"
                    >
                        <span className={clsx(
                            "text-[15px] font-semibold tabular-nums",
                            currentBalance < 0 ? "text-neg" : ""
                        )}>
                            {formatCurrency(currentBalance, account.currency)}
                        </span>
                    </button>
                ) : (
                    <div className="w-36 shrink-0">
                        <BalanceInput
                            currency={account.currency}
                            initialAmount={account.initialBalance || 0}
                            onSave={(val) => {
                                const newInitial = calculateAdjustedInitialBalance({
                                    currentBalance,
                                    currentInitialBalance: account.initialBalance || 0,
                                    desiredDisplayedBalance: val,
                                });
                                onUpdate(account.id, { initialBalance: newInitial });
                                setIsEditingBalance(false);
                            }}
                            onCancel={() => setIsEditingBalance(false)}
                            language={language}
                        />
                    </div>
                )}

                {/* Delete */}
                {onDelete && (
                    <button
                        type="button"
                        onClick={() => setIsConfirmingDelete(true)}
                        aria-label={`${t.delete}: ${account.name}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-chip hover:text-neg"
                    >
                        <Trash2 size={17} aria-hidden="true" />
                    </button>
                )}
                {onDelete && (
                    <ConfirmDialog
                        isOpen={isConfirmingDelete}
                        type="danger"
                        title={t.deleteWalletTitle}
                        message={t.deleteWalletMessage}
                        confirmLabel={t.delete}
                        cancelLabel={t.cancel}
                        onCancel={() => setIsConfirmingDelete(false)}
                        onConfirm={() => {
                            setIsConfirmingDelete(false);
                            onDelete(account.id);
                        }}
                    />
                )}
            </div>
        </Reorder.Item>
    );
});

AccountItem.displayName = 'AccountItem';
