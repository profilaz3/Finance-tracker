import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Plus, Trash2, RefreshCw, Play, Pause, Calendar, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { AppState, Person, TransactionType, Currency, Category, RecurringTransaction, RecurrenceFrequency } from '../../types';
import { getFrequencyLabel } from '../../utils/recurringUtils';
import { TRANSLATIONS } from '../../constants';
import { formatMoney, formatShortDate } from '../../utils/locale';
import { PeopleView } from '../PeopleView';
import { CategorySettings } from '../CategorySettings';
import { countDueRecurringTransactions, getRecurringStatus } from '../../utils/recurringSelectors';
import { useRecurringSettingsState } from './useRecurringSettingsState';

interface DataSettingsProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
    activeTab: 'recurring' | 'people' | 'categories';
    setIsAddPersonModalOpen: (isOpen: boolean) => void;
    setSelectedPerson: (person: Person | null) => void;
    handleOpenAddTransaction: (type?: TransactionType, personId?: string) => void;
    onAddCategory: (category: Category) => void;
    onUpdateCategory: (category: Category) => void;
    onDeleteCategory: (id: string) => void;
    onAddRecurring?: (recurring: RecurringTransaction) => void;
    onUpdateRecurring?: (id: string, updates: Partial<RecurringTransaction>) => void;
    onDeleteRecurring?: (id: string) => void;
    onToggleRecurring?: (id: string) => void;
    onProcessRecurring?: () => void;
    onSettleUp?: (personId: string, currency: Currency) => void;
}

