import React, { useState } from 'react';
import { m, AnimatePresence, LazyMotion } from 'motion/react';
import { Reorder } from 'motion/react-m';
import { LogOut, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { AppState, Account, Currency } from '../../types';
import { TRANSLATIONS, CURRENCIES } from '../../constants';
import { Segmented } from '../ui/Segmented';
import { MyProfileSection } from '../MyProfileSection';
import { AccountItem } from '../AccountItem';
import { ConfirmDialog } from '../ConfirmDialog';
import { useAccountSettingsState } from './useAccountSettingsState';

// Reorder needs drag + layout (domMax); load those features only for this list.
const loadMotionMaxFeatures = () => import('../../utils/motionMaxFeatures').then(module => module.default);

interface AccountSettingsProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
    activeTab: 'profile' | 'wallets' | 'account';
    handleUpdateAccount: (id: string, updates: Partial<Account>) => void;
    handleAddAccount: (account: Account) => void;
    handleDeleteAccount: (id: string) => void;
    getAccountBalance: (account: Account) => number;
    onLogout?: () => void;
    onDeleteAccount?: () => void;
    onCreateUserProfile: () => void;
    onEditUserProfile: () => void;
}

export const AccountSettings: React.FC<AccountSettingsProps> = ({
    state,
    setState,
    activeTab,
    handleUpdateAccount,
    handleAddAccount,
    handleDeleteAccount,
    getAccountBalance,
    onLogout,
    onDeleteAccount,
    onCreateUserProfile,
    onEditUserProfile
}) => {
    const t = TRANSLATIONS[state.language];
    const [isConfirmingUserDelete, setIsConfirmingUserDelete] = useState(false);
    const {
        isAddingAccount,
        setIsAddingAccount,
        newAccountName,
        setNewAccountName,
        newAccountCurrency,
        setNewAccountCurrency,
        newAccountType,
        setNewAccountType,
        handleCreateAccount,
        resetAccountForm,
    } = useAccountSettingsState({ handleAddAccount });

    if (activeTab === 'profile') {
        return (
            <MyProfileSection
                userProfile={state.userProfile}
                onCreateProfile={onCreateUserProfile}
                onEditProfile={onEditUserProfile}
                language={state.language}
            />
        );
    }

    if (activeTab === 'account') {
        if (!onLogout && !onDeleteAccount) return null;
        return (
            <section className="flex flex-col gap-1.5">
                <h3 className="px-4 text-[12px] font-semibold uppercase tracking-wide text-faint">{t.accountSection}</h3>
                <div className="paper-tile overflow-hidden py-1">
                    {onLogout && (
                        <button
                            type="button"
                            onClick={onLogout}
                            className={clsx('flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium hover:bg-chip')}
                        >
                            <LogOut size={20} className="text-muted" aria-hidden="true" />
                            <span className={clsx('flex min-h-[52px] flex-1 items-center', onDeleteAccount && 'border-b border-hair')}>{t.logout}</span>
                        </button>
                    )}
                    {onDeleteAccount && (
                        <button
                            type="button"
                            onClick={() => setIsConfirmingUserDelete(true)}
                            className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium text-neg hover:bg-chip"
                        >
                            <Trash2 size={20} aria-hidden="true" />
                            {t.deleteUserAccount}
                        </button>
                    )}
                </div>
                {onDeleteAccount && (
                    <ConfirmDialog
                        isOpen={isConfirmingUserDelete}
                        type="danger"
                        title={t.deleteUserAccountTitle}
                        message={t.deleteUserAccountMessage}
                        confirmLabel={t.delete}
                        cancelLabel={t.cancel}
                        onCancel={() => setIsConfirmingUserDelete(false)}
                        onConfirm={() => {
                            setIsConfirmingUserDelete(false);
                            onDeleteAccount();
                        }}
                    />
                )}
            </section>
        );
    }

    if (activeTab === 'wallets') {
        return (
            <section className="flex flex-col gap-3" aria-label={t.wallets}>
                <div className="flex items-center justify-between gap-3 px-1">
                    <p className="min-w-0 text-[13px] text-muted">{t.reorderWalletsHint}</p>
                    <button
                        type="button"
                        onClick={() => setIsAddingAccount(true)}
                        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
                    >
                        <Plus size={17} aria-hidden="true" /> {t.addAccount}
                    </button>
                </div>

                <AnimatePresence>
                    {isAddingAccount && (
                        <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="paper-tile flex flex-col gap-3 p-4">
                                <input
                                    value={newAccountName}
                                    onChange={e => setNewAccountName(e.target.value)}
                                    placeholder={t.accountName}
                                    className="h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint"
                                    autoFocus
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                    <Segmented<Currency>
                                        size="sm"
                                        ariaLabel={t.currency}
                                        value={newAccountCurrency}
                                        onChange={setNewAccountCurrency}
                                        options={CURRENCIES.map(c => ({ value: c, label: c }))}
                                    />
                                    <Segmented<Account['type']>
                                        size="sm"
                                        ariaLabel={t.accountType}
                                        value={newAccountType}
                                        onChange={setNewAccountType}
                                        options={[
                                            { value: 'cash', label: t.cash },
                                            { value: 'bank', label: t.bank },
                                            { value: 'other', label: t.other },
                                        ]}
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={resetAccountForm} className="h-10 rounded-full px-4 text-[14px] font-semibold text-muted hover:bg-chip">{t.cancel}</button>
                                    <button type="button" onClick={handleCreateAccount} className="h-10 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent">{t.create}</button>
                                </div>
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>

                <LazyMotion features={loadMotionMaxFeatures}>
                <Reorder.Group
                    axis="y"
                    values={state.accounts}
                    onReorder={(newOrder) => {
                        const updatedAccounts = newOrder.map((acc, index) => ({
                            ...acc,
                            order: index
                        }));
                        // The view may show one workspace only; keep the other wallets.
                        const shownIds = new Set(updatedAccounts.map(acc => acc.id));
                        setState(prev => ({
                            ...prev,
                            accounts: [...updatedAccounts, ...prev.accounts.filter(acc => !shownIds.has(acc.id))],
                        }));
                    }}
                    className="flex flex-col gap-2"
                >
                    {state.accounts.map(acc => (
                        <AccountItem
                            key={acc.id}
                            account={acc}
                            onUpdate={handleUpdateAccount}
                            onDelete={handleDeleteAccount}
                            getAccountBalance={getAccountBalance}
                            language={state.language}
                        />
                    ))}
                </Reorder.Group>
                </LazyMotion>
            </section>
        );
    }

    return null;
};
