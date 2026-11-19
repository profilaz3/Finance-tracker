import React, { useEffect, useRef, useState } from 'react';
import { Account } from '../types';
import { useDragControls } from 'motion/react';
import { Reorder } from 'motion/react-m';
import { ChevronDown, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { IconPicker } from './IconPicker';
import { AccountGlyph } from './ui/AccountGlyph';
import { requestWalletEntry } from '../hooks/entryBus';
import { SETTINGS_STRINGS } from './settings/settingsStrings';
import { BalanceInput } from './BalanceInput';
import clsx from 'clsx';
import { formatCurrency } from '../utils/formatters';
import { calculateAdjustedInitialBalance } from '../utils/balanceMutations';
import { ConfirmDialog } from './ConfirmDialog';
import { TRANSLATIONS } from '../constants';

interface AccountItemProps {
    account: Account;
    canTransfer: boolean;
    onUpdate: (id: string, updates: Partial<Account>) => void;
    onDelete?: (id: string) => void;
    getAccountBalance: (account: Account) => number;
    language: 'en' | 'sr';
}

export const AccountItem: React.FC<AccountItemProps> = React.memo(({
    account,
    canTransfer,
    onUpdate,
    onDelete,
    getAccountBalance,
    language
}) => {
    const t = TRANSLATIONS[language];
    const s = SETTINGS_STRINGS[language];
    const [expanded, setExpanded] = useState(false);
    const dragControls = useDragControls();
    const [isEditingIcon, setIsEditingIcon] = useState(false);
    const [isEditingBalance, setIsEditingBalance] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    // The name is edited locally and saved on blur or Enter, so a blank name never reaches the server.
    const [nameDraft, setNameDraft] = useState(account.name);
    const [isEditingName, setIsEditingName] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);
    const cancelNameRef = useRef(false);

    useEffect(() => {
        if (!isEditingName) setNameDraft(account.name);
    }, [account.name, isEditingName]);

    // The icon picker closes on a tap outside it or Escape, not only on a pick.
    useEffect(() => {
        if (!isEditingIcon) return;
        const onPointerDown = (event: PointerEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setIsEditingIcon(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setIsEditingIcon(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [isEditingIcon]);

    const commitName = () => {
        setIsEditingName(false);
        const next = nameDraft.trim().replace(/\s+/g, ' ');
        if (cancelNameRef.current || !next) {
            cancelNameRef.current = false;
            setNameDraft(account.name);
            return;
        }
        setNameDraft(next);
        if (next !== account.name) onUpdate(account.id, { name: next });
    };

    // Calculate current balance (initial + transactions)
    const currentBalance = getAccountBalance(account);
    const tint = account.color || (account.type === 'cash' ? '#15803D' : account.type === 'bank' ? '#2563EB' : '#7C3AED');
    const typeLabel = account.type === 'cash' ? t.cash : account.type === 'bank' ? t.bank : t.other;
    const nameId = `wallet-name-${account.id}`;

    return (
        <Reorder.Item
            value={account}
            id={account.id}
            dragListener={false}
            dragControls={dragControls}
        >
            <div className="paper-tile group relative flex flex-col gap-2 py-3 pl-2 pr-2">
                <div className="flex items-center gap-2.5">
                {/* Drag handle */}
                <div
                    onPointerDown={(e) => dragControls.start(e)}
                    aria-hidden="true"
                    className="flex h-11 w-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg text-faint active:cursor-grabbing"
                >
                    <GripVertical size={18} />
                </div>

                {/* Icon and picker */}
                <div ref={pickerRef} className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsEditingIcon(!isEditingIcon)}
                        aria-label={t.chooseIcon}
                        title={t.chooseIcon}
                        aria-expanded={isEditingIcon}
                        className="flex rounded-[15px] transition-transform active:scale-95"
                    >
                        <AccountGlyph account={{ ...account, color: tint }} size={44} />
                    </button>
                    {isEditingIcon && (
                        <div className="glass-sheet absolute left-0 top-12 z-20 w-72 max-w-[calc(100vw-64px)] rounded-[22px] p-4">
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

                {/* Name (editable in place) and, under it, type and balance */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <label htmlFor={nameId} className="sr-only">{t.accountName}</label>
                    <span className="relative flex min-w-0 items-center">
                        <input
                            id={nameId}
                            value={nameDraft}
                            onFocus={() => setIsEditingName(true)}
                            onChange={e => setNameDraft(e.target.value)}
                            onBlur={commitName}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                }
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cancelNameRef.current = true;
                                    e.currentTarget.blur();
                                }
                            }}
                            maxLength={60}
                            enterKeyHint="done"
                            autoComplete="off"
                            placeholder={t.accountName}
                            className="peer h-9 w-full min-w-0 rounded-[10px] border-none bg-transparent py-0 pl-2 pr-8 text-[16px] font-semibold outline-none transition-colors hover:bg-chip/70 focus:bg-chip focus:ring-2 focus:ring-accent/40"
                        />
                        <Pencil
                            size={13}
                            aria-hidden="true"
                            className="pointer-events-none absolute right-2.5 text-faint transition-opacity peer-focus:opacity-0"
                        />
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            setExpanded(!expanded);
                            setIsEditingBalance(false);
                        }}
                        aria-expanded={expanded}
                        aria-label={`${s.walletActions}: ${account.name}, ${formatCurrency(currentBalance, account.currency)}`}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-chip"
                    >
                        <span className="min-w-0 flex-1 text-[12px] text-muted">{typeLabel} · {account.currency}</span>
                        <span className={clsx('text-[15px] font-semibold tabular-nums', currentBalance < 0 && 'text-neg')}>
                            {formatCurrency(currentBalance, account.currency)}
                        </span>
                        <ChevronDown size={16} aria-hidden="true" className={clsx('text-muted', expanded && 'rotate-180')} />
                    </button>
                </div>
                </div>
                {expanded && (
                    <div className="flex flex-wrap items-center gap-2 px-1">
                        <button type="button" onClick={() => requestWalletEntry({ accountId: account.id, kind: 'income' })}
                            className="min-h-11 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">{s.addIncome}</button>
                        {canTransfer && (
                            <button type="button" onClick={() => requestWalletEntry({ accountId: account.id, kind: 'transfer' })}
                                className="min-h-11 rounded-full bg-chip px-4 text-sm font-semibold">{s.transferHere}</button>
                        )}
                        <button type="button" aria-expanded={isEditingBalance} onClick={() => setIsEditingBalance(!isEditingBalance)}
                            className="min-h-11 rounded-full px-3 text-sm text-muted hover:bg-chip">{s.correctBalance}</button>
                        {onDelete && (
                            <button type="button" onClick={() => setIsConfirmingDelete(true)} aria-label={`${t.delete}: ${account.name}`}
                                className="ml-auto grid size-11 place-items-center rounded-full text-muted hover:bg-chip hover:text-neg">
                                <Trash2 size={17} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                )}
                {isEditingBalance && (
                    <div className="px-1">
                        <BalanceInput
                            currency={account.currency}
                            initialAmount={currentBalance}
                            label={t.currentBalance}
                            showBalancePreview
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
