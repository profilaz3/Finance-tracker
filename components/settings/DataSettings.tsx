import React from 'react';
import { m, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Repeat, Play, Pause, Calendar, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { AppState, Person, TransactionType, Currency, Category, RecurringTransaction, RecurrenceFrequency } from '../../types';
import { getFrequencyLabel } from '../../utils/recurringUtils';
import { TRANSLATIONS } from '../../constants';
import { formatMoney, formatShortDate } from '../../utils/locale';
import { PeopleView } from '../PeopleView';
import { CategorySettings } from '../CategorySettings';
import { countDueRecurringTransactions, getRecurringStatus } from '../../utils/recurringSelectors';
import { useRecurringSettingsState } from './useRecurringSettingsState';
import { Segmented } from '../ui/Segmented';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { CleanupCard } from '../cleanup/CleanupCard';

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
    onToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning', action?: { label: string; onClick: () => void }) => void;
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
    onSettleUp,
    onToast
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
        const recurringItems = state.recurringTransactions || [];

        return (
            <section className="flex flex-col gap-3" aria-label={t.recurringTransactions}>
                <div className="flex items-center justify-between gap-2 px-1">
                    <h3 className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-wide text-faint">{t.recurringTransactions}</h3>
                    <div className="flex shrink-0 items-center gap-2">
                        {onProcessRecurring && dueCount > 0 && (
                            <button
                                type="button"
                                onClick={onProcessRecurring}
                                className="flex h-10 items-center gap-1.5 rounded-full bg-chip px-4 text-[14px] font-semibold"
                            >
                                <Play size={14} fill="currentColor" aria-hidden="true" />
                                {t.processDueRecurring.replace('{count}', String(dueCount))}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsAddingRecurring(true)}
                            aria-label={t.addRecurringTransaction}
                            title={t.addRecurringTransaction}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent"
                        >
                            <Plus size={20} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <AnimatePresence>
                    {isAddingRecurring && (
                        <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="paper-tile flex flex-col gap-3 p-4">
                                <Segmented<TransactionType>
                                    ariaLabel={t.transactionType}
                                    value={newRecurringType}
                                    onChange={setNewRecurringType}
                                    options={[
                                        { value: 'expense', label: t.expense },
                                        { value: 'income', label: t.income },
                                    ]}
                                />
                                <input
                                    type="text"
                                    value={newRecurringName}
                                    onChange={(e) => setNewRecurringName(e.target.value)}
                                    placeholder={t.recurringNamePlaceholder}
                                    className="h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={newRecurringAmount}
                                        onChange={(e) => setNewRecurringAmount(e.target.value)}
                                        placeholder={t.amount}
                                        className="h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint"
                                    />
                                    <select
                                        value={newRecurringFrequency}
                                        onChange={(e) => setNewRecurringFrequency(e.target.value as RecurrenceFrequency)}
                                        aria-label={t.repeat}
                                        className="h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint"
                                    >
                                        <option value="daily">{t.daily}</option>
                                        <option value="weekly">{t.weekly}</option>
                                        <option value="biweekly">{t.biweekly}</option>
                                        <option value="monthly">{t.monthly}</option>
                                        <option value="yearly">{t.yearly}</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <select
                                        value={newRecurringCategoryId}
                                        onChange={(e) => setNewRecurringCategoryId(e.target.value)}
                                        aria-label={t.category}
                                        className="h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint"
                                    >
                                        <option value="">{t.category}</option>
                                        {state.categories.filter(c => c.type === newRecurringType).map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={newRecurringAccountId}
                                        onChange={(e) => setNewRecurringAccountId(e.target.value)}
                                        aria-label={t.account}
                                        className="h-12 w-full rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint"
                                    >
                                        <option value="">{t.account}</option>
                                        {state.accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <label className="flex items-center gap-3 rounded-[14px] bg-chip pl-4">
                                    <Calendar size={18} className="shrink-0 text-muted" aria-hidden="true" />
                                    <span className="shrink-0 text-[14px] text-muted">{t.startsOn}</span>
                                    <input
                                        type="date"
                                        value={newRecurringStartDate}
                                        onChange={(e) => setNewRecurringStartDate(e.target.value)}
                                        className="h-12 min-w-0 flex-1 border-none bg-transparent px-2 text-[16px]"
                                    />
                                </label>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={resetRecurringForm}
                                        className="h-10 rounded-full px-4 text-[14px] font-semibold text-muted hover:bg-chip"
                                    >
                                        {t.cancel}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateRecurring}
                                        disabled={!newRecurringName.trim() || !newRecurringAmount}
                                        className="h-10 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent disabled:opacity-40"
                                    >
                                        {t.add}
                                    </button>
                                </div>
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>

                {recurringItems.length === 0 ? (
                    <div className="paper-tile flex flex-col items-center gap-2 px-6 py-10 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent-soft text-accent" aria-hidden="true">
                            <Repeat size={26} />
                        </span>
                        <p className="text-[16px] font-bold">{t.noRecurringTransactions}</p>
                        <p className="max-w-[280px] text-[13px] text-muted">{t.noRecurringTransactionsHint}</p>
                    </div>
                ) : (
                    <div className="paper-tile px-4 py-1">
                        {recurringItems.map((recurring, index) => {
                            const category = state.categories.find(c => c.id === recurring.categoryId);
                            const recurringStatus = getRecurringStatus(recurring, state.language);
                            const overdue = recurringStatus.isOverdue && recurring.isActive;
                            const dueToday = recurringStatus.isDueToday && recurring.isActive;

                            return (
                                <div
                                    key={recurring.id}
                                    data-recurring-row
                                    data-paused={recurring.isActive ? undefined : 'true'}
                                    className={clsx(
                                        "flex min-h-[72px] items-center gap-3 py-2.5",
                                        index < recurringItems.length - 1 && "border-b border-hair",
                                    )}
                                >
                                    <span className={clsx(!recurring.isActive && "opacity-45")}>
                                        <CategoryGlyph category={category ?? { name: recurring.name, color: '#64748B' }} />
                                    </span>
                                    <div className={clsx("min-w-0 flex-1", !recurring.isActive && "opacity-55")}>
                                        <p data-recurring-title className="truncate text-[15px] font-semibold">{recurring.name}</p>
                                        <p className="truncate text-[13px] text-muted">
                                            {getFrequencyLabel(recurring.frequency, state.language)} · {category?.name || t.unknown}
                                        </p>
                                        <p className={clsx(
                                            "mt-0.5 flex items-center gap-1 text-[12px]",
                                            overdue ? "font-semibold text-neg" : dueToday ? "font-semibold text-accent" : "text-faint"
                                        )}>
                                            {overdue ? <AlertCircle size={11} aria-hidden="true" /> : <Calendar size={11} aria-hidden="true" />}
                                            {formatShortDate(recurringStatus.nextDueDate, state.language)} · {recurringStatus.countdownText}
                                        </p>
                                    </div>
                                    <p className={clsx(
                                        "shrink-0 text-[15px] font-semibold",
                                        recurring.type === 'income' && "text-pos",
                                        !recurring.isActive && "opacity-55",
                                    )}>
                                        {recurring.type === 'income' ? '+' : '-'}{formatMoney(recurring.amount, recurring.currency, state.language)}
                                    </p>
                                    <div className="-mr-1.5 flex shrink-0 items-center">
                                        {onToggleRecurring && (
                                            <button
                                                type="button"
                                                onClick={() => onToggleRecurring(recurring.id)}
                                                aria-label={recurring.isActive ? t.pauseRecurring : t.resumeRecurring}
                                                title={recurring.isActive ? t.pauseRecurring : t.resumeRecurring}
                                                className={clsx(
                                                    "flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-chip",
                                                    recurring.isActive ? "text-muted" : "text-accent"
                                                )}
                                            >
                                                {recurring.isActive ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                                            </button>
                                        )}
                                        {onDeleteRecurring && (
                                            <button
                                                type="button"
                                                onClick={() => onDeleteRecurring(recurring.id)}
                                                aria-label={t.deleteRecurring}
                                                title={t.deleteRecurring}
                                                className="flex h-9 w-9 items-center justify-center rounded-full text-faint transition-colors hover:bg-chip hover:text-neg"
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        );
    }

    if (activeTab === 'people') {
        return (
            <PeopleView
                people={state.people}
                onAddPerson={() => setIsAddPersonModalOpen(true)}
                onSelectPerson={setSelectedPerson}
                onAddTransaction={handleOpenAddTransaction}
                onSettleUp={onSettleUp}
                baseCurrency={state.baseCurrency}
                rates={state.rates}
                language={state.language}
                embedded
            />
        );
    }

    if (activeTab === 'categories') {
        return (
            <div className="flex flex-col gap-4">
                <CleanupCard state={state} setState={setState} onToast={onToast} />
                <CategorySettings
                    categories={state.categories}
                    onAddCategory={onAddCategory}
                    onUpdateCategory={onUpdateCategory}
                    onDeleteCategory={onDeleteCategory}
                    language={state.language}
                />
            </div>
        );
    }

    return null;
};
