import React from 'react';
import { Users, PieChart } from 'lucide-react';
import clsx from 'clsx';
import { ActiveTab } from './types';
import { getTranslations } from '../../utils/i18n';

interface EventTabsProps {
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
}

export const EventTabs: React.FC<EventTabsProps> = ({ activeTab, setActiveTab }) => {
    const t = getTranslations();
    return (
        <div className="flex gap-1 bg-surface-container p-1 rounded-xl overflow-x-auto" >
            {
                [
                    { id: 'shared', label: t.sharedExpenses, icon: Users },
                    { id: 'summary', label: t.summary, icon: PieChart },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as ActiveTab)}
                        className={clsx(
                            "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all whitespace-nowrap",
                            activeTab === tab.id
                                ? "bg-surface text-primary shadow-sm"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface/50"
                        )}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))
            }
        </div >
    );
};
