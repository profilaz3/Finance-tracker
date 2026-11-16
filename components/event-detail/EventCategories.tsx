import React, { useMemo } from 'react';
import clsx from 'clsx';
import type { AppLanguage } from '../../utils/locale';
import type { Category, Currency, ExchangeRates, SharedExpense } from '../../types';
import { convertCurrency } from '../../utils/currencyUtils';
import { localizeEventExpenseCategory } from '../../domain/eventExpenseCategory';
import { localizeCategoryName } from '../../utils/systemText';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { eventAmount, type EventStrings } from './eventStrings';

/** Colors for event categories that are not in the user's category list. */
const FALLBACK_COLORS = ['#0F766E', '#B43A0A', '#4338CA', '#BE185D', '#0369A1', '#A16207', '#15803D'];

interface EventCategoriesProps {
    spending: SharedExpense[];
    categories: Category[];
    currency: Currency;
    rates: ExchangeRates;
    otherLabel: string;
    language: AppLanguage;
    s: EventStrings;
}

/** What the event's money went on, biggest first, with each category's part of the total. */
export const EventCategories: React.FC<EventCategoriesProps> = ({ spending, categories, currency, rates, otherLabel, language, s }) => {
    const { rows, total } = useMemo(() => {
        const sums = new Map<string, number>();
        for (const expense of spending) {
            const name = expense.category || otherLabel;
            sums.set(name, (sums.get(name) ?? 0) + convertCurrency(expense.amount, expense.currency, currency, rates.rates));
        }
        const list = [...sums.entries()]
            .map(([name, amount]) => ({ name, amount, category: categories.find(category => category.name === name) }))
            .sort((left, right) => right.amount - left.amount)
            .map((entry, index) => ({ ...entry, color: entry.category?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] }));
        return { rows: list, total: list.reduce((sum, entry) => sum + entry.amount, 0) };
    }, [spending, categories, currency, rates.rates, otherLabel]);

    if (rows.length === 0 || total <= 0) return null;

    return (
        <section aria-labelledby="event-categories-title" className="paper-tile px-4 pb-1.5 pt-4">
            <h2 id="event-categories-title" className="text-[17px] font-bold tracking-[-0.2px]">{s.byCategory}</h2>
            <ul className="mt-1">
                {rows.map((entry, index) => {
                    const label = localizeEventExpenseCategory(entry.name, language) !== entry.name || !entry.category
                        ? localizeEventExpenseCategory(entry.name, language)
                        : localizeCategoryName(entry.category, language);
                    return (
                        <li key={entry.name} className={clsx('flex items-center gap-3 py-2.5', index < rows.length - 1 && 'border-b border-hair')}>
                            <CategoryGlyph category={{ name: entry.name, icon: entry.category?.icon, color: entry.color }} size={36} />
                            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-[15px] font-semibold">{label}</span>
                                    <span className="shrink-0 whitespace-nowrap text-[14.5px] font-semibold tabular-nums">{eventAmount(entry.amount, currency, language)}</span>
                                </span>
                                <span className="h-1.5 rounded-full bg-chip" aria-hidden="true">
                                    <span className="block h-1.5 rounded-full" style={{ width: `${(entry.amount / total) * 100}%`, background: entry.color }} />
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
