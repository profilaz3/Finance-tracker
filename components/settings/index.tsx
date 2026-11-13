import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { m } from 'motion/react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SettingsViewProps, containerVariants } from './types';
import { GeneralSettings } from './GeneralSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { DataSettings } from './DataSettings';
import { AccountSettings } from './AccountSettings';
import { TeamSettings } from './TeamSettings';
import { NotificationSettings } from './NotificationSettings';
import { PaymentSettings } from './PaymentSettings';
import { useSettingsViewState } from './useSettingsViewState';
import type { SettingsTab, SettingsTabId } from './useSettingsViewState';
import { resolveAppearance } from '../../utils/appearance';
import { Avatar } from '../home/parts';
import { playPageEnter } from '../../hooks/useSwipePager';

export type { SettingsViewProps } from './types';

const MODE_KEYS = { light: 'modeLight', dark: 'modeDark', system: 'modeSystem' } as const;

/** Solid rounded tile with a white icon, like a system settings list. */
const TabGlyph: React.FC<{ tab: SettingsTab; size?: number }> = ({ tab, size = 32 }) => {
    const Icon = tab.icon;
    return (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-[10px] text-white"
            style={{ width: size, height: size, background: tab.tint }}
        >
            <Icon size={Math.round(size * 0.56)} strokeWidth={2.2} />
        </span>
    );
};

