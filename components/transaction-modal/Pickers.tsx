import React from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { Account, Category } from '../../types';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { AccountGlyph } from '../ui/AccountGlyph';
import { localizeCategoryName, localizeSubcategory } from '../../utils/systemText';

const REPAYMENT_IDS = ['debt-repayment', 'loan-repayment'];

/** Everyday categories first; debt and loan repayments go last. */
export const orderCategories = (categories: Category[]): Category[] => [
    ...categories.filter(item => !REPAYMENT_IDS.includes(item.id)),
    ...categories.filter(item => REPAYMENT_IDS.includes(item.id)),
];

interface CategoryChipsProps {
    categories: Category[];
    value: string;
    onPick: (category: Category) => void;
    /** Subcategories of the chosen category; none hides that part. */
    subcategories?: string[];
    subcategory?: string;
    /** Tapping the chosen subcategory again clears it (`wasOn` says which happened). */
    onSubcategory?: (sub: string, wasOn: boolean) => void;
    /** Unique id for the subcategory heading. */
    subLabelId?: string;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
}

/** Categories as wrapping chips (whole words, never cut), with the chosen one's subcategories under them. */
export const CategoryChips: React.FC<CategoryChipsProps> = ({
    categories,
    value,
    onPick,
    subcategories = [],
    subcategory,
    onSubcategory,
    subLabelId = 'category-chips-sub',
    language,
    t,
}) => (
    <>
        <div role="group" aria-label={t.categories} className="flex flex-wrap gap-1.5 p-0.5">
            {categories.map(item => {
                const on = item.id === value;
                return (
                    <button
                        key={item.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onPick(item)}
                        className={clsx(
                            'flex h-11 max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[14.5px] font-semibold transition-colors',
                            on ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface',
                        )}
                    >
                        <CategoryGlyph category={item} size={34} shape="circle" tone={on ? 'solid' : undefined} />
                        <span className="truncate">{localizeCategoryName(item, language)}</span>
                        {on && <Check size={14} strokeWidth={3} aria-hidden="true" className="shrink-0" />}
                    </button>
                );
            })}
        </div>
        {subcategories.length > 0 && onSubcategory && (
            <div className="mt-2 border-t border-hair px-1 pb-1 pt-3">
                <span id={subLabelId} className="mb-2 block text-[13px] font-semibold text-muted">{t.subcategory}</span>
                <div role="group" aria-labelledby={subLabelId} className="flex flex-wrap gap-2">
                    {subcategories.map(sub => {
                        const on = subcategory === sub;
                        return (
                            <button
                                key={sub}
                                type="button"
                                aria-pressed={on}
                                onClick={() => onSubcategory(sub, on)}
                                className={clsx(
                                    'flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                                    on ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface',
                                )}
                            >
                                {localizeSubcategory(sub, language)}
                                {on && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        )}
    </>
);

interface WalletListProps {
    wallets: Account[];
    value: string;
    onPick: (id: string) => void;
    label: string;
    /** The balance shown under a wallet's name; undefined leaves it out. */
    balance?: (wallet: Account) => string | undefined;
}

/** Wallets in two columns, each with its glyph and, when known, its balance. */
export const WalletList: React.FC<WalletListProps> = ({ wallets, value, onPick, label, balance }) => (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2">
        {wallets.map(wallet => {
            const on = wallet.id === value;
            const shown = balance?.(wallet);
            return (
                <button
                    key={wallet.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPick(wallet.id)}
                    className={clsx(
                        'flex min-h-[60px] min-w-0 items-center gap-2.5 rounded-[18px] px-2.5 py-2 text-left transition-colors',
                        on ? 'bg-accent-soft shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]' : 'bg-chip',
                    )}
                >
                    <AccountGlyph account={wallet} size={36} />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold">{wallet.name}</span>
                        <span className="block whitespace-nowrap text-[12.5px] font-medium tabular-nums text-muted">{shown ?? wallet.currency}</span>
                    </span>
                    {on && <Check size={16} strokeWidth={3} aria-hidden="true" className="shrink-0 text-accent" />}
                </button>
            );
        })}
    </div>
);
