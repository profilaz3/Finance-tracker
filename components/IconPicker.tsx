import React from 'react';
import {
    Banknote, CreditCard, Wallet, PiggyBank, Landmark, Bitcoin,
    DollarSign, Euro, PoundSterling, Briefcase, Gem,
    Coins, Building, Vault, Coffee, Car, Home, Gamepad2,
    Activity, TrendingUp, RefreshCw, ArrowRightLeft,
    ArrowUpRight, ArrowDownLeft, Tag
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
}

export const IconPicker: React.FC<IconPickerProps> = ({ selectedIcon, onSelect }) => {
    return (
        <div className="grid grid-cols-5 gap-2">
            {Object.entries(ICONS).map(([name, Icon]) => (
                <button
                    key={name}
                    onClick={() => onSelect(name)}
                    className={clsx(
                        "p-2 rounded-lg flex items-center justify-center transition-all",
                        selectedIcon === name
                            ? "bg-primary text-on-primary shadow-sm"
                            : "bg-surface-container-highest text-on-surface hover:bg-surface-container-high"
                    )}
                    title={name}
                >
                    <Icon size={20} />
                </button>
            ))}
        </div>
    );
};
