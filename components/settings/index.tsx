import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { m } from 'motion/react';
import clsx from 'clsx';
import { ArrowLeft, CalendarClock, ChevronRight, Landmark, LayoutGrid, PiggyBank, Users, type LucideIcon } from 'lucide-react';
import { SettingsViewProps, containerVariants } from './types';
import { GeneralSettings } from './GeneralSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { DataSettings } from './DataSettings';
import { AccountSettings } from './AccountSettings';
import { TeamSettings } from './TeamSettings';
import { NotificationSettings } from './NotificationSettings';
import { PaymentSettings } from './PaymentSettings';
import { SettingsHero } from './SettingsHero';
import { useSettingsViewState } from './useSettingsViewState';
import type { SettingsGroupId, SettingsTab, SettingsTabId } from './useSettingsViewState';
import { resolveAppearance } from '../../utils/appearance';
import { convertCurrency } from '../../utils/currencyUtils';
import { getIntlLocale } from '../../utils/locale';
import { computeBudgetProgress, computeMonthSummary, monthKeyOf } from '../../domain/home';
import { resolveHomeHeader } from '../../domain/homeHeader';
import { resolveHomeLayout } from '../../domain/homeLayout';
import { detectSubscriptions } from '../../domain/subscriptions';
import { readDismissedSubscriptions } from '../../services/subscriptionStore';
import { useNotificationPrefs } from '../../hooks/useNotifications';
import { useSessionIdentity } from '../../hooks/useSessionIdentity';
import { openRates } from '../rates/ratesBus';
import { fill } from '../home/parts';
import { plainAmount } from '../stats/analyticsStrings';
import { IconTile } from '../ui/IconTile';
import { HeroIconButton, ScreenHero } from '../ui/ScreenHero';
import { playPageEnter } from '../../hooks/useSwipePager';

export type { SettingsViewProps } from './types';

const MODE_KEYS = { light: 'modeLight', dark: 'modeDark', system: 'modeSystem' } as const;
const NOTIFICATION_KEYS = ['bills', 'budget', 'events', 'letter', 'priceIncrease'] as const;
/** Sections that show the rows of the workspace on screen. */
const TEAM_SCOPED_TABS: SettingsTabId[] = ['wallets', 'categories', 'recurring', 'people'];

interface SettingsRow {
    id: string;
    label: string;
    icon: LucideIcon;
    tint: string;
    group: SettingsGroupId;
    value?: string;
    /** An accent pill instead of a plain value ("Not set"). */
    badge?: string;
    /** A second line under the label (the signed-in email), shortened when long. */
    subtitle?: string;
    keywords: string;
    tab?: SettingsTabId;
    onSelect?: () => void;
}