export const DataSettings: React.FC<DataSettingsProps> = ({
    state,
    setState,
    activeTab,
    setIsAddPersonModalOpen,
    setSelectedPerson,
    handleOpenAddTransaction,
    onAddCategory,
    onUpdateCategory,
    onDeleteCategory,
    onAddRecurring,
    onUpdateRecurring,
    onDeleteRecurring,
    onToggleRecurring,
    onProcessRecurring,
    onSettleUp
}) => {
    const t = TRANSLATIONS[state.language];
    const {
        isAddingRecurring,
        setIsAddingRecurring,
        newRecurringName,
        setNewRecurringName,
        newRecurringAmount,
        setNewRecurringAmount,
        newRecurringFrequency,
        setNewRecurringFrequency,
        newRecurringType,
        setNewRecurringType,
        newRecurringCategoryId,
        setNewRecurringCategoryId,
        newRecurringAccountId,
        setNewRecurringAccountId,
        newRecurringStartDate,
        setNewRecurringStartDate,
        handleCreateRecurring,
        resetRecurringForm,
    } = useRecurringSettingsState({
        baseCurrency: state.baseCurrency,
        categories: state.categories,
        accounts: state.accounts,
        onAddRecurring,
    });

    if (activeTab === 'recurring') {
        const dueCount = countDueRecurringTransactions(state.recurringTransactions || []);

        return (
            <div className="space-y-6">
                <section className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium text-on-surface flex items-center gap-2">
                            <RefreshCw size={20} />
                            {t.recurringTransactions}
                        </h3>
                        <div className="flex items-center gap-2">
                            {onProcessRecurring && dueCount > 0 && (
                                <button
                                    onClick={onProcessRecurring}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-tertiary text-on-tertiary rounded-full text-sm font-medium hover:bg-tertiary/90 transition-colors"
                                >
                                    <Play size={14} fill="currentColor" />
                                    {t.processDueRecurring.replace('{count}', String(dueCount))}
                                </button>
                            )}
                            <button
                                onClick={() => setIsAddingRecurring(true)}
                                aria-label={t.addRecurringTransaction}
                                title={t.addRecurringTransaction}
                                className="p-2 bg-primary text-on-primary rounded-full hover:bg-primary/90 transition-colors"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {isAddingRecurring && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="bg-surface-container-low p-4 rounded-xl space-y-4">
                                    <input
                                        type="text"
                                        value={newRecurringName}
                                        onChange={(e) => setNewRecurringName(e.target.value)}
                                        placeholder={t.recurringNamePlaceholder}
                                        className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface placeholder-on-surface-variant/60"
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <input
                                            type="number"
                                            value={newRecurringAmount}
                                            onChange={(e) => setNewRecurringAmount(e.target.value)}
                                            placeholder={t.amount}
                                            className="bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface placeholder-on-surface-variant/60"
                                        />
                                        <select
                                            value={newRecurringFrequency}
                                            onChange={(e) => setNewRecurringFrequency(e.target.value as RecurrenceFrequency)}
                                            className="bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface"
                                        >
                                            <option value="daily">{t.daily}</option>
                                            <option value="weekly">{t.weekly}</option>
                                            <option value="biweekly">{t.biweekly}</option>
                                            <option value="monthly">{t.monthly}</option>
                                            <option value="yearly">{t.yearly}</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select
                                            value={newRecurringType}
                                            onChange={(e) => setNewRecurringType(e.target.value as TransactionType)}
                                            className="bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface"
                                        >
                                            <option value="expense">{t.expense}</option>
                                            <option value="income">{t.income}</option>
                                        </select>
                                        <select
                                            value={newRecurringCategoryId}
                                            onChange={(e) => setNewRecurringCategoryId(e.target.value)}
                                            className="bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface"
                                        >
                                            <option value="">{t.category}</option>
                                            {state.categories.filter(c => c.type === newRecurringType).map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <select
                                        value={newRecurringAccountId}
                                        onChange={(e) => setNewRecurringAccountId(e.target.value)}
                                        className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface"
                                    >
                                        <option value="">{t.account}</option>
                                        {state.accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                                        ))}
                                    </select>
                                    <div className="flex items-center gap-2">
                                        <Calendar size={18} className="text-on-surface-variant" />
                                        <span className="text-sm text-on-surface-variant">{t.startsOn}</span>
                                        <input
                                            type="date"
                                            value={newRecurringStartDate}
                                            onChange={(e) => setNewRecurringStartDate(e.target.value)}
                                            className="flex-1 bg-surface-container border-none rounded-lg px-4 py-2 text-on-surface"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={resetRecurringForm}
                                            className="px-4 py-2 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
                                        >
                                            {t.cancel}
                                        </button>
                                        <button
                                            onClick={handleCreateRecurring}
                                            disabled={!newRecurringName.trim() || !newRecurringAmount}
                                            className="px-4 py-2 bg-primary text-on-primary rounded-lg disabled:opacity-50 transition-colors"
                                        >
                                            {t.add}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="space-y-2">
                        {(!state.recurringTransactions || state.recurringTransactions.length === 0) ? (
                            <div className="text-center py-12 text-on-surface-variant/60">
                                <RefreshCw size={48} className="mx-auto mb-4 opacity-30" />
                                <p className="text-sm">{t.noRecurringTransactions}</p>
                                <p className="text-xs mt-1">{t.noRecurringTransactionsHint}</p>
                            </div>
                        ) : (
                            state.recurringTransactions.map(recurring => {
                                const category = state.categories.find(c => c.id === recurring.categoryId);
                                const recurringStatus = getRecurringStatus(recurring, state.language);

                                return (
                                    <motion.div
                                        key={recurring.id}
                                        layout
                                        className={clsx(
                                            "bg-surface-container-low p-4 rounded-xl flex items-center gap-4",
                                            !recurring.isActive && "opacity-50"
                                        )}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{
                                                backgroundColor: category?.color ? `${category.color}30` : '#80808030',
                                                color: category?.color || '#808080'
                                            }}
                                        >
                                            <RefreshCw size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-on-surface truncate">{recurring.name}</p>
                                            <p className="text-xs text-on-surface-variant">
                                                {getFrequencyLabel(recurring.frequency, state.language)} - {category?.name || t.unknown}
                                            </p>
                                            <p className={clsx(
                                                "text-xs flex items-center gap-1 mt-0.5",
                                                recurringStatus.isOverdue && recurring.isActive ? "text-error font-medium" :
                                                    recurringStatus.isDueToday && recurring.isActive ? "text-warning font-medium" :
                                                        "text-on-surface-variant/60"
                                            )}>
                                                {recurringStatus.isOverdue && recurring.isActive ? <AlertCircle size={10} /> : <Calendar size={10} />}
                                                {formatShortDate(recurringStatus.nextDueDate, state.language)} ({recurringStatus.countdownText})
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className={clsx(
                                                "font-semibold",
                                                recurring.type === 'income' ? "text-tertiary" : "text-on-surface"
                                            )}>
                                                {recurring.type === 'income' ? '+' : '-'}{formatMoney(recurring.amount, recurring.currency, state.language)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {onToggleRecurring && (
                                                <button
                                                    onClick={() => onToggleRecurring(recurring.id)}
                                                    aria-label={recurring.isActive ? t.pauseRecurring : t.resumeRecurring}
                                                    title={recurring.isActive ? t.pauseRecurring : t.resumeRecurring}
                                                    className={clsx(
                                                        "p-2 rounded-lg transition-colors",
                                                        recurring.isActive ? "text-tertiary hover:bg-tertiary/10" : "text-on-surface-variant hover:bg-surface-container"
                                                    )}
                                                >
                                                    {recurring.isActive ? <Pause size={16} /> : <Play size={16} />}
                                                </button>
                                            )}
                                            {onDeleteRecurring && (
                                                <button
                                                    onClick={() => onDeleteRecurring(recurring.id)}
                                                    aria-label={t.deleteRecurring}
                                                    title={t.deleteRecurring}
                                                    className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </section>
            </div>
        );
    }

    if (activeTab === 'people') {
        return (
            <div className="space-y-8">
                <section className="space-y-4">
                    <h3 className="text-lg font-medium text-on-surface flex items-center gap-2"><User size={20} /> {t.people}</h3>
                    <div className="bg-surface-container-low rounded-xl shadow-elevation-1">
                        <PeopleView
                            people={state.people}
                            onAddPerson={() => setIsAddPersonModalOpen(true)}
                            onSelectPerson={setSelectedPerson}
                            onAddTransaction={handleOpenAddTransaction}
                            onSettleUp={onSettleUp}
                            baseCurrency={state.baseCurrency}
                            rates={state.rates}
                            language={state.language}
                        />
                    </div>
                </section>
            </div>
        );
    }

    if (activeTab === 'categories') {
        return (
            <div className="space-y-8">
                <section className="space-y-4">
                    <CategorySettings
                        categories={state.categories}
                        onAddCategory={onAddCategory}
                        onUpdateCategory={onUpdateCategory}
                        onDeleteCategory={onDeleteCategory}
                        language={state.language}
                    />
                </section>
            </div>
        );
    }

    return null;
};
