import React from 'react';
import { ActiveTab } from './types';
import { getTranslations } from '../../utils/i18n';
import { Segmented } from '../ui/Segmented';

interface EventTabsProps {
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
}

export const EventTabs: React.FC<EventTabsProps> = ({ activeTab, setActiveTab }) => {
    const t = getTranslations();
    return (
        <Segmented<ActiveTab>
            ariaLabel={t.eventSections}
            value={activeTab}
            onChange={setActiveTab}
            className="w-full"
            options={[
                { value: 'shared', label: t.eventExpensesTab },
                { value: 'summary', label: t.summary },
            ]}
        />
    );
};
