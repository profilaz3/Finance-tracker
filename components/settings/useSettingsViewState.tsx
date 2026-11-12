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
    { id: 'profile', label: language === 'sr' ? 'Profil' : 'Profile', icon: User },
    { id: 'appearance', label: language === 'sr' ? 'Izgled' : 'Appearance', icon: Palette },
    { id: 'wallets', label: language === 'sr' ? 'Novcanici' : 'Wallets', icon: Wallet },
    { id: 'categories', label: language === 'sr' ? 'Kategorije' : 'Categories', icon: Tag },
    { id: 'recurring', label: language === 'sr' ? 'Ponavljanja' : 'Recurring', icon: RefreshCw },
    { id: 'people', label: language === 'sr' ? 'Osobe' : 'People', icon: Users },
  ]), [language]);

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
