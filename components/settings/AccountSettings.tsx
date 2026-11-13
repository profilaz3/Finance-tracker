import React, { useState } from 'react';
import { m, AnimatePresence, LazyMotion } from 'motion/react';
import { Reorder } from 'motion/react-m';
import { User, Trash2, Plus } from 'lucide-react';
import { AppState, Account, Currency } from '../../types';
import { TRANSLATIONS, CURRENCIES } from '../../constants';
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
        return (
            <>
                {(onLogout || onDeleteAccount) && (
                    <section className="space-y-4">
                        <h3 className="text-lg font-medium text-on-surface">{t.accountSection}</h3>
                        <div className="space-y-2">
                            {onLogout && (
                                <button
                                    onClick={onLogout}
                                    className="w-full px-4 py-3 bg-surface-container text-on-surface rounded-xl font-medium transition-all hover:bg-surface-container-high flex items-center justify-center gap-2 border border-outline-variant/20"
                                >
                                    <User size={18} />
                                    {t.logout}
                                </button>
                            )}
                            {onDeleteAccount && (
                                <button
                                    type="button"
                                    onClick={() => setIsConfirmingUserDelete(true)}
                                    className="w-full px-4 py-3 bg-error text-on-error rounded-xl font-medium transition-all hover:bg-error/80 flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={18} />
                                    {t.deleteUserAccount}
                                </button>
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
                        </div>
                    </section>
                )}
            </>
        );
    }

    if (activeTab === 'wallets') {
        return (
            <div className="space-y-8">
                <section className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium text-on-surface">{t.wallets}</h3>
                        <button
                            onClick={() => setIsAddingAccount(true)}
                            className="text-sm font-medium text-primary hover:bg-primary-container/30 px-3 py-1 rounded-full transition-colors flex items-center gap-1"
                        >
                            <Plus size={16} /> {t.addAccount}
                        </button>
                    </div>

                    <div className="bg-surface-container-low p-4 md:p-6 rounded-xl shadow-elevation-1 space-y-4">
                        <AnimatePresence>
                            {isAddingAccount && (
                                <m.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden mb-4 border-b border-outline-variant/20 pb-4"
                                >
                                    <div className="space-y-3">
                                        <input
                                            value={newAccountName}
                                            onChange={e => setNewAccountName(e.target.value)}
                                            placeholder={t.accountName}
                                            className="w-full bg-surface-container border-none rounded-lg px-4 py-2 text-on-surface placeholder-on-surface-variant/60"
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <select
                                                value={newAccountCurrency}
                                                onChange={e => setNewAccountCurrency(e.target.value as Currency)}
                                                className="bg-surface-container border-none rounded-lg px-4 py-2 text-on-surface"
                                            >
                                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <select
                                                value={newAccountType}
                                                onChange={e => setNewAccountType(e.target.value as Account['type'])}
                                                className="bg-surface-container border-none rounded-lg px-4 py-2 text-on-surface flex-1"
                                            >
                                                <option value="cash">{t.cash}</option>
                                                <option value="bank">{t.bank}</option>
                                                <option value="other">{t.other}</option>
                                            </select>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button onClick={resetAccountForm} className="px-3 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-highest rounded-lg">{t.cancel}</button>
                                            <button onClick={handleCreateAccount} className="px-3 py-1.5 text-sm bg-primary text-on-primary rounded-lg">{t.create}</button>
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
                                setState(prev => ({ ...prev, accounts: updatedAccounts }));
                            }}
                            className="space-y-3"
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
                    </div>
                </section>
            </div>
        );
    }

    return null;
};
