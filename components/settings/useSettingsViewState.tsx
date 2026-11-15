import { useEffect, useMemo, useState } from 'react';
import { Bell, Palette, QrCode, Repeat, Shapes, UserRound, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { AppState } from '../../types';
import { useBackLayer } from '../../hooks/useBackLayer';
import { clearPendingSettingsSection, peekPendingSettingsSection, subscribeSettingsSection } from './settingsSectionBus';

export type SettingsTabId = 'profile' | 'appearance' | 'notifications' | 'wallets' | 'categories' | 'people' | 'recurring' | 'payments' | 'team';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
  /** Solid tile color behind the white icon in the settings list. */
  tint: string;
  group: 'app' | 'money' | 'together';
}

/**
 * Settings navigation. `activeTab` is null on the phone list screen; on wide
 * screens the list and the open section sit side by side and null shows Profile.
 */
export function useSettingsViewState(language: AppState['language']) {
  const t = TRANSLATIONS[language];
  // Another screen may have asked for a section (Home's Wallets tile): start there.
  const [activeTab, setActiveTab] = useState<SettingsTabId | null>(peekPendingSettingsSection);
  useEffect(() => {
    clearPendingSettingsSection();
    return subscribeSettingsSection(setActiveTab);
  }, []);
  // An open section is a step in the back history: Back returns to the Settings list.
  useBackLayer('settings-section', activeTab !== null, () => setActiveTab(null));

  const tabs = useMemo<SettingsTab[]>(() => ([
    { id: 'profile', label: t.settingsTabProfile, icon: UserRound, tint: '#64748B', group: 'app' },
    { id: 'appearance', label: t.settingsTabAppearance, icon: Palette, tint: '#7C3AED', group: 'app' },
    { id: 'notifications', label: t.settingsTabNotifications, icon: Bell, tint: '#DC2626', group: 'app' },
    { id: 'wallets', label: t.wallets, icon: Wallet, tint: '#0F766E', group: 'money' },
    { id: 'categories', label: t.categories, icon: Shapes, tint: '#EA580C', group: 'money' },
    { id: 'recurring', label: t.settingsTabRecurring, icon: Repeat, tint: '#2563EB', group: 'money' },
    { id: 'people', label: t.people, icon: Users, tint: '#DB2777', group: 'money' },
    { id: 'payments', label: t.settingsTabPayments, icon: QrCode, tint: '#16A34A', group: 'money' },
    { id: 'team', label: t.settingsTabTeam, icon: UsersRound, tint: '#0891B2', group: 'together' },
  ]), [t]);

  const currentTab = tabs.find(tab => tab.id === (activeTab ?? 'profile')) ?? tabs[0];

  return {
    t,
    activeTab,
    setActiveTab,
    tabs,
    currentTab,
  };
}
