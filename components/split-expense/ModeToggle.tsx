import React from 'react';
import { ModeToggleProps } from './types';
import { TRANSLATIONS } from '../../constants';
import { Segmented } from '../ui/Segmented';

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, setMode, language }) => {
    const t = TRANSLATIONS[language];
    return (
        <div className="px-5 pb-1">
            <Segmented
                ariaLabel={t.whoPaid}
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                    {
                        value: 'i_paid',
                        label: <span className="whitespace-nowrap">{t.iPaid}</span>,
                    },
                    {
                        value: 'they_paid',
                        label: <span className="whitespace-nowrap">{t.theyPaid}</span>,
                    },
                ]}
            />
        </div>
    );
};