export const SettingsView: React.FC<SettingsViewProps> = (props) => {
    const {
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
        onSettleUp,
        onToast,
        workspaceId,
        onWorkspaceChange,
    } = props;
    const { t, activeTab, setActiveTab, tabs, currentTab } = useSettingsViewState(state.language);
    const topRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLElement>(null);
    const sectionRef = useRef<HTMLElement>(null);
    const shownTab: SettingsTabId = activeTab ?? 'profile';
    const isPhone = () => typeof window !== 'undefined' && !window.matchMedia?.('(min-width: 768px)').matches;

    useEffect(() => {
        if (activeTab) topRef.current?.scrollIntoView({ block: 'start' });
    }, [activeTab]);

    // Phone: a section pushes in from the right, and the list slides back from the left.
    const previousTab = useRef(activeTab);
    useLayoutEffect(() => {
        const opened = !previousTab.current && !!activeTab;
        const closed = !!previousTab.current && !activeTab;
        previousTab.current = activeTab;
        if (!isPhone()) return;
        if (opened) playPageEnter(sectionRef.current, 1);
        if (closed) playPageEnter(navRef.current, -1);
    }, [activeTab]);


    const appearance = resolveAppearance(state.appearance);
    const activeRecurring = (state.recurringTransactions ?? []).filter(recurring => recurring.isActive).length;
    const hints: Partial<Record<SettingsTabId, string>> = {
        appearance: t[MODE_KEYS[appearance.mode]],
        wallets: String(state.accounts.length),
        categories: String(state.categories.length),
        recurring: String(activeRecurring),
        people: String(state.people.length),
        team: state.teams?.length ? String(state.teams.length) : undefined,
        payments: state.paymentDetails ? `···${state.paymentDetails.account.slice(-6, -2)}` : t.payNotSet,
    };

    const accountProps = {
        state,
        setState,
        handleUpdateAccount,
        handleAddAccount,
        handleDeleteAccount,
        getAccountBalance,
        onLogout,
        onDeleteAccount,
        onCreateUserProfile,
        onEditUserProfile,
    };
    const dataProps = {
        state,
        setState,
        setIsAddPersonModalOpen,
        setSelectedPerson,
        handleOpenAddTransaction,
        onAddCategory,
        onUpdateCategory,
        onDeleteCategory,
        onAddRecurring,
        onUpdateRecurring,
        onDeleteRecurring,
        onToggleRecurring,
        onProcessRecurring,
        onSettleUp,
        onToast,
    };

    const groups: Array<{ id: SettingsTab['group']; label: string }> = [
        { id: 'app', label: t.settingsGroupApp },
        { id: 'money', label: t.settingsGroupMoney },
        { id: 'together', label: t.settingsGroupTogether },
    ];
    const profile = state.userProfile;

    return (
        <m.div
            ref={topRef}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mx-auto max-w-[1040px] scroll-mt-4 px-1 pb-10"
        >
            <header className={clsx('mb-4 min-h-[60px] flex-col justify-center', activeTab ? 'hidden md:flex' : 'flex')}>
                <h1 className="text-[28px] font-bold leading-tight tracking-[-0.6px]">{t.settings}</h1>
                <p className="truncate text-[13px] text-muted">{t.settingsSubtitle}</p>
            </header>

            <div className="md:grid md:grid-cols-[300px_minmax(0,1fr)] md:items-start md:gap-6">
                <nav ref={navRef} aria-label={t.settings} className={clsx('flex-col gap-5 md:sticky md:top-4', activeTab ? 'hidden md:flex' : 'flex')}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('profile')}
                        aria-current={shownTab === 'profile' ? 'page' : undefined}
                        className={clsx(
                            'paper-tile flex items-center gap-3.5 p-4 text-left transition-shadow',
                            shownTab === 'profile' && 'md:ring-2 md:ring-accent',
                        )}
                    >
                        {profile ? (
                            <Avatar name={profile.name} color={profile.color} image={/^(data:|http)/.test(profile.avatar ?? '') ? profile.avatar : undefined} size={52} />
                        ) : (
                            <TabGlyph tab={tabs[0]} size={52} />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[17px] font-bold">{profile?.name ?? t.settingsSetUpProfile}</span>
                            <span className="truncate text-[13px] text-muted">{t.settingsProfileHint}</span>
                        </span>
                        <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden="true" />
                    </button>

                    {groups.map(group => (
                        <section key={group.id} className="flex flex-col gap-1.5">
                            <h2 className="px-4 text-[12px] font-semibold uppercase tracking-wide text-faint">{group.label}</h2>
                            <ul className="paper-tile overflow-hidden py-1">
                                {tabs.filter(tab => tab.group === group.id && tab.id !== 'profile').map((tab, index, list) => (
                                    <li key={tab.id}>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab(tab.id)}
                                            aria-current={shownTab === tab.id ? 'page' : undefined}
                                            className={clsx(
                                                'flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-chip',
                                                shownTab === tab.id && 'md:bg-chip',
                                            )}
                                        >
                                            <TabGlyph tab={tab} />
                                            <span
                                                className={clsx(
                                                    'flex min-h-[52px] min-w-0 flex-1 items-center gap-2',
                                                    index < list.length - 1 && 'border-b border-hair',
                                                )}
                                            >
                                                <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{tab.label}</span>
                                                {hints[tab.id] && <span className="shrink-0 text-[14px] text-muted">{hints[tab.id]}</span>}
                                                <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden="true" />
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </nav>

                <section
                    ref={sectionRef}
                    aria-labelledby="settings-section-title"
                    data-swipe-back-page
                    className={clsx('min-w-0 flex-col gap-4', activeTab ? 'flex' : 'hidden md:flex')}
                >
                    <div className="flex min-h-[52px] items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setActiveTab(null)}
                            data-swipe-back
                            aria-label={t.back}
                            title={t.back}
                            className="glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full md:hidden"
                        >
                            <ChevronLeft size={22} aria-hidden="true" />
                        </button>
                        <TabGlyph tab={currentTab} size={36} />
                        <h2 id="settings-section-title" className="min-w-0 flex-1 truncate text-[24px] font-bold tracking-[-0.4px]">
                            {currentTab.label}
                        </h2>
                    </div>

                    {shownTab === 'profile' && (
                        <div className="flex flex-col gap-4">
                            <AccountSettings {...accountProps} activeTab="profile" />
                            <GeneralSettings state={state} setState={setState} />
                            <AccountSettings {...accountProps} activeTab="account" />
                        </div>
                    )}
                    {shownTab === 'appearance' && (
                        <div className="paper-tile p-4">
                            <AppearanceSettings state={state} setState={setState} />
                        </div>
                    )}
                    {shownTab === 'notifications' && <NotificationSettings language={state.language} />}
                    {shownTab === 'wallets' && <AccountSettings {...accountProps} activeTab="wallets" />}
                    {shownTab === 'categories' && <DataSettings {...dataProps} activeTab="categories" />}
                    {shownTab === 'recurring' && <DataSettings {...dataProps} activeTab="recurring" />}
                    {shownTab === 'people' && <DataSettings {...dataProps} activeTab="people" />}
                    {shownTab === 'payments' && <PaymentSettings state={state} setState={setState} onToast={onToast} />}
                    {shownTab === 'team' && (
                        <TeamSettings
                            state={state}
                            setState={setState}
                            workspaceId={workspaceId ?? null}
                            onWorkspaceChange={onWorkspaceChange}
                        />
                    )}
                </section>
            </div>
        </m.div>
    );
};
