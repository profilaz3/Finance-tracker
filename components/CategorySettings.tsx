import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Category, Transaction, TransactionType } from '../types';
import { TRANSLATIONS, INITIAL_CATEGORIES } from '../constants';
import { Plus, Trash2, Pencil, Check, X, ChevronDown } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { IconPicker } from './IconPicker';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { Segmented } from './ui/Segmented';
import { ConfirmDialog } from './ConfirmDialog';
import { ICON_NAME_MAP } from '../utils/categoryIcons';
import { localizeCategoryName, localizeSubcategory } from '../utils/systemText';
import { pluralText } from '../utils/plural';
import { MOTION } from '../config';
import { v4 as uuidv4 } from 'uuid';

const SWATCHES = ['#E11D48', '#EA580C', '#D97706', '#16A34A', '#0D9488', '#0284C7', '#4F46E5', '#9333EA', '#DB2777', '#64748B'];

interface CategorySettingsProps {
    categories: Category[];
    /** Used to say how many transactions a delete affects. */
    transactions?: Pick<Transaction, 'categoryId'>[];
    onAddCategory: (category: Category) => void;
    onUpdateCategory: (category: Category) => void;
    onDeleteCategory: (id: string) => void;
    language: 'en' | 'sr';
}

const sameText = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** Drops repeated subcategories (older data may have them; they break React keys and removal). */
const uniqueSubcategories = (list: string[]) =>
    list.filter((sub, index) => list.findIndex(other => sameText(other, sub)) === index);

