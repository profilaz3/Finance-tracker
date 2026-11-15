import React from 'react';
import { m, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Repeat, Play, Pause, Calendar, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { AppState, Person, TransactionType, Currency, Category, RecurringTransaction } from '../../types';
import { getFrequencyLabel } from '../../utils/recurringUtils';
import { TRANSLATIONS } from '../../constants';
import { formatMoney, formatShortDate } from '../../utils/locale';
import { PeopleView } from '../PeopleView';
import { CategorySettings } from '../CategorySettings';
import { countDueRecurringTransactions, getRecurringStatus } from '../../utils/recurringSelectors';
import { useRecurringSettingsState } from './useRecurringSettingsState';
import { RecurringForm } from './RecurringForm';
import { localizeCategoryName } from '../../utils/systemText';
import { MOTION } from '../../config';
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
    const language = state.language;
    const recurringItems = state.recurringTransactions || [];
    const form = useRecurringSettingsState({
        baseCurrency: state.baseCurrency,
        categories: state.categories,
        accounts: state.accounts,
        recurringTransactions: recurringItems,
        language,
        onAddRecurring,
        onUpdateRecurring,
        onUpdated: () => onToast?.(t.recurringUpdated, 'success'),
    });

    if (activeTab === 'recurring') {
        const dueCount = countDueRecurringTransactions(recurringItems);
        const renderForm = (mode: 'new' | 'edit') => (
            <RecurringForm
                mode={mode}
                draft={form.draft}
                errors={form.errors}
                categories={state.categories}
                accounts={state.accounts}
                language={language}
                onName={form.setName}
                onAmountText={form.setAmountText}
                onType={form.setType}
                onFrequency={form.setFrequency}
                onCategory={form.setCategoryId}
                onAccount={form.setAccountId}
                onCurrency={form.setCurrency}
                onStartDate={form.setStartDate}
                onSubmit={form.submit}
                onCancel={form.close}
            />
        );

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
                        {onAddRecurring && (
                            <button
                                type="button"
                                onClick={form.openAdd}
                                aria-label={t.addRecurringTransaction}
                                title={t.addRecurringTransaction}
                                aria-expanded={form.target === 'new'}
                                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent"
                            >
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {form.target === 'new' && (
                        <m.div
                            key="new-recurring"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={MOTION.view.transition}
                            className="overflow-hidden"
                        >
                            <div className="paper-tile p-4">{renderForm('new')}</div>
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
                            const recurringStatus = getRecurringStatus(recurring, language);
                            const overdue = recurringStatus.isOverdue && recurring.isActive;
                            const dueToday = recurringStatus.isDueToday && recurring.isActive;
                            const divider = index < recurringItems.length - 1 && "border-b border-hair";

                            if (form.target === recurring.id) {
                                return (
                                    <div key={recurring.id} data-recurring-row data-editing="true" className={clsx("py-4", divider)}>
                                        {renderForm('edit')}
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={recurring.id}
                                    data-recurring-row
                                    data-paused={recurring.isActive ? undefined : 'true'}
                                    className={clsx("flex min-h-[72px] items-center gap-2", divider)}
                                >
                                    <button
                                        type="button"
                                        onClick={() => onUpdateRecurring && form.openEdit(recurring)}
                                        disabled={!onUpdateRecurring}
                                        className="-ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-[14px] py-2.5 pl-2 text-left transition-colors hover:bg-chip/60 disabled:cursor-default"
                                    >
                                        <span className={clsx(!recurring.isActive && "opacity-45")}>
                                            <CategoryGlyph category={category ?? { name: recurring.name, color: '#64748B' }} />
                                        </span>
                                        <span className={clsx("min-w-0 flex-1", !recurring.isActive && "opacity-55")}>
                                            {onUpdateRecurring && <span className="sr-only">{t.edit}: </span>}
                                            <span id={`recurring-title-${recurring.id}`} data-recurring-title className="block truncate text-[15px] font-semibold">{recurring.name}</span>
                                            <span className="block truncate text-[13px] text-muted">
                                                {getFrequencyLabel(recurring.frequency, language)} · {category ? localizeCategoryName(category, language) : t.unknown}
                                            </span>
                                            <span className={clsx(
                                                "mt-0.5 flex items-center gap-1 text-[12px]",
                                                overdue ? "font-semibold text-neg" : dueToday ? "font-semibold text-accent" : "text-faint"
                                            )}>
                                                {overdue ? <AlertCircle size={11} aria-hidden="true" /> : <Calendar size={11} aria-hidden="true" />}
                                                {formatShortDate(recurringStatus.nextDueDate, language)} · {recurringStatus.countdownText}
                                            </span>
                                        </span>
                                        <span className={clsx(
                                            "shrink-0 text-[15px] font-semibold tabular-nums",
                                            recurring.type === 'income' && "text-pos",
                                            !recurring.isActive && "opacity-55",
                                        )}>
                                            {recurring.type === 'income' ? '+' : '\u2212'}{formatMoney(Math.abs(recurring.amount), recurring.currency, language)}
                                        </span>
                                    </button>
                                    <div className="-mr-2 flex shrink-0 items-center">
                                        {onToggleRecurring && (
                                            <button
                                                type="button"
                                                onClick={() => onToggleRecurring(recurring.id)}
                                                data-recurring-action="toggle"
                                                aria-label={recurring.isActive ? t.pauseRecurring : t.resumeRecurring}
                                                aria-describedby={`recurring-title-${recurring.id}`}
                                                title={recurring.isActive ? t.pauseRecurring : t.resumeRecurring}
                                                className={clsx(
                                                    "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-chip",
                                                    recurring.isActive ? "text-muted" : "text-accent"
                                                )}
                                            >
                                                {recurring.isActive ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                                            </button>
                                        )}
                                        {onDeleteRecurring && (
                                            <button
                                                type="button"
                                                onClick={() => onDeleteRecurring(recurring.id)}
                                                data-recurring-action="delete"
                                                aria-label={t.deleteRecurring}
                                                aria-describedby={`recurring-title-${recurring.id}`}
                                                title={t.deleteRecurring}
                                                className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-chip hover:text-neg"
                                            >
                                                <Trash2 size={17} aria-hidden="true" />
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
                selfId={state.userProfile?.id}
            />
        );
    }

    if (activeTab === 'categories') {
        return (
            <div className="flex flex-col gap-4">
                <CleanupCard state={state} setState={setState} onToast={onToast} />
                <CategorySettings
                    categories={state.categories}
                    transactions={state.transactions}
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
