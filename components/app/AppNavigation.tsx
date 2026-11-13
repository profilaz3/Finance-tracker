import React from 'react';
import clsx from 'clsx';
import { Plus, PiggyBank, Settings } from 'lucide-react';
import { View } from '../../types';
import { SyncIndicator, SyncStatus } from '../SyncStatus';
import { lgStyle } from '../ui/LiquidGlassDefs';
import { usePillTrack } from '../../hooks/usePillTrack';

export type NavTab = 'home' | 'activity' | 'events' | 'insights';

/** Which tab a view belongs to. Settings and Budgets sit outside the tabs. */
export const TAB_VIEWS: Record<NavTab, View[]> = {
  home: ['dashboard'],
  activity: ['transactions', 'calendar'],
  events: ['events', 'people'],
  insights: ['analytics', 'insights'],
};

export const NAV_TABS: NavTab[] = ['home', 'activity', 'events', 'insights'];

export const tabForView = (view: View): NavTab | null =>
  NAV_TABS.find(tab => TAB_VIEWS[tab].includes(view)) ?? null;

interface NavigationLabels {
  home: string;
  activity: string;
  events: string;
  insights: string;
  add: string;
  budgets: string;
  settings: string;
}

interface AppNavigationProps {
  currentView: View;
  onNavigate: (view: View) => void;
  onAdd: () => void;
  labels: NavigationLabels;
}

interface TabButtonProps {
  tab: NavTab;
  label: string;
  currentView: View;
  onNavigate: (view: View) => void;
  className: string;
  activeClassName: string;
  pillItem?: boolean;
}

const TabButton: React.FC<TabButtonProps> = ({ tab, label, currentView, onNavigate, className, activeClassName, pillItem }) => {
  const isActive = tabForView(currentView) === tab;
  return (
    <button
      type="button"
      onClick={() => onNavigate(isActive ? currentView : TAB_VIEWS[tab][0])}
      aria-current={isActive ? 'page' : undefined}
      data-pill-item={pillItem ? '' : undefined}
      className={clsx(className, isActive ? activeClassName : 'text-muted')}
    >
      {label}
    </button>
  );
};

/** Mobile glass tab bar. The active pill glides between tabs and can be dragged across them. */
const TabBar: React.FC<Pick<AppNavigationProps, 'currentView' | 'onNavigate' | 'labels'>> = ({ currentView, onNavigate, labels }) => {
  const activeTab = tabForView(currentView);
  const { trackRef, pillRef, trackProps } = usePillTrack(activeTab ? NAV_TABS.indexOf(activeTab) : -1, index => {
    const tab = NAV_TABS[index];
    if (tab) onNavigate(TAB_VIEWS[tab][0]);
  });
  return (
    <nav
      ref={trackRef}
      aria-label={labels.home}
      style={{ ...lgStyle('lg-nav'), ['--pill-hot' as string]: 'rgb(var(--accent-rgb))' }}
      className="glass pill-track pointer-events-auto relative flex h-[62px] w-[286px] touch-pan-y select-none items-center gap-0.5 rounded-full p-[5px]"
      {...trackProps}
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[5px] left-0 top-[5px] rounded-full bg-chip opacity-0"
      />
      {NAV_TABS.map(tab => (
        <TabButton
          key={tab}
          tab={tab}
          label={labels[tab]}
          currentView={currentView}
          onNavigate={onNavigate}
          pillItem
          className="pill-item relative z-[1] h-full min-w-0 flex-1 truncate rounded-full px-1 text-[13px] font-semibold transition-colors duration-200"
          activeClassName="text-accent"
        />
      ))}
      <SyncIndicator className="absolute -top-1 right-3 z-[2]" />
    </nav>
  );
};

export const AppNavigation: React.FC<AppNavigationProps> = ({ currentView, onNavigate, onAdd, labels }) => (
  <>
    <aside className="z-20 hidden h-full flex-col gap-1 border-r border-hair bg-paper p-4 md:flex md:w-[220px] lg:w-[248px]">
      <div className="mb-4 flex items-center gap-2.5 px-3 pt-2">
        <span className="accent-card flex h-9 w-9 items-center justify-center rounded-xl text-[17px] font-bold text-white" aria-hidden="true">
          €
        </span>
        <span className="text-[17px] font-bold tracking-[-0.3px]">Finance</span>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mb-3 flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent"
      >
        <Plus size={18} aria-hidden="true" />
        {labels.add}
      </button>

      <nav className="flex flex-col gap-1" aria-label={labels.home}>
        {NAV_TABS.map(tab => (
          <TabButton
            key={tab}
            tab={tab}
            label={labels[tab]}
            currentView={currentView}
            onNavigate={onNavigate}
            className="flex h-11 items-center rounded-full px-4 text-left text-[15px] font-semibold"
            activeClassName="bg-chip text-on-surface"
          />
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-1 border-t border-hair pt-4">
        {([
          ['budgets', PiggyBank, labels.budgets],
          ['settings', Settings, labels.settings],
        ] as const).map(([view, Icon, label]) => (
          <button
            key={view}
            type="button"
            onClick={() => onNavigate(view)}
            aria-current={currentView === view ? 'page' : undefined}
            className={clsx(
              'flex h-11 items-center gap-3 rounded-full px-4 text-left text-[15px] font-medium',
              currentView === view ? 'bg-chip text-on-surface' : 'text-muted',
            )}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Desktop has no bottom nav, so surface sync / offline state here (M33). */}
      <div className="flex justify-start border-t border-hair px-1 pt-4">
        <SyncStatus showDetails placement="above" />
      </div>
    </aside>

    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="paper-fade absolute inset-x-0 bottom-0 h-[calc(120px+env(safe-area-inset-bottom))]" aria-hidden="true" />
      <div className="relative flex items-center justify-center gap-2.5 pb-[calc(env(safe-area-inset-bottom)+12px)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <TabBar currentView={currentView} onNavigate={onNavigate} labels={labels} />
        <button
          type="button"
          onClick={onAdd}
          aria-label={labels.add}
          title={labels.add}
          style={lgStyle('lg-fab')}
          className="glass-accent pointer-events-auto flex h-[62px] w-[62px] items-center justify-center rounded-full"
        >
          <Plus size={28} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </div>
  </>
);
