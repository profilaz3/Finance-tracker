import React from 'react';
import {
    Banknote, CreditCard, Wallet, PiggyBank, Landmark, Bitcoin,
    DollarSign, Euro, PoundSterling, Briefcase, Gem,
    Coins, Building, Vault, Coffee, Car, Home, Gamepad2,
    Activity, TrendingUp, RefreshCw, ArrowRightLeft,
    ArrowUpRight, ArrowDownLeft, Tag, type LucideIcon
} from 'lucide-react';
import clsx from 'clsx';

export const ICONS = {
    'banknote': Banknote,
    'credit-card': CreditCard,
    'wallet': Wallet,
    'piggy-bank': PiggyBank,
    'landmark': Landmark,
    'bitcoin': Bitcoin,
    'dollar-sign': DollarSign,
    'euro': Euro,
    'pound-sterling': PoundSterling,
    'briefcase': Briefcase,
    'gem': Gem,
    'coins': Coins,
    'building': Building,
    'vault': Vault,
    'coffee': Coffee,
    'car': Car,
    'home': Home,
    'gamepad': Gamepad2,
    'activity': Activity,
    'trending-up': TrendingUp,
    'refresh-cw': RefreshCw,
    'arrow-right-left': ArrowRightLeft,
    'arrow-up-right': ArrowUpRight,
    'arrow-down-left': ArrowDownLeft,
    'tag': Tag
};

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
