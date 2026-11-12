import React from 'react';
import clsx from 'clsx';
import { View } from '../../types';
import { SyncIndicator } from '../SyncStatus';
import {
  CalendarIcon,
  IconComponent,
  LayoutDashboardIcon,
  ListIcon,
  MapPinIcon,
  PieChartIcon,
  SettingsIcon,
  SparklesIcon,
} from '../icons/UiIcons';

interface NavigationLabels {
  dashboard: string;
  transactions: string;
  events: string;
  calendar: string;
  analytics: string;
  insights: string;
  settings: string;
}

interface AppNavigationProps {
  currentView: View;
  onNavigate: (view: View) => void;
  labels: NavigationLabels;
}

interface NavItemProps {
  view: View;
  icon: IconComponent;
  label: string;
  currentView: View;
  onNavigate: (view: View) => void;
}

const NavItem: React.FC<NavItemProps> = ({ view, icon: Icon, label, currentView, onNavigate }) => (
  <button
    onClick={() => onNavigate(view)}
    className={clsx(
      'w-full flex items-center justify-center lg:justify-start gap-4 px-3 lg:px-6 py-4 rounded-full transition-all duration-300 font-medium text-sm mb-1',
      currentView === view
        ? 'bg-secondary-container text-on-secondary-container shadow-none font-bold'
        : 'text-on-surface-variant hover:bg-surface-container-highest'
    )}
    aria-label={label}
    title={label}
  >
    <Icon size={24} className={currentView === view ? 'fill-current' : ''} />
    <span className="hidden lg:inline">{label}</span>
  </button>
);

const BottomNavItem: React.FC<NavItemProps> = ({ view, icon: Icon, label, currentView, onNavigate }) => {
  const isActive = currentView === view;

  return (
    <button
      onClick={() => onNavigate(view)}
      className="flex flex-col items-center justify-center min-w-[48px] min-h-[48px] relative"
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      title={label}
    >
      <div className={clsx('transition-transform duration-200 ease-out', isActive ? 'scale-[1.15]' : 'scale-100')}>
        <Icon
          size={22}
          className={clsx(
            'transition-colors duration-200',
            isActive ? 'text-primary fill-current' : 'text-on-surface-variant'
          )}
        />
      </div>
      <div
        className={clsx(
          'absolute -top-1 w-8 h-1 rounded-full bg-primary transition-all duration-200 ease-out',
          isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        )}
        aria-hidden="true"
      />
    </button>
  );
};

export const AppNavigation: React.FC<AppNavigationProps> = ({ currentView, onNavigate, labels }) => (
  <>
    <aside className="hidden md:flex md:w-[80px] lg:w-[280px] flex-col bg-surface-container-low h-full p-4 m-0 border-r border-outline-variant/20 z-20 transition-all duration-300">
      <div className="flex items-center justify-center gap-3 mb-8 px-2 lg:px-6 py-4">
        <div className="bg-primary text-on-primary p-3 rounded-2xl shadow-lg">
          <LayoutDashboardIcon size={28} />
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        <NavItem view="dashboard" icon={LayoutDashboardIcon} label={labels.dashboard} currentView={currentView} onNavigate={onNavigate} />
        <NavItem view="transactions" icon={ListIcon} label={labels.transactions} currentView={currentView} onNavigate={onNavigate} />
        <NavItem view="events" icon={MapPinIcon} label={labels.events} currentView={currentView} onNavigate={onNavigate} />
        <NavItem view="calendar" icon={CalendarIcon} label={labels.calendar} currentView={currentView} onNavigate={onNavigate} />
        <NavItem view="analytics" icon={PieChartIcon} label={labels.analytics} currentView={currentView} onNavigate={onNavigate} />
        <NavItem view="insights" icon={SparklesIcon} label={labels.insights} currentView={currentView} onNavigate={onNavigate} />
        <NavItem view="settings" icon={SettingsIcon} label={labels.settings} currentView={currentView} onNavigate={onNavigate} />
      </nav>
    </aside>

    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <nav className="bg-surface-container-high/95 backdrop-blur-2xl rounded-t-3xl border-t border-outline-variant/20 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] pb-[calc(env(safe-area-inset-bottom,20px)+12px)]">
        <div className="flex items-center justify-evenly h-16 relative">
          <BottomNavItem view="dashboard" icon={LayoutDashboardIcon} label={labels.dashboard} currentView={currentView} onNavigate={onNavigate} />
          <BottomNavItem view="transactions" icon={ListIcon} label={labels.transactions} currentView={currentView} onNavigate={onNavigate} />
          <BottomNavItem view="events" icon={MapPinIcon} label={labels.events} currentView={currentView} onNavigate={onNavigate} />
          <BottomNavItem view="calendar" icon={CalendarIcon} label={labels.calendar} currentView={currentView} onNavigate={onNavigate} />
          <BottomNavItem view="analytics" icon={PieChartIcon} label={labels.analytics} currentView={currentView} onNavigate={onNavigate} />
          <BottomNavItem view="insights" icon={SparklesIcon} label={labels.insights} currentView={currentView} onNavigate={onNavigate} />
          <BottomNavItem view="settings" icon={SettingsIcon} label={labels.settings} currentView={currentView} onNavigate={onNavigate} />
          <SyncIndicator className="absolute top-1 right-2" />
        </div>
      </nav>
    </div>
  </>
);