/** Lower case without diacritics, so "placanja" finds "plaćanja". */
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'dj');

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
        onLogoutEverywhere,
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
        netWorth,
        onBack,
        onOpenBudgets,
        onOpenSubscriptions,
        onCustomizeHome,
    } = props;
    const { language, baseCurrency } = state;
    const { t, s, activeTab, setActiveTab, tabs, currentTab } = useSettingsViewState(language);
    const locale = getIntlLocale(language);
    const tone = resolveHomeHeader(state.homeHeader).tone;
    const [query, setQuery] = useState('');
    const topRef = useRef<HTMLDivElement>(null);
    const shownTab: SettingsTabId = activeTab ?? 'profile';
    // Below lg the list and a section take turns, like on a phone.
    const isPhone = () => typeof window !== 'undefined' && !window.matchMedia?.('(min-width: 1024px)').matches;

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
        if (opened) playPageEnter(topRef.current, 1);
        if (closed) playPageEnter(topRef.current, -1);
    }, [activeTab]);

    const identity = useSessionIdentity();
    const notificationPrefs = useNotificationPrefs();
    const appearance = resolveAppearance(state.appearance);
    const activeRecurring = (state.recurringTransactions ?? []).filter(recurring => recurring.isActive).length;
    const summary = useMemo(
        () => computeMonthSummary(state, monthKeyOf(new Date())),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the summary reads only these
        [state.transactions, state.categories, state.baseCurrency, state.rates],
    );
    const budget = state.budget ?? null;
    const budgetLeft = budget && budget.monthly > 0 ? computeBudgetProgress(budget, summary, state.categories).left : null;
    const subscriptionCount = useMemo(() => {
        const dismissed = new Set(readDismissedSubscriptions());
        return detectSubscriptions(state.transactions, state.recurringTransactions ?? [])
            .filter(item => item.status === 'active' && !dismissed.has(item.id)).length;
    }, [state.transactions, state.recurringTransactions]);
    const eurRsd = convertCurrency(1, 'EUR', 'RSD', state.rates.rates);
    const rateText = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(eurRsd);
    const notificationsOn = NOTIFICATION_KEYS.filter(key => notificationPrefs[key]).length;
    const money = (amount: number) => `${plainAmount(amount, baseCurrency, locale)} ${baseCurrency}`;

    const tabRow = (tab: SettingsTab, value?: string, extra: Partial<SettingsRow> = {}): SettingsRow => ({
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
        tint: tab.tint,
        group: tab.group,
        value,
        keywords: s.kw[tab.id as keyof typeof s.kw] ?? '',
        tab: tab.id,
        ...extra,
    });
    const tabById = Object.fromEntries(tabs.map(tab => [tab.id, tab])) as Record<SettingsTabId, SettingsTab>;
    const allRows: SettingsRow[] = [
        tabRow(tabById.wallets, netWorth === undefined ? String(state.accounts.length) : `${state.accounts.length} · ${money(netWorth)}`),
        tabRow(tabById.categories, String(state.categories.length)),
        {
            id: 'budgets', label: t.budgets, icon: PiggyBank, tint: '#16A34A', group: 'money', keywords: s.kw.budgets, onSelect: onOpenBudgets,
            value: budgetLeft === null ? s.notSet : fill(budgetLeft >= 0 ? s.budgetLeft : s.budgetOver, { amount: plainAmount(Math.abs(budgetLeft), baseCurrency, locale) }),
        },
        tabRow(tabById.recurring, String(activeRecurring)),
        {
            id: 'subscriptions', label: t.subscriptions, icon: CalendarClock, tint: '#9333EA', group: 'money', keywords: s.kw.subscriptions,
            value: String(subscriptionCount), onSelect: onOpenSubscriptions,
        },
        tabRow(tabById.payments, state.paymentDetails ? `···${state.paymentDetails.account.slice(-6, -2)}` : undefined, state.paymentDetails ? {} : { badge: s.notSet }),
        {
            id: 'rates', label: s.exchangeRates, icon: Landmark, tint: '#CA8A04', group: 'money', keywords: s.kw.rates, onSelect: openRates,
            value: state.rates.provider === 'nbs' ? fill(s.ratesValue, { rate: rateText }) : `€1 = ${rateText}`,
        },
        tabRow(tabById.appearance, `${t[`theme_${appearance.theme ?? 'paper'}` as const]} · ${t[MODE_KEYS[appearance.mode]]}`),
        tabRow(tabById.notifications, notificationsOn > 0 ? fill(s.notificationsOn, { count: notificationsOn }) : s.notificationsOff),
        tabRow(tabById.general, `${language.toUpperCase()} · ${baseCurrency}`),
        {
            id: 'home', label: s.homeScreen, icon: LayoutGrid, tint: '#B45309', group: 'app', keywords: s.kw.home, onSelect: onCustomizeHome,
            value: fill(s.homeBlocks, { count: resolveHomeLayout(state.homeLayout).length }),
        },
        tabRow(tabById.people, String(state.people.length)),
        tabRow(tabById.team, state.teams?.length ? String(state.teams.length) : undefined),
        tabRow(tabById.profile, undefined, { subtitle: identity?.email ?? undefined }),
    ];
    const rows = allRows.filter(row => row.tab || row.onSelect);

    const groups: Array<{ id: SettingsGroupId; label: string }> = [
        { id: 'money', label: t.settingsGroupMoney },
        { id: 'app', label: t.settingsGroupApp },
        { id: 'together', label: t.settingsGroupTogether },
        { id: 'account', label: s.groupAccount },
    ];
    const needle = normalize(query.trim());
    const results = needle
        ? rows.filter(row => {
            const group = groups.find(entry => entry.id === row.group)?.label ?? '';
            return normalize([row.label, row.value ?? '', row.subtitle ?? '', row.badge ?? '', row.keywords, group].join(' ')).includes(needle);
        })
        : null;

    const accountProps = {
        state,
        setState,
        handleUpdateAccount,
        handleAddAccount,
        handleDeleteAccount,
        getAccountBalance,
        onLogout,
        onLogoutEverywhere,
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

    // Wallets, categories, recurring and people show the active workspace's rows; say which.
    const activeTeam = workspaceId ? state.teams?.find(team => team.id === workspaceId) : undefined;
    const teamScoped = activeTeam && TEAM_SCOPED_TABS.includes(shownTab);

    const rowButton = (row: SettingsRow, index: number, list: SettingsRow[]) => (
        <li key={row.id}>
            <button
                type="button"
                onClick={() => (row.tab ? setActiveTab(row.tab) : row.onSelect?.())}
                aria-current={row.tab && shownTab === row.tab ? 'page' : undefined}
                className={clsx(
                    'flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-chip',
                    row.tab && shownTab === row.tab && 'lg:bg-chip',
                )}
            >
                <IconTile icon={row.icon} color={row.tint} size={34} shape="circle" tone="solid" />
                <span className={clsx('flex min-h-[56px] min-w-0 flex-1 items-center gap-2 py-2', index < list.length - 1 && 'border-b border-hair')}>
                    {/* When the value does not fit beside the label it moves under it, right aligned. */}
                    <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
                        <span className="min-w-0 flex-[1_1_auto]">
                            <span className="block text-[16px] font-semibold leading-snug">{row.label}</span>
                            {row.subtitle && <span className="block truncate text-[13.5px] text-muted">{row.subtitle}</span>}
                        </span>
                        {row.badge && (
                            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-accent">{row.badge}</span>
                        )}
                        {row.value && <span className="shrink-0 whitespace-nowrap text-[14.5px] tabular-nums text-muted">{row.value}</span>}
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden="true" />
                </span>
            </button>
        </li>
    );

    const group = (id: string, label: string, list: SettingsRow[]) => (
        <section key={id} className="flex flex-col gap-1.5" aria-labelledby={`settings-group-${id}`}>
            <h2 id={`settings-group-${id}`} className="px-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</h2>
            <ul className="paper-tile overflow-hidden py-0.5">{list.map(rowButton)}</ul>
        </section>
    );

    return (
        <m.div
            ref={topRef}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            data-swipe-back-page={activeTab ? '' : undefined}
            className="mx-auto max-w-[920px] scroll-mt-4 pb-28 md:pb-10"
        >
            <div className={clsx(activeTab && 'hidden lg:block')}>
                <SettingsHero
                    tone={tone}
                    title={t.settings}
                    backLabel={t.back}
                    onBack={onBack ?? (() => window.history.back())}
                    profile={state.userProfile}
                    onEditProfile={state.userProfile ? onEditUserProfile : onCreateUserProfile}
                    onOpenPayments={() => setActiveTab('payments')}
                    teams={state.teams ?? []}
                    workspaceId={workspaceId ?? null}
                    onWorkspaceChange={onWorkspaceChange}
                    onNewTeam={() => setActiveTab('team')}
                    query={query}
                    onQuery={setQuery}
                    s={s}
                />
            </div>

            {/* Phone: an open section has its own small header with Back. */}
            {activeTab && (
                <ScreenHero tone={tone} label={currentTab.label} className="lg:hidden">
                    <div className="flex h-[60px] items-center gap-2 px-3">
                        <HeroIconButton icon={ArrowLeft} label={t.back} onClick={() => setActiveTab(null)} data-swipe-back />
                        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold tracking-[-0.01em]">{currentTab.label}</h1>
                        <span className="w-11 shrink-0" aria-hidden="true" />
                    </div>
                    <div className="px-4 pb-[42px] md:pb-4">
                        {teamScoped && (
                            <p className="flex min-w-0 items-center justify-center gap-1.5 text-[13px] text-white/75">
                                <Users size={13} aria-hidden="true" className="flex-none" />
                                <span className="truncate">{fill(t.settingsTeamWorkspace, { team: activeTeam.name })}</span>
                            </p>
                        )}
                    </div>
                </ScreenHero>
            )}

            <div className="screen-sheet lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-6">
                <nav aria-label={t.settings} className={clsx('flex-col gap-5 lg:sticky lg:top-4', activeTab ? 'hidden lg:flex' : 'flex')}>
                    {results ? (
                        results.length > 0
                            ? group('results', s.results, results)
                            : (
                                <p className="paper-tile px-4 py-5 text-center text-[15px] text-muted" role="status">
                                    {fill(s.noResults, { query: query.trim() })}
                                </p>
                            )
                    ) : (
                        groups.map(entry => {
                            const list = rows.filter(row => row.group === entry.id);
                            return list.length > 0 ? group(entry.id, entry.label, list) : null;
                        })
                    )}
                </nav>

                <section
                    aria-labelledby="settings-section-title"
                    className={clsx('min-w-0 flex-col gap-4', activeTab ? 'flex' : 'hidden lg:flex')}
                >
                    <div className="hidden min-h-[52px] items-center gap-3 lg:flex">
                        <IconTile icon={currentTab.icon} color={currentTab.tint} size={36} shape="circle" tone="solid" />
                        <div className="min-w-0 flex-1">
                            <h2 id="settings-section-title" className="truncate text-[24px] font-bold tracking-[-0.4px]">
                                {currentTab.label}
                            </h2>
                            {teamScoped && (
                                <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                                    <Users size={13} aria-hidden="true" className="flex-none" />
                                    <span className="truncate">{fill(t.settingsTeamWorkspace, { team: activeTeam.name })}</span>
                                </p>
                            )}
                        </div>
                    </div>

                    {shownTab === 'profile' && (
                        <div className="flex flex-col gap-4">
                            <AccountSettings {...accountProps} activeTab="profile" />
                            <AccountSettings {...accountProps} activeTab="account" />
                        </div>
                    )}
                    {shownTab === 'general' && (
                        <div className="flex flex-col gap-4">
                            <GeneralSettings state={state} setState={setState} />
                        </div>
                    )}
                    {shownTab === 'appearance' && (
                        <div className="paper-tile p-4">
                            <AppearanceSettings state={state} setState={setState} hideLanguage />
                        </div>
                    )}
                    {shownTab === 'notifications' && <NotificationSettings language={language} />}
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
