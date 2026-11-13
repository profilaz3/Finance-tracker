import React, { useState } from 'react';
import { Account } from '../types';
import { useDragControls } from 'motion/react';
import { Reorder } from 'motion/react-m';
import { List, Banknote, CreditCard, Wallet, Edit2, Trash2 } from 'lucide-react';
import { ICONS, IconName, IconPicker } from './IconPicker';
import { BalanceInput } from './BalanceInput';
import clsx from 'clsx';
import { formatCurrency } from '../utils/formatters';
import { calculateAdjustedInitialBalance } from '../utils/balanceMutations';

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
    const dragControls = useDragControls();
    const [isEditingIcon, setIsEditingIcon] = useState(false);
    const [isEditingBalance, setIsEditingBalance] = useState(false);

    // Determine icon
    const Icon = ICONS[account.icon as IconName] || (account.type === 'cash' ? Banknote : CreditCard);

    // Calculate current balance (initial + transactions)
    const currentBalance = getAccountBalance(account);

    return (
        <Reorder.Item
            value={account}
            id={account.id}
            dragListener={false}
            dragControls={dragControls}
            className="touch-none"
        >
            <div className="flex flex-col gap-2 bg-surface-container p-3 rounded-2xl relative group border border-transparent hover:border-outline-variant/20 transition-all">
                <div className="flex flex-row gap-3 items-center">
                    {/* Drag Handle */}
                    <div
                        onPointerDown={(e) => dragControls.start(e)}
                        className="cursor-grab active:cursor-grabbing text-on-surface-variant/30 hover:text-on-surface-variant flex items-center justify-center p-1.5 rounded-lg hover:bg-surface-container-high transition-colors"
                    >
                        <List size={18} />
                    </div>

                    {/* Icon & Picker */}
                    <div className="relative flex-shrink-0">
                        <button
                            onClick={() => setIsEditingIcon(!isEditingIcon)}
                            className="w-10 h-10 rounded-full bg-surface-container-highest text-primary flex items-center justify-center hover:bg-primary-container hover:text-on-primary-container transition-all hover:scale-105 active:scale-95 shadow-sm"
                            style={{ color: account.color }}
                        >
                            <Icon size={20} />
                        </button>
                        {isEditingIcon && (
                            <div className="absolute top-12 left-0 z-20 bg-surface-container-high p-4 rounded-2xl shadow-xl w-72 border border-outline-variant/20 animate-in fade-in zoom-in-95 duration-200">
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

                    {/* Name & Type */}
                    <div className="flex-1 min-w-0">
                        <input
                            value={account.name}
                            onChange={e => onUpdate(account.id, { name: e.target.value })}
                            className="bg-transparent border-none text-base font-medium text-on-surface w-full focus:ring-0 p-0 placeholder-on-surface-variant/50"
                            placeholder="Account Name"
                        />
                    </div>

                    {/* Balance - Compact */}
                    {!isEditingBalance ? (
                        <div
                            onClick={() => setIsEditingBalance(true)}
                            className="cursor-pointer text-right flex-shrink-0"
                        >
                            <span className={clsx(
                                "text-base font-mono font-semibold tabular-nums",
                                currentBalance < 0 ? "text-error" : "text-on-surface"
                            )}>
                                {formatCurrency(currentBalance, account.currency)}
                            </span>
                        </div>
                    ) : (
                        <div className="w-36 flex-shrink-0">
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

                    {/* Delete Action */}
                    {onDelete && (
                        <button
                            onClick={() => {
                                if (window.confirm('Delete this wallet? Transactions will be preserved but unlinked.')) {
                                    onDelete(account.id);
                                }
                            }}
                            className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition-colors flex-shrink-0"
                        >
                            <Trash2 size={18} className="opacity-70" />
                        </button>
                    )}
                </div>
                {/* Type badge - on separate row */}
                <div className="flex items-center gap-2 ml-12">
                    <span className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider px-2 py-0.5 bg-surface-container-high rounded-full">
                        {account.type}
                    </span>
                </div>
            </div>
        </Reorder.Item>
    );
});

AccountItem.displayName = 'AccountItem';
