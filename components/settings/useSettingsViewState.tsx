import { useMemo, useState } from 'react';
import { Palette, RefreshCw, Settings, Tag, User, Users, Wallet, type LucideIcon } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { AppState } from '../../types';
import type { BreadcrumbItem } from '../Breadcrumb';

export type SettingsTabId = 'profile' | 'appearance' | 'wallets' | 'categories' | 'people' | 'recurring';

interface SettingsTab {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
}

export function useSettingsViewState(language: AppState['language']) {
  const t = TRANSLATIONS[language];
  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');

  const tabs = useMemo<SettingsTab[]>(() => ([
    { id: 'profile', label: t.settingsTabProfile, icon: User },
    { id: 'appearance', label: t.settingsTabAppearance, icon: Palette },
    { id: 'wallets', label: t.wallets, icon: Wallet },
    { id: 'categories', label: t.categories, icon: Tag },
    { id: 'recurring', label: t.settingsTabRecurring, icon: RefreshCw },
    { id: 'people', label: t.people, icon: Users },
  ]), [t]);

  const currentTab = tabs.find(tab => tab.id === activeTab);

  const breadcrumbItems = useMemo<BreadcrumbItem[]>(() => [
    { label: t.settings, icon: <Settings size={14} /> },
    ...(currentTab ? [{ label: currentTab.label, icon: <currentTab.icon size={14} /> }] : []),
  ], [currentTab, t.settings]);

  return {
    t,
    activeTab,
    setActiveTab,
    tabs,
    breadcrumbItems,
  };
}
