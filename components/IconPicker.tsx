import React from 'react';
import { type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { ACCOUNT_ICONS } from '../utils/accountIcons';

/** Wallet icon set (also the default picker set). */
export const ICONS = ACCOUNT_ICONS;

export type IconName = keyof typeof ICONS;

interface IconPickerProps {
    selectedIcon: string;
    onSelect: (icon: string) => void;
    /** Icon set to choose from; wallets use the money set by default. */
    icons?: Record<string, LucideIcon>;
}

export const IconPicker: React.FC<IconPickerProps> = ({ selectedIcon, onSelect, icons = ICONS }) => {
    return (
        <div className="grid grid-cols-6 gap-1.5">
            {Object.entries(icons).map(([name, Icon]) => (
                <button
                    key={name}
                    type="button"
                    onClick={() => onSelect(name)}
                    aria-label={name}
                    aria-pressed={selectedIcon === name}
                    className={clsx(
                        "flex h-10 items-center justify-center rounded-[12px] transition-colors",
                        selectedIcon === name
                            ? "bg-accent text-on-accent"
                            : "bg-chip hover:text-accent"
                    )}
                    title={name}
                >
                    <Icon size={19} aria-hidden="true" />
                </button>
            ))}
        </div>
    );
};
