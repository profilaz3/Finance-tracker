import {
    ShoppingCart,
    Coffee,
    Home,
    Car,
    Heart,
    Smartphone,
    Shirt,
    Plane,
    Utensils,
    Film,
    GraduationCap,
    Gift,
    TrendingUp,
    Wallet,
    Activity,
    Gamepad,
    RefreshCw,
    ArrowRightLeft,
    ArrowUpRight,
    ArrowDownLeft
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, any> = {
    'Food & Dining': Utensils,
    'Coffee': Coffee,
    'Shopping': ShoppingCart,
    'Transportation': Car,
    'Home': Home,
    'Healthcare': Heart,
    'Technology': Smartphone,
    'Clothing': Shirt,
    'Travel': Plane,
    'Entertainment': Film,
    'Education': GraduationCap,
    'Gifts': Gift,
    'Income': TrendingUp,
    'Salary': Wallet,
    'default': Wallet
};

export const getCategoryIcon = (categoryName: string) => {
    return CATEGORY_ICONS[categoryName] || CATEGORY_ICONS.default;
};

// Map icon names (from category.icon property) to Lucide icons
export const ICON_NAME_MAP: Record<string, any> = {
    'coffee': Coffee,
    'car': Car,
    'home': Home,
    'wallet': Wallet,
    'gamepad': Gamepad,
    'activity': Activity,
    'trending-up': TrendingUp,
    'refresh-cw': RefreshCw,
    'arrow-right-left': ArrowRightLeft,
    'arrow-up-right': ArrowUpRight,
    'arrow-down-left': ArrowDownLeft,
    'utensils': Utensils,
    'shopping-cart': ShoppingCart,
    'heart': Heart,
    'smartphone': Smartphone,
    'shirt': Shirt,
    'plane': Plane,
    'film': Film,
    'graduation-cap': GraduationCap,
    'gift': Gift
};

export const getIconByName = (iconName: string) => {
    return ICON_NAME_MAP[iconName] || Wallet;
};
