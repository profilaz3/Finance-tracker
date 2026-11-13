import React, { useState } from 'react';
import { Category, TransactionType } from '../types';
import { TRANSLATIONS, INITIAL_CATEGORIES } from '../constants';
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { IconPicker, ICONS, IconName } from './IconPicker';
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

    const [name, setName] = useState('');
    const [type, setType] = useState<TransactionType>('expense');
    const [color, setColor] = useState('#FF5252');
    const [icon, setIcon] = useState<string>('tag');
    const [subcategories, setSubcategories] = useState<string[]>([]);
    const [newSubcategory, setNewSubcategory] = useState('');
    const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

    const resetForm = () => {
        setName('');
        setType('expense');
        setColor('#FF5252');
        setIcon('tag');
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
        setIcon(category.icon || 'tag');
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

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this category? Transactions using this category might display incorrectly.')) {
            onDeleteCategory(id);
        }
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

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-on-surface flex items-center gap-2">
                    <Tag size={20} /> {t.categories}
                </h3>
                {!isAdding && !editingId && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="text-sm font-medium text-primary hover:bg-primary-container/30 px-3 py-1 rounded-full transition-colors flex items-center gap-1"
                    >
                        <Plus size={16} /> {t.newCategory}
                    </button>
                )}
            </div>

            <div className="bg-surface-container-low rounded-xl shadow-elevation-1 overflow-hidden">
                <AnimatePresence>
                    {(isAdding || editingId) && (
                        <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-b border-outline-variant/20 bg-surface-container p-4"
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex gap-2 items-center">
                                        <div className="relative">
                                            <button
                                                onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                                                className="p-2 rounded-full bg-surface-container-highest text-primary flex-shrink-0 hover:bg-primary-container hover:text-on-primary-container transition-colors"
                                            >
                                                {(() => {
                                                    const Icon = ICONS[icon as IconName] || Tag;
                                                    return <Icon size={24} />;
                                                })()}
                                            </button>
                                            {isIconPickerOpen && (
                                                <div className="absolute top-full left-0 mt-2 z-20 bg-surface-container-high p-3 rounded-xl shadow-elevation-3 w-64 border border-outline-variant/20">
                                                    <IconPicker
                                                        selectedIcon={icon}
                                                        onSelect={(newIcon) => {
                                                            setIcon(newIcon);
                                                            setIsIconPickerOpen(false);
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            placeholder="Category Name"
                                            className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-on-surface placeholder-on-surface-variant/60 w-full"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <select
                                            value={type}
                                            onChange={e => setType(e.target.value as TransactionType)}
                                            className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-on-surface flex-1"
                                        >
                                            <option value="expense">{t.expense}</option>
                                            <option value="income">{t.income}</option>
                                        </select>
                                        <input
                                            type="color"
                                            value={color}
                                            onChange={e => setColor(e.target.value)}
                                            className="h-10 w-14 rounded-lg cursor-pointer bg-transparent"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-on-surface-variant uppercase">Subcategories</label>
                                    <div className="flex flex-wrap gap-2">
                                        {subcategories.map(sub => (
                                            <span key={sub} className="bg-surface-container-highest px-2 py-1 rounded-md text-sm flex items-center gap-1">
                                                {sub}
                                                <button onClick={() => removeSubcategory(sub)} className="text-on-surface-variant hover:text-error">
                                                    <X size={14} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            value={newSubcategory}
                                            onChange={e => setNewSubcategory(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addSubcategory()}
                                            placeholder="Add subcategory..."
                                            className="bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm text-on-surface placeholder-on-surface-variant/60 flex-1"
                                        />
                                        <button onClick={addSubcategory} className="bg-secondary-container text-on-secondary-container p-2 rounded-lg">
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button onClick={resetForm} className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest rounded-lg">
                                        {t.cancel}
                                    </button>
                                    <button onClick={handleSave} className="px-4 py-2 text-sm bg-primary text-on-primary rounded-lg flex items-center gap-2">
                                        <Check size={16} /> {t.save}
                                    </button>
                                </div>
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>

                <div className="divide-y divide-outline-variant/10">
                    {categories.map(category => {
                        const iconName = category.icon || INITIAL_CATEGORIES.find(c => c.name === category.name)?.icon || 'tag';
                        const Icon = ICONS[iconName as IconName] || Tag;

                        return (
                            <div key={category.id} className="group">
                                <div
                                    className={clsx(
                                        "p-4 flex items-center gap-3 hover:bg-surface-container-high transition-colors cursor-pointer",
                                        editingId === category.id && "bg-surface-container-high"
                                    )}
                                    onClick={() => setExpandedId(expandedId === category.id ? null : category.id)}
                                >
                                    <div className="relative flex-shrink-0">
                                        <div
                                            className="relative w-10 h-10 rounded-full flex items-center justify-center z-10"
                                            style={{
                                                backgroundColor: `${category.color}40`,
                                                color: category.color,
                                                boxShadow: `0 0 15px ${category.color}30`
                                            }}
                                        >
                                            <Icon size={20} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-medium text-on-surface">{category.name}</h4>
                                            <span className={clsx(
                                                "text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider",
                                                category.type === 'income' ? "bg-tertiary-container text-on-tertiary-container" : "bg-error-container text-on-error-container"
                                            )}>
                                                {category.type === 'income' ? t.income : t.expense}
                                            </span>
                                        </div>
                                        <p className="text-sm text-on-surface-variant truncate">
                                            {category.subcategories.length > 0
                                                ? category.subcategories.join(', ')
                                                : <span className="italic opacity-50">No subcategories</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); startEditing(category); }}
                                            className="p-2 text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container rounded-full"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(category.id); }}
                                            className="p-2 text-error hover:bg-error-container hover:text-on-error-container rounded-full"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    {expandedId === category.id ? <ChevronUp size={20} className="text-on-surface-variant" /> : <ChevronDown size={20} className="text-on-surface-variant" />}
                                </div>

                                <AnimatePresence>
                                    {expandedId === category.id && (
                                        <m.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="bg-surface-container/50 px-12 pb-4 overflow-hidden"
                                        >
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {category.subcategories.map(sub => (
                                                    <span key={sub} className="text-xs bg-surface-container-highest px-2 py-1 rounded-md text-on-surface-variant">
                                                        {sub}
                                                    </span>
                                                ))}
                                                {category.subcategories.length === 0 && (
                                                    <span className="text-xs text-on-surface-variant italic">No subcategories defined.</span>
                                                )}
                                            </div>
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
