import type { LucideIcon } from 'lucide-react';
import {
    Activity,
    ArrowDownLeft,
    ArrowRightLeft,
    ArrowUpRight,
    BedDouble,
    Briefcase,
    Car,
    Coffee,
    Dumbbell,
    Film,
    Fuel,
    Gamepad2,
    Gift,
    GraduationCap,
    HeartPulse,
    Home,
    Landmark,
    Music,
    PawPrint,
    Plane,
    Receipt,
    RefreshCw,
    Shirt,
    ShoppingBag,
    ShoppingCart,
    Smartphone,
    Sparkles,
    Ticket,
    TrainFront,
    TrendingUp,
    Utensils,
    Wallet,
    Wifi,
    Zap,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
    'Food & Dining': Utensils,
    'Coffee': Coffee,
    'Shopping': ShoppingBag,
    'Transportation': Car,
    'Home': Home,
    'Healthcare': HeartPulse,
    'Technology': Smartphone,
    'Clothing': Shirt,
    'Travel': Plane,
    'Entertainment': Film,
    'Education': GraduationCap,
    'Gifts': Gift,
    'Income': TrendingUp,
    'Salary': Wallet,
    'default': Receipt
};

/** Keyword hints (English and Serbian) for category names that are not in the table. */
const KEYWORD_ICONS: Array<[RegExp, LucideIcon]> = [
    [/lodg|hotel|hostel|accommodat|airbnb|smeštaj|smestaj|stay/i, BedDouble],
    [/fuel|gas|petrol|gorivo/i, Fuel],
    [/train|bus|metro|tram|public transport|prevoz/i, TrainFront],
    [/transport|taxi|uber|car|parking|auto/i, Car],
    [/flight|plane|travel|trip|putovanj/i, Plane],
    [/coffee|kafa|cafe/i, Coffee],
    [/food|dining|restaurant|meal|lunch|dinner|hrana|restoran|pizza/i, Utensils],
    [/grocer|supermarket|namirnic/i, ShoppingCart],
    [/shop|kupovin/i, ShoppingBag],
    [/ticket|museum|concert|event|ulaznic/i, Ticket],
    [/music|muzik/i, Music],
    [/entertain|movie|film|cinema|zabav/i, Film],
    [/game|igr/i, Gamepad2],
    [/health|doctor|pharma|medic|zdravl|apotek/i, HeartPulse],
    [/gym|sport|fitness|teretan/i, Dumbbell],
    [/rent|housing|home|stan|kirij/i, Home],
    [/util|electric|struja|energy/i, Zap],
    [/internet|phone|mobile|telefon/i, Wifi],
    [/cloth|fashion|odeć|odec/i, Shirt],
    [/educat|school|course|škol|skol/i, GraduationCap],
    [/gift|poklon/i, Gift],
    [/pet|ljubim/i, PawPrint],
    [/beauty|care|lepot/i, Sparkles],
    [/salary|plat|wage|paycheck/i, Briefcase],
    [/income|prihod|invest|dividend/i, TrendingUp],
    [/bank|fee|tax|porez|naknad/i, Landmark],
];

export const getCategoryIcon = (categoryName: string): LucideIcon => {
    if (CATEGORY_ICONS[categoryName]) return CATEGORY_ICONS[categoryName];
    const hit = KEYWORD_ICONS.find(([pattern]) => pattern.test(categoryName));
    return hit ? hit[1] : CATEGORY_ICONS.default;
};

// Map icon names (from category.icon property) to Lucide icons
export const ICON_NAME_MAP: Record<string, LucideIcon> = {
    'coffee': Coffee,
    'car': Car,
    'home': Home,
    'wallet': Wallet,
    'gamepad': Gamepad2,
    'activity': Activity,
    'trending-up': TrendingUp,
    'refresh-cw': RefreshCw,
    'arrow-right-left': ArrowRightLeft,
    'arrow-up-right': ArrowUpRight,
    'arrow-down-left': ArrowDownLeft,
    'utensils': Utensils,
    'shopping-cart': ShoppingCart,
    'shopping-bag': ShoppingBag,
    'heart': HeartPulse,
    'smartphone': Smartphone,
    'shirt': Shirt,
    'plane': Plane,
    'film': Film,
    'graduation-cap': GraduationCap,
    'gift': Gift,
    'bed': BedDouble,
    'fuel': Fuel,
    'train': TrainFront,
    'ticket': Ticket,
    'music': Music,
    'dumbbell': Dumbbell,
    'zap': Zap,
    'wifi': Wifi,
    'paw': PawPrint,
    'sparkles': Sparkles,
    'briefcase': Briefcase,
    'landmark': Landmark,
    'receipt': Receipt,
};

export const getIconByName = (iconName: string): LucideIcon => {
    return ICON_NAME_MAP[iconName] || Wallet;
};

/** The icon for a category: its explicit icon name, else a guess from its name. */
export const iconForCategory = (category?: { name?: string; icon?: string }): LucideIcon =>
    category?.icon && ICON_NAME_MAP[category.icon] ? ICON_NAME_MAP[category.icon] : getCategoryIcon(category?.name ?? '');
