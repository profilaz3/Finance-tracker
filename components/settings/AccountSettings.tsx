import React, { useState } from 'react';
import { m, AnimatePresence, LazyMotion } from 'motion/react';
import { Reorder } from 'motion/react-m';
import { LogOut, MonitorSmartphone, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { AppState, Account, Currency } from '../../types';
import { TRANSLATIONS, CURRENCIES } from '../../constants';
import { Segmented } from '../ui/Segmented';
import { IconTile } from '../ui/IconTile';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { MyProfileSection } from '../MyProfileSection';
import { AccountItem } from '../AccountItem';
import { EmptyState } from '../EmptyState';
import { ConfirmDialog } from '../ConfirmDialog';
import { useAccountSettingsState } from './useAccountSettingsState';
import { AmountInput } from '../ui/AmountInput';
import { parseAmountInput } from '../../utils/numberInput';

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
    /** Signs out of every device; offered under the normal sign-out. */
    onLogoutEverywhere?: () => void;
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
    onLogoutEverywhere,
    onDeleteAccount,
    onCreateUserProfile,
    onEditUserProfile
}) => {
    const t = TRANSLATIONS[state.language];
    const [isConfirmingUserDelete, setIsConfirmingUserDelete] = useState(false);
    const [isConfirmingSignOutEverywhere, setIsConfirmingSignOutEverywhere] = useState(false);
    const {
        isAddingAccount,
        setIsAddingAccount,
        newAccountName,
        setNewAccountName,
        newAccountCurrency,
        setNewAccountCurrency,
        newAccountType,
        setNewAccountType,
        newAccountBalance,
        setNewAccountBalance,
        nameError,
        balanceError,
        handleCreateAccount,
        resetAccountForm,
    } = useAccountSettingsState({ handleAddAccount, language: state.language, accounts: state.accounts });

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
                            <IconTile icon={LogOut} color="#64748B" size={32} tone="solid" />
                            <span className={clsx('flex min-h-[52px] flex-1 items-center', (onLogoutEverywhere || onDeleteAccount) && 'border-b border-hair')}>{t.logout}</span>
                        </button>
                    )}
                    {onLogoutEverywhere && (
                        <button
                            type="button"
                            onClick={() => setIsConfirmingSignOutEverywhere(true)}
                            className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium hover:bg-chip"
                        >
                            <IconTile icon={MonitorSmartphone} color="#64748B" size={32} tone="solid" />
                            <span className={clsx('flex min-h-[52px] flex-1 flex-col justify-center py-2', onDeleteAccount && 'border-b border-hair')}>
                                {t.logoutEverywhere}
                                <span className="text-[13px] font-normal text-muted">{t.logoutEverywhereHint}</span>
                            </span>
                        </button>
                    )}
                    {onDeleteAccount && (
                        <button
                            type="button"
                            onClick={() => setIsConfirmingUserDelete(true)}
                            className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium text-neg hover:bg-chip"
                        >
                            <IconTile icon={Trash2} color="#DC2626" size={32} tone="solid" />
                            {t.deleteUserAccount}
                        </button>
                    )}
                </div>
                {onLogoutEverywhere && (
                    <ConfirmDialog
                        isOpen={isConfirmingSignOutEverywhere}
                        type="warning"
                        title={t.logoutEverywhereTitle}
                        message={t.logoutEverywhereMessage}
                        confirmLabel={t.logoutEverywhereConfirm}
                        cancelLabel={t.cancel}
                        onCancel={() => setIsConfirmingSignOutEverywhere(false)}
                        onConfirm={() => {
                            setIsConfirmingSignOutEverywhere(false);
                            onLogoutEverywhere();
                        }}
                    />
                )}
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
        // A new workspace (a team with no wallets yet) gets an explanation instead of a blank page.
        const hasWallets = state.accounts.length > 0;
        return (
            <section className="flex flex-col gap-3" aria-label={t.wallets}>
                {hasWallets ? (
                    <div className="flex items-center justify-between gap-3 px-1">
                        <p className="min-w-0 text-[13px] text-muted">{t.reorderWalletsHint}</p>
                        <button
                            type="button"
                            onClick={() => setIsAddingAccount(true)}
                            aria-expanded={isAddingAccount}
                            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
                        >
                            <Plus size={17} aria-hidden="true" /> {t.addAccount}
                        </button>
                    </div>
                ) : !isAddingAccount && (
                    <EmptyState
                        illustration="wallet"
                        title={t.noWalletsYet}
                        description={t.noWalletsDescription}
                        action={{ label: t.addAccount, onClick: () => setIsAddingAccount(true) }}
                    />
                )}

                <AnimatePresence>
                    {isAddingAccount && (
                        <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <form
                                className="paper-tile flex flex-col gap-3 p-4"
                                noValidate
                                onSubmit={event => {
                                    event.preventDefault();
                                    handleCreateAccount();
                                }}
                            >
                                <input
                                    value={newAccountName}
                                    onChange={e => setNewAccountName(e.target.value)}
                                    placeholder={t.accountName}
                                    aria-label={t.accountName}
                                    aria-invalid={nameError}
                                    enterKeyHint="next"
                                    className={clsx(
                                        'h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint',
                                        nameError && 'ring-2 ring-neg'
                                    )}
                                    autoFocus
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                    <Segmented<Currency>
                                        size="sm"
                                        ariaLabel={t.currency}
                                        value={newAccountCurrency}
                                        onChange={setNewAccountCurrency}
                                        options={CURRENCIES.map(c => ({
                                            value: c,
                                            label: (
                                                <span className="flex items-center gap-1.5">
                                                    <CurrencyFlag currency={c} size={16} />
                                                    {c}
                                                </span>
                                            ),
                                        }))}
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
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="new-wallet-balance" className="px-1 text-[12px] font-semibold text-muted">{t.startingBalance}</label>
                                    <div className={clsx(
                                        'flex h-12 items-center gap-2 rounded-[14px] bg-chip px-4 focus-within:ring-2 focus-within:ring-accent/40',
                                        balanceError && 'ring-2 ring-neg'
                                    )}>
                                        <AmountInput
                                            id="new-wallet-balance"
                                            enterKeyHint="done"
                                            value={parseAmountInput(newAccountBalance, state.language)}
                                            onValueChange={(_, text) => setNewAccountBalance(text)}
                                            language={state.language}
                                            emptyWhenZero
                                            placeholder="0"
                                            aria-invalid={balanceError}
                                            aria-describedby={balanceError ? 'new-wallet-balance-error' : undefined}
                                            className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold tabular-nums text-on-surface placeholder:text-faint focus:outline-none"
                                        />
                                        <span className="text-[13px] font-semibold text-muted">{newAccountCurrency}</span>
                                    </div>
                                    {balanceError && (
                                        <p id="new-wallet-balance-error" role="alert" className="px-1 text-[12px] font-medium text-neg">{t.splitErrorInvalidAmount}</p>
                                    )}
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={resetAccountForm} className="h-11 rounded-full px-4 text-[14px] font-semibold text-muted hover:bg-chip">{t.cancel}</button>
                                    <button type="submit" className="h-11 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent">{t.create}</button>
                                </div>
                            </form>
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
                            canTransfer={state.accounts.length > 1}
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
