import React, { useState } from 'react';
import { Category, TransactionType } from '../types';
import { TRANSLATIONS, INITIAL_CATEGORIES } from '../constants';
import { Plus, Trash2, Pencil, Check, X, ChevronDown } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { IconPicker } from './IconPicker';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { Segmented } from './ui/Segmented';
import { ICON_NAME_MAP } from '../utils/categoryIcons';

const SWATCHES = ['#E11D48', '#EA580C', '#D97706', '#16A34A', '#0D9488', '#0284C7', '#4F46E5', '#9333EA', '#DB2777', '#64748B'];
import { v4 as uuidv4 } from 'uuid';

interface CategorySettingsProps {
    categories: Category[];
    onAddCategory: (category: Category) => void;
    onUpdateCategory: (category: Category) => void;
    onDeleteCategory: (id: string) => void;
    language: 'en' | 'sr';
}

export const CategorySettings: React.FC<CategorySettingsProps> = ({ categories, onAddCategory, onUpdateCategory, onDeleteCategory, language }) => {
    const t = TRANSLATIONS[language];
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filter, setFilter] = useState<TransactionType>('expense');

    const [name, setName] = useState('');
    const [type, setType] = useState<TransactionType>('expense');
    const [color, setColor] = useState(SWATCHES[0]);
    const [icon, setIcon] = useState<string>('receipt');
    const [subcategories, setSubcategories] = useState<string[]>([]);
    const [newSubcategory, setNewSubcategory] = useState('');
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

    const resetForm = () => {
        setName('');
        setType('expense');
        setColor(SWATCHES[0]);
        setIcon('receipt');
        setSubcategories([]);
        setNewSubcategory('');
        setEditingId(null);
        setIsAdding(false);
        setIsIconPickerOpen(false);
    };

    const startEditing = (category: Category) => {
        setEditingId(category.id);
        setName(category.name);
        setType(category.type);
        setColor(category.color);
        setIcon(category.icon || 'receipt');
        setFilter(category.type);
        setSubcategories([...category.subcategories]);
        setIsAdding(false);
        setExpandedId(category.id);
    };

    const handleSave = () => {
        if (!name.trim()) return;

        if (editingId) {
            const category = categories.find(c => c.id === editingId);
            if (category) {
                onUpdateCategory({ ...category, name, type, color, icon, subcategories });
            }
        } else {
            const newCategory: Category = {
                id: uuidv4(),
                name,
                type,
                color,
                icon,
                subcategories
            };
            onAddCategory(newCategory);
        }
        resetForm();
    };

    // Single-item delete: the handler shows an Undo toast instead of asking first.
    const handleDelete = (id: string) => {
        onDeleteCategory(id);
    };

    const addSubcategory = () => {
        if (newSubcategory.trim()) {
            setSubcategories([...subcategories, newSubcategory.trim()]);
            setNewSubcategory('');
        }
    };

    const removeSubcategory = (sub: string) => {
        setSubcategories(subcategories.filter(s => s !== sub));
    };

    const field = 'h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint';
    const visible = categories.filter(category => category.type === filter);
    const isFormOpen = isAdding || editingId !== null;

    return (
        <section className="flex flex-col gap-3" aria-label={t.categories}>
            <div className="flex items-center justify-between gap-2 px-1">
                <Segmented<TransactionType>
                    size="sm"
                    ariaLabel={t.categories}
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'expense', label: t.expense },
                        { value: 'income', label: t.income },
                    ]}
                />
                {!isFormOpen && (
                    <button
                        type="button"
                        onClick={() => {
                            setType(filter);
                            setIsAdding(true);
                        }}
                        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
                    >
                        <Plus size={17} aria-hidden="true" /> {t.newCategory}
                    </button>
                )}
            </div>

            <AnimatePresence>
                {isFormOpen && (
                    <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="paper-tile flex flex-col gap-4 p-4">
                            <div className="flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                                        aria-label={t.chooseIcon}
                                        title={t.chooseIcon}
                                        aria-expanded={isIconPickerOpen}
                                        className="rounded-[16px] transition-transform active:scale-95"
                                    >
                                        <CategoryGlyph category={{ name, color, icon }} size={48} />
                                    </button>
                                </div>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={t.categoryName}
                                    aria-label={t.categoryName}
                                    className={field}
                                    autoFocus
                                />
                            </div>
                            {isIconPickerOpen && (
                                <IconPicker
                                    icons={ICON_NAME_MAP}
                                    selectedIcon={icon}
                                    onSelect={(newIcon) => {
                                        setIcon(newIcon);
                                        setIsIconPickerOpen(false);
                                    }}
                                />
                            )}

                            <Segmented<TransactionType>
                                ariaLabel={t.transactionType}
                                value={type}
                                onChange={setType}
                                options={[
                                    { value: 'expense', label: t.expense },
                                    { value: 'income', label: t.income },
                                ]}
                            />

                            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t.color}>
                                {SWATCHES.map(swatch => (
                                    <button
                                        key={swatch}
                                        type="button"
                                        role="radio"
                                        aria-checked={color.toLowerCase() === swatch.toLowerCase()}
                                        aria-label={swatch}
                                        onClick={() => setColor(swatch)}
                                        className={clsx(
                                            'h-8 w-8 rounded-full transition-transform',
                                            color.toLowerCase() === swatch.toLowerCase() && 'scale-110 shadow-[0_0_0_2px_var(--paper-tile),0_0_0_4px_var(--paper-text)]',
                                        )}
                                        style={{ background: swatch }}
                                    />
                                ))}
                                <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-chip text-muted" title={t.customColor}>
                                    <Plus size={15} aria-hidden="true" />
                                    <input
                                        type="color"
                                        value={color}
                                        onChange={e => setColor(e.target.value)}
                                        aria-label={t.customColor}
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                    />
                                </label>
                            </div>

                            <div className="flex flex-col gap-2">
                                <span className="text-[12px] font-semibold uppercase tracking-wide text-faint">{t.subcategories}</span>
                                {subcategories.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {subcategories.map(sub => (
                                            <span key={sub} className="flex h-8 items-center gap-1 rounded-full bg-chip pl-3 pr-1 text-[13px] font-medium">
                                                {sub}
                                                <button
                                                    type="button"
                                                    onClick={() => removeSubcategory(sub)}
                                                    aria-label={`${t.delete}: ${sub}`}
                                                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-neg"
                                                >
                                                    <X size={13} aria-hidden="true" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        value={newSubcategory}
                                        onChange={e => setNewSubcategory(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addSubcategory()}
                                        placeholder={t.addSubcategoryPlaceholder}
                                        aria-label={t.addSubcategoryPlaceholder}
                                        className={field}
                                    />
                                    <button
                                        type="button"
                                        onClick={addSubcategory}
                                        aria-label={t.add}
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-chip"
                                    >
                                        <Plus size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={resetForm} className="h-10 rounded-full px-4 text-[14px] font-semibold text-muted hover:bg-chip">
                                    {t.cancel}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={!name.trim()}
                                    className="flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent disabled:opacity-40"
                                >
                                    <Check size={16} aria-hidden="true" /> {t.save}
                                </button>
                            </div>
                        </div>
                    </m.div>
                )}
            </AnimatePresence>

            {visible.length === 0 ? (
                <p className="paper-tile px-4 py-8 text-center text-[14px] text-muted">{t.noSubcategoriesDefined}</p>
            ) : (
                <div className="paper-tile px-4 py-1">
                    {visible.map((category, index) => {
                        const iconName = category.icon || INITIAL_CATEGORIES.find(c => c.name === category.name)?.icon;
                        const expanded = expandedId === category.id;

                        return (
                            <div key={category.id} className={clsx('group', index < visible.length - 1 && 'border-b border-hair')}>
                                <div className="flex min-h-[64px] items-center gap-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(expanded ? null : category.id)}
                                        aria-expanded={expanded}
                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                    >
                                        <CategoryGlyph category={{ ...category, icon: iconName }} />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-[15px] font-semibold">{category.name}</span>
                                            <span className="truncate text-[13px] text-muted">
                                                {category.subcategories.length > 0 ? category.subcategories.join(', ') : t.noSubcategories}
                                            </span>
                                        </span>
                                        <ChevronDown
                                            size={18}
                                            aria-hidden="true"
                                            className={clsx('shrink-0 text-faint transition-transform', expanded && 'rotate-180')}
                                        />
                                    </button>
                                    <div className="-mr-1.5 flex shrink-0 items-center transition-opacity opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100">
                                        <button
                                            type="button"
                                            onClick={() => startEditing(category)}
                                            aria-label={`${t.edit}: ${category.name}`}
                                            title={t.edit}
                                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-chip"
                                        >
                                            <Pencil size={16} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(category.id)}
                                            aria-label={`${t.delete}: ${category.name}`}
                                            title={t.delete}
                                            className="flex h-9 w-9 items-center justify-center rounded-full text-faint hover:bg-chip hover:text-neg"
                                        >
                                            <Trash2 size={16} aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {expanded && (
                                        <m.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="flex flex-wrap gap-1.5 pb-3 pl-[52px]">
                                                {category.subcategories.map(sub => (
                                                    <span key={sub} className="rounded-full bg-chip px-3 py-1 text-[13px] font-medium">
                                                        {sub}
                                                    </span>
                                                ))}
                                                {category.subcategories.length === 0 && (
                                                    <span className="text-[13px] text-muted">{t.noSubcategoriesDefined}</span>
                                                )}
                                            </div>
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};
