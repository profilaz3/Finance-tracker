export const EXPENSE_CATEGORIES = [
    'Activities',
    'Hotel',
    'Transport',
    'Restaurants',
    'Groceries',
    'Shopping'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
    'Activities': '#10b981',    // green
    'Hotel': '#3b82f6',         // blue
    'Transport': '#f59e0b',     // amber
    'Restaurants': '#ef4444',   // red
    'Groceries': '#8b5cf6',     // purple
    'Shopping': '#ec4899'       // pink
};