export const CategorySettings: React.FC<CategorySettingsProps> = ({ categories, transactions = [], onAddCategory, onUpdateCategory, onDeleteCategory, language }) => {
    const t = TRANSLATIONS[language];
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filter, setFilter] = useState<TransactionType>('expense');
    const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

    const [name, setName] = useState('');
    const [type, setType] = useState<TransactionType>('expense');
    const [color, setColor] = useState(SWATCHES[0]);
    const [icon, setIcon] = useState<string>('receipt');
    const [subcategories, setSubcategories] = useState<string[]>([]);
    const [newSubcategory, setNewSubcategory] = useState('');
    const [duplicateSub, setDuplicateSub] = useState<string | null>(null);
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);

    const usage = useMemo(() => {
        const counts = new Map<string, number>();
        for (const transaction of transactions) counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
        return counts;
    }, [transactions]);

    // The form opens in place of the edited row (or at the top for a new one); keep it on screen.
    useEffect(() => {
        if (isAdding || editingId) formRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, [isAdding, editingId]);

    const resetForm = () => {
        setName('');
        setType('expense');
        setColor(SWATCHES[0]);
        setIcon('receipt');
        setSubcategories([]);
        setNewSubcategory('');
        setDuplicateSub(null);
        setEditingId(null);
        setIsAdding(false);
        setIsIconPickerOpen(false);
    };

    const startEditing = (category: Category) => {
        setEditingId(category.id);
        setName(localizeCategoryName(category, language));
        setType(category.type);
        setColor(category.color);
        setIcon(category.icon || 'receipt');
        setFilter(category.type);
        setSubcategories([...category.subcategories]);
        setNewSubcategory('');
        setDuplicateSub(null);
        setIsIconPickerOpen(false);
        setIsAdding(false);
        setExpandedId(null);
    };

    /** Adds the typed subcategory unless it is empty or already listed; returns the new list. */
    const withPendingSubcategory = (): string[] | null => {
        const text = newSubcategory.trim();
        if (!text) return subcategories;
        const existing = subcategories.find(sub => sameText(sub, text));
        if (existing) {
            setDuplicateSub(existing);
            return null;
        }
        return [...subcategories, text];
    };

    const addSubcategory = () => {
        const next = withPendingSubcategory();
        if (!next) return;
        setSubcategories(next);
        setNewSubcategory('');
        setDuplicateSub(null);
    };

    const handleSave = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        // A typed but not yet added subcategory is kept (a duplicate of one in the list is dropped).
        const nextSubcategories = uniqueSubcategories(withPendingSubcategory() ?? subcategories);

        if (editingId) {
            const category = categories.find(c => c.id === editingId);
            if (category) {
                // An untouched built-in name stays stored in English, so it keeps translating.
                const nextName = trimmed === localizeCategoryName(category, language) ? category.name : trimmed;
                onUpdateCategory({ ...category, name: nextName, type, color, icon, subcategories: nextSubcategories });
            }
        } else {
            onAddCategory({
                id: uuidv4(),
                name: trimmed,
                type,
                color,
                icon,
                subcategories: nextSubcategories,
            });
        }
        resetForm();
    };

    // Unused categories go at once (the handler shows an Undo toast); used ones say what happens first.
    const handleDelete = (category: Category) => {
        if ((usage.get(category.id) ?? 0) > 0) {
            setPendingDelete(category);
            return;
        }
        onDeleteCategory(category.id);
    };

    const removeSubcategory = (index: number) => {
        setSubcategories(subcategories.filter((_, i) => i !== index));
        setDuplicateSub(null);
    };

    const field = 'h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint';
    const visible = categories.filter(category => category.type === filter);
    const isFormOpen = isAdding || editingId !== null;
    const pendingCount = pendingDelete ? usage.get(pendingDelete.id) ?? 0 : 0;

    const renderForm = () => (
        <div ref={formRef} className="flex scroll-mt-4 flex-col gap-4">
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
                    onKeyDown={e => {
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            resetForm();
                        }
                    }}
                    placeholder={t.categoryName}
                    aria-label={t.categoryName}
                    maxLength={60}
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

            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={t.color}>
                {SWATCHES.map(swatch => {
                    const selected = color.toLowerCase() === swatch.toLowerCase();
                    return (
                        <button
                            key={swatch}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={swatch}
                            onClick={() => setColor(swatch)}
                            className="flex h-10 w-10 items-center justify-center rounded-full"
                        >
                            <span
                                aria-hidden="true"
                                className={clsx(
                                    'h-[34px] w-[34px] rounded-full transition-transform',
                                    selected && 'scale-105 shadow-[0_0_0_2px_var(--paper-tile),0_0_0_4px_var(--paper-text)]',
                                )}
                                style={{ background: swatch }}
                            />
                        </button>
                    );
                })}
                <label className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full" title={t.customColor}>
                    <span aria-hidden="true" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-chip text-muted">
                        <Plus size={15} />
                    </span>
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
                    <div className="flex flex-wrap gap-x-1.5 gap-y-2">
                        {subcategories.map((sub, subIndex) => (
                            <span
                                key={`${subIndex}-${sub}`}
                                className={clsx(
                                    'flex h-8 items-center rounded-full bg-chip pl-3 text-[13px] font-medium',
                                    duplicateSub === sub && 'ring-2 ring-neg',
                                )}
                            >
                                {localizeSubcategory(sub, language)}
                                <button
                                    type="button"
                                    onClick={() => removeSubcategory(subIndex)}
                                    aria-label={`${t.delete}: ${localizeSubcategory(sub, language)}`}
                                    className="-my-1 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:text-neg"
                                >
                                    <X size={14} aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <input
                        value={newSubcategory}
                        onChange={e => {
                            setNewSubcategory(e.target.value);
                            setDuplicateSub(null);
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addSubcategory();
                            }
                        }}
                        placeholder={t.addSubcategoryPlaceholder}
                        aria-label={t.addSubcategoryPlaceholder}
                        aria-invalid={duplicateSub !== null}
                        aria-describedby={duplicateSub !== null ? 'subcategory-duplicate' : undefined}
                        maxLength={60}
                        className={clsx(field, duplicateSub !== null && 'ring-2 ring-neg')}
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
                {duplicateSub !== null && (
                    <p id="subcategory-duplicate" role="alert" className="px-1 text-[12px] font-medium text-neg">
                        {t.subcategoryDuplicate.replace('{name}', localizeSubcategory(duplicateSub, language) ?? duplicateSub)}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2">
                <button type="button" onClick={resetForm} className="h-11 rounded-full px-4 text-[14px] font-semibold text-muted hover:bg-chip">
                    {t.cancel}
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim()}
                    className="flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent disabled:opacity-40"
                >
                    <Check size={16} aria-hidden="true" /> {t.save}
                </button>
            </div>
        </div>
    );

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
                        className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
                    >
                        <Plus size={17} aria-hidden="true" /> {t.newCategory}
                    </button>
                )}
            </div>

            <AnimatePresence initial={false}>
                {isAdding && (
                    <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={MOTION.view.transition}
                        className="overflow-hidden"
                    >
                        <div className="paper-tile p-4">{renderForm()}</div>
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
                        const displayName = localizeCategoryName(category, language);
                        const subs = category.subcategories.map(sub => localizeSubcategory(sub, language) ?? sub);
                        const divider = index < visible.length - 1 && 'border-b border-hair';

                        if (editingId === category.id) {
                            return (
                                <div key={category.id} className={clsx('py-4', divider)}>
                                    {renderForm()}
                                </div>
                            );
                        }

                        return (
                            <div key={category.id} className={clsx('group', divider)}>
                                <div className="flex min-h-[64px] items-center gap-2 py-2">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(expanded ? null : category.id)}
                                        aria-expanded={expanded}
                                        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
                                    >
                                        <CategoryGlyph category={{ ...category, icon: iconName }} />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-[15px] font-semibold">{displayName}</span>
                                            <span className="truncate text-[13px] text-muted">
                                                {subs.length > 0 ? subs.join(', ') : t.noSubcategories}
                                            </span>
                                        </span>
                                        <ChevronDown
                                            size={18}
                                            aria-hidden="true"
                                            className={clsx('shrink-0 text-faint transition-transform', expanded && 'rotate-180')}
                                        />
                                    </button>
                                    <div className="-mr-2 flex shrink-0 items-center transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                                        <button
                                            type="button"
                                            onClick={() => startEditing(category)}
                                            aria-label={`${t.edit}: ${displayName}`}
                                            title={t.edit}
                                            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-chip"
                                        >
                                            <Pencil size={17} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(category)}
                                            aria-label={`${t.delete}: ${displayName}`}
                                            title={t.delete}
                                            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-chip hover:text-neg"
                                        >
                                            <Trash2 size={17} aria-hidden="true" />
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
                                                {subs.map((sub, subIndex) => (
                                                    <span key={`${subIndex}-${sub}`} className="rounded-full bg-chip px-3 py-1 text-[13px] font-medium">
                                                        {sub}
                                                    </span>
                                                ))}
                                                {subs.length === 0 && (
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

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                type="danger"
                title={pendingDelete ? t.deleteCategoryTitle.replace('{name}', localizeCategoryName(pendingDelete, language)) : ''}
                message={pluralText(pendingCount, language, {
                    one: t.deleteCategoryUsedOne,
                    few: t.deleteCategoryUsedFew,
                    other: t.deleteCategoryUsedOther,
                })}
                confirmLabel={t.delete}
                cancelLabel={t.cancel}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    const category = pendingDelete;
                    setPendingDelete(null);
                    if (category) onDeleteCategory(category.id);
                }}
            />
        </section>
    );
};
