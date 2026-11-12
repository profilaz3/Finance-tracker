import React from 'react';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { Breadcrumb } from '../Breadcrumb';
import { SettingsViewProps, containerVariants } from './types';
import { GeneralSettings } from './GeneralSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { DataSettings } from './DataSettings';
import { AccountSettings } from './AccountSettings';
import { useSettingsViewState } from './useSettingsViewState';

export type { SettingsViewProps } from './types';

export const SettingsView: React.FC<SettingsViewProps> = ({
    state,
    setState,
    handleUpdateAccount,
    handleAddAccount,
    handleDeleteAccount,
    setIsAddPersonModalOpen,
    setSelectedPerson,
    handleOpenAddTransaction,
    getAccountBalance,
    onLogout,
    onDeleteAccount,
    onAddCategory,
    onUpdateCategory,
    onDeleteCategory,
    onCreateUserProfile,
    onEditUserProfile,
    onAddRecurring,
    onUpdateRecurring,
    onDeleteRecurring,
    onToggleRecurring,
    onProcessRecurring,
    onSettleUp
}) => {
    const { t, activeTab, setActiveTab, tabs, breadcrumbItems } = useSettingsViewState(state.language);

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="max-w-3xl mx-auto space-y-6 pb-20">
            <Breadcrumb items={breadcrumbItems} />

            <h2 className="text-2xl font-display font-medium text-on-surface">{t.settings}</h2>

            <div className="flex gap-1 p-1 bg-surface-container rounded-xl overflow-x-auto">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                                activeTab === tab.id
                                    ? "bg-primary text-on-primary shadow-sm"
                                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                            )}
                        >
                            <Icon size={16} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {activeTab === 'profile' && (
                <div className="space-y-8">
                    <AccountSettings
                        state={state}
                        setState={setState}
                        activeTab="profile"
                        handleUpdateAccount={handleUpdateAccount}
                        handleAddAccount={handleAddAccount}
                        handleDeleteAccount={handleDeleteAccount}
                        getAccountBalance={getAccountBalance}
                        onLogout={onLogout}
                        onDeleteAccount={onDeleteAccount}
                        onCreateUserProfile={onCreateUserProfile}
                        onEditUserProfile={onEditUserProfile}
                    />

                    <GeneralSettings
                        state={state}
                        setState={setState}
                    />

                    <AccountSettings
                        state={state}
                        setState={setState}
                        activeTab="account"
                        handleUpdateAccount={handleUpdateAccount}
                        handleAddAccount={handleAddAccount}
                        handleDeleteAccount={handleDeleteAccount}
                        getAccountBalance={getAccountBalance}
                        onLogout={onLogout}
                        onDeleteAccount={onDeleteAccount}
                        onCreateUserProfile={onCreateUserProfile}
                        onEditUserProfile={onEditUserProfile}
                    />
                </div>
            )}

            {activeTab === 'appearance' && (
                <AppearanceSettings
                    state={state}
                    setState={setState}
                />
            )}

            {activeTab === 'recurring' && (
                <DataSettings
                    state={state}
                    setState={setState}
                    activeTab="recurring"
                    setIsAddPersonModalOpen={setIsAddPersonModalOpen}
                    setSelectedPerson={setSelectedPerson}
                    handleOpenAddTransaction={handleOpenAddTransaction}
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                    onAddRecurring={onAddRecurring}
                    onUpdateRecurring={onUpdateRecurring}
                    onDeleteRecurring={onDeleteRecurring}
                    onToggleRecurring={onToggleRecurring}
                    onProcessRecurring={onProcessRecurring}
                    onSettleUp={onSettleUp}
                />
            )}

            {activeTab === 'people' && (
                <DataSettings
                    state={state}
                    setState={setState}
                    activeTab="people"
                    setIsAddPersonModalOpen={setIsAddPersonModalOpen}
                    setSelectedPerson={setSelectedPerson}
                    handleOpenAddTransaction={handleOpenAddTransaction}
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                    onAddRecurring={onAddRecurring}
                    onUpdateRecurring={onUpdateRecurring}
                    onDeleteRecurring={onDeleteRecurring}
                    onToggleRecurring={onToggleRecurring}
                    onProcessRecurring={onProcessRecurring}
                    onSettleUp={onSettleUp}
                />
            )}

            {activeTab === 'wallets' && (
                <AccountSettings
                    state={state}
                    setState={setState}
                    activeTab="wallets"
                    handleUpdateAccount={handleUpdateAccount}
                    handleAddAccount={handleAddAccount}
                    handleDeleteAccount={handleDeleteAccount}
                    getAccountBalance={getAccountBalance}
                    onLogout={onLogout}
                    onDeleteAccount={onDeleteAccount}
                    onCreateUserProfile={onCreateUserProfile}
                    onEditUserProfile={onEditUserProfile}
                />
            )}

            {activeTab === 'categories' && (
                <DataSettings
                    state={state}
                    setState={setState}
                    activeTab="categories"
                    setIsAddPersonModalOpen={setIsAddPersonModalOpen}
                    setSelectedPerson={setSelectedPerson}
                    handleOpenAddTransaction={handleOpenAddTransaction}
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                    onAddRecurring={onAddRecurring}
                    onUpdateRecurring={onUpdateRecurring}
                    onDeleteRecurring={onDeleteRecurring}
                    onToggleRecurring={onToggleRecurring}
                    onProcessRecurring={onProcessRecurring}
                    onSettleUp={onSettleUp}
                />
            )}
        </motion.div>
    );
};
