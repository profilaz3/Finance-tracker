import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { AlertCircle, ArrowDownLeft, Check, ChevronDown, LayoutGrid, PenLine, Sparkles } from 'lucide-react';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import { MOTION } from '../../config';
import { Account, Category, Currency } from '../../types';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { AccountGlyph } from '../ui/AccountGlyph';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { AmountInput } from '../ui/AmountInput';
import { Segmented } from '../ui/Segmented';
import { localizeCategoryName, localizeSubcategory, localizeTransactionNote } from '../../utils/systemText';
import { formatCurrency } from '../../utils/formatters';
import { TRANSFER_CATEGORY_ID, type EntryKind } from '../../domain/transactions';
import type { EntryForm } from './useEntryForm';

interface AmountFieldsProps {
    form: EntryForm;
    accounts: Account[];
    categories: Category[];
    amountInputRef: React.RefObject<HTMLInputElement | null>;
    isNewTransaction: boolean;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
    /** Enter in the note field saves (the amount field's Enter moves to the note). */
    onSubmit: () => void;
}

/** Wallet pickers show tappable chips up to this many wallets, a select above it. */
const MAX_ACCOUNT_CHIPS = 4;

const FieldError: React.FC<{ id?: string; message: string | null }> = ({ id, message }) =>
    message ? (
        <div id={id} role="alert" className="mt-1 flex items-center gap-1 px-1 text-[12px] text-neg">
            <AlertCircle size={12} aria-hidden="true" />
            <span>{message}</span>
        </div>
    ) : null;

const AccountPicker: React.FC<{
    id: string;
    labelId: string;
    accounts: Account[];
    value: string;
    onChange: (accountId: string) => void;
    placeholder: string;
    invalid?: boolean;
}> = ({ id, labelId, accounts, value, onChange, placeholder, invalid }) => {
    const selected = accounts.find(account => account.id === value);
    if (accounts.length > 0 && accounts.length <= MAX_ACCOUNT_CHIPS) {
        return (
            <div id={id} role="group" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
                {accounts.map(account => {
                    const isSelected = account.id === value;
                    return (
                        <button
                            key={account.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => onChange(account.id)}
                            className={clsx(
                                'flex h-12 min-w-0 items-center gap-2.5 rounded-[16px] pl-1.5 pr-3 text-left text-[14px] font-semibold transition-colors',
                                isSelected
                                    ? 'bg-accent-soft text-on-surface shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]'
                                    : 'bg-chip text-on-surface',
                                invalid && !isSelected && 'shadow-[inset_0_0_0_1.5px_var(--paper-neg)]'
                            )}
                        >
                            <AccountGlyph account={account} size={36} />
                            <span className="min-w-0 flex-1 truncate">{account.name}</span>
                            {isSelected && <Check size={15} strokeWidth={3} aria-hidden="true" className="shrink-0 text-accent" />}
                        </button>
                    );
                })}
            </div>
        );
    }
    return (
        <div className="relative">
            {selected && (
                <span className="pointer-events-none absolute left-2.5 top-1/2 flex -translate-y-1/2">
                    <AccountGlyph account={selected} size={30} showCurrency={false} />
                </span>
            )}
            <select
                id={id}
                aria-labelledby={labelId}
                aria-invalid={invalid || undefined}
                value={value}
                onChange={e => onChange(e.target.value)}
                className={clsx(
                    'h-12 w-full rounded-[14px] bg-chip pr-4 text-[16px] text-on-surface outline-none transition-shadow',
                    selected ? 'pl-12' : 'pl-4',
                    invalid ? 'ring-2 ring-neg' : 'focus:ring-2 focus:ring-accent'
                )}
            >
                {!selected && <option value="">{placeholder}</option>}
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
        </div>
    );
};

export const AmountFields: React.FC<AmountFieldsProps> = ({
    form,
    accounts,
    categories,
    amountInputRef,
    isNewTransaction,
    language,
    t,
    onSubmit,
}) => {
    const { edited, kind, errors } = form;
    const [showAllCategories, setShowAllCategories] = useState(false);
    const chipRowRef = useRef<HTMLDivElement>(null);
    const isTransfer = kind === 'transfer';
    const selectedCategory = categories.find(c => c.id === edited.categoryId);
    // Only categories of the entry's own kind: picking one never turns an expense into income.
    // Repayment categories (debts with a person) stay in the full grid and show as a chip once chosen.
    const ofKind = categories.filter(c => c.type === edited.type && c.id !== TRANSFER_CATEGORY_ID);
    const chipCategories = ofKind.filter(c => !['debt-repayment', 'loan-repayment'].includes(c.id) || c.id === edited.categoryId);
    // A stored subcategory that is no longer in the list still shows, so it is not lost silently.
    const subcategories = isTransfer ? [] : [
        ...(selectedCategory?.subcategories ?? []),
        ...(edited.subcategory && !selectedCategory?.subcategories?.includes(edited.subcategory) ? [edited.subcategory] : []),
    ];
    const kindOptions: { value: EntryKind; label: string }[] = [
        { value: 'expense', label: t.expenseType },
        { value: 'income', label: t.incomeType },
        ...(isNewTransaction && accounts.length >= 2 ? [{ value: 'transfer' as const, label: t.transferType }] : []),
    ];

    // Keep the chosen chip in view (habit preselection or an existing entry far down the list).
    useEffect(() => {
        const row = chipRowRef.current;
        const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (!row || !chip) return;
        const left = chip.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollTo({ left: Math.max(0, left - 8) });
        }
    }, [edited.categoryId]);

    return (
        <>
            {(!isTransfer || isNewTransaction) && (
                <Segmented<EntryKind>
                    ariaLabel={t.entryType}
                    value={kind}
                    onChange={form.setKind}
                    options={kindOptions}
                />
            )}

            <div>
                <div
                    className={clsx(
                        'rounded-[24px] bg-chip px-4 pb-2 pt-3 transition-shadow',
                        errors.amount ? 'ring-2 ring-neg' : 'focus-within:ring-2 focus-within:ring-accent'
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <label htmlFor="edit-tx-amount" className="text-[13px] font-semibold text-muted">{t.amount}</label>
                        <span className="relative flex h-10 items-center gap-1.5 rounded-full bg-[var(--paper-tile)] pl-1.5 pr-2.5 shadow-[var(--paper-tile-shadow)]">
                            <CurrencyFlag currency={edited.currency} size={26} />
                            <span className="text-[14px] font-bold">{edited.currency}</span>
                            {/* A transfer is always in the From wallet's currency. */}
                            {!isTransfer && (
                                <>
                                    <ChevronDown size={14} aria-hidden="true" className="text-muted" />
                                    <select
                                        id="edit-tx-currency"
                                        aria-label={t.currency}
                                        value={edited.currency}
                                        onChange={e => form.pickCurrency(e.target.value as Currency)}
                                        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
                                    >
                                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </>
                            )}
                        </span>
                    </div>
                    <AmountInput
                        ref={amountInputRef}
                        id="edit-tx-amount"
                        language={language}
                        value={edited.amount}
                        emptyWhenZero
                        placeholder="0"
                        onValueChange={form.setAmount}
                        onBlur={form.touchAmount}
                        enterKeyHint="next"
                        onKeyDown={event => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            document.getElementById('edit-tx-note')?.focus();
                        }}
                        data-focus-ring="parent"
                        aria-invalid={!!errors.amount}
                        aria-describedby={errors.amount ? 'edit-tx-amount-error' : undefined}
                        className={clsx(
                            'h-[58px] w-full bg-transparent text-[44px] font-bold tabular-nums tracking-[-1.5px] outline-none placeholder:text-faint',
                            edited.type === 'income' && !isTransfer ? 'text-pos' : 'text-on-surface'
                        )}
                    />
                </div>
                <FieldError id="edit-tx-amount-error" message={errors.amount} />
            </div>

            {/* The note names the shop or purpose; a shop the person has a habit for picks the category. */}
            <div className="flex h-12 items-center gap-2.5 rounded-[14px] bg-chip px-4 transition-shadow focus-within:ring-2 focus-within:ring-accent">
                <PenLine size={16} aria-hidden="true" className="shrink-0 text-muted" />
                <label htmlFor="edit-tx-note" className="sr-only">{t.note}</label>
                {/* App-written notes ("Transfer from Cash") show in the app language; the stored text only changes when edited. */}
                <input
                    id="edit-tx-note"
                    data-focus-ring="parent"
                    value={localizeTransactionNote(edited.note, language) || ''}
                    onChange={e => form.setEdited(prev => ({ ...prev, note: e.target.value }))}
                    onKeyDown={event => {
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        onSubmit();
                    }}
                    placeholder={t.entryNotePlaceholder}
                    autoComplete="off"
                    enterKeyHint="done"
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-on-surface outline-none placeholder:text-faint"
                />
            </div>

            {!isTransfer && (
                <div>
                    <div className="mb-2 flex min-w-0 items-center justify-between gap-2 px-1">
                        <span id="edit-tx-category-label" className="text-[13px] font-semibold text-muted">{t.category}</span>
                        {form.usual && form.usual.categoryId === edited.categoryId && (
                            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                                <Sparkles size={11} aria-hidden="true" className="shrink-0" />
                                <span className="truncate">{t.usualCategory.replace('{merchant}', form.usual.merchant)}</span>
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            ref={chipRowRef}
                            role="group"
                            aria-labelledby="edit-tx-category-label"
                            className="-ml-1 flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 pl-1 pr-6 scrollbar-none [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]"
                        >
                            {chipCategories.map(cat => {
                                const isSelected = edited.categoryId === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => form.pickCategory(cat)}
                                        className={clsx(
                                            'flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full py-1 pl-1 pr-3.5 text-[14px] font-semibold transition-colors',
                                            isSelected ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface hover:bg-[var(--paper-tile)]'
                                        )}
                                    >
                                        <CategoryGlyph category={cat} size={34} className="!rounded-full" />
                                        {localizeCategoryName(cat, language)}
                                        {isSelected && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAllCategories(open => !open)}
                            aria-expanded={showAllCategories}
                            aria-controls="edit-tx-category-grid"
                            aria-label={t.categories}
                            className={clsx(
                                'mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
                                showAllCategories ? 'bg-on-surface text-[var(--paper-bg)]' : 'bg-chip text-muted'
                            )}
                        >
                            <LayoutGrid size={18} aria-hidden="true" />
                        </button>
                    </div>
                    <AnimatePresence initial={false}>
                        {showAllCategories && (
                            <m.div
                                id="edit-tx-category-grid"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={MOTION.sheet.spring}
                                className="overflow-hidden"
                            >
                                <div role="group" aria-label={t.categories} className="mt-2 grid grid-cols-3 gap-1 rounded-[22px] bg-chip p-1.5">
                                    {ofKind.map(cat => {
                                        const isSelected = edited.categoryId === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                aria-pressed={isSelected}
                                                onClick={() => {
                                                    form.pickCategory(cat);
                                                    setShowAllCategories(false);
                                                }}
                                                className={clsx(
                                                    'flex min-w-0 flex-col items-center gap-1 rounded-[16px] px-0.5 pb-1.5 pt-2 transition-colors',
                                                    isSelected ? 'bg-[var(--paper-tile)] shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]' : 'hover:bg-[var(--paper-tile)]'
                                                )}
                                            >
                                                <CategoryGlyph category={cat} size={38} />
                                                <span className="line-clamp-2 w-full break-words text-center text-[12px] font-semibold leading-[13px]">{localizeCategoryName(cat, language)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </m.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {subcategories.length > 0 && (
                <div>
                    <span id="edit-tx-subcategory-label" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.subcategory}</span>
                    <div
                        role="group"
                        aria-labelledby="edit-tx-subcategory-label"
                        className="-ml-1 flex gap-2 overflow-x-auto pb-1 pl-1 pr-6 scrollbar-none [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]"
                    >
                        {subcategories.map(sub => {
                            const isSelected = edited.subcategory === sub;
                            return (
                                <button
                                    key={sub}
                                    type="button"
                                    aria-pressed={isSelected}
                                    // Optional: tapping the chosen one again clears it.
                                    onClick={() => form.setEdited(prev => ({ ...prev, subcategory: prev.subcategory === sub ? '' : sub }))}
                                    className={clsx(
                                        'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors',
                                        isSelected
                                            ? 'bg-accent-soft text-on-surface shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]'
                                            : 'bg-chip text-on-surface'
                                    )}
                                >
                                    {localizeSubcategory(sub, language)}
                                    {isSelected && <Check size={13} strokeWidth={3} aria-hidden="true" className="text-accent" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div>
                <span id="edit-tx-account-label" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">
                    {isTransfer ? t.fromWallet : t.wallet}
                </span>
                <AccountPicker
                    id="edit-tx-account"
                    labelId="edit-tx-account-label"
                    accounts={accounts}
                    value={edited.accountId}
                    onChange={form.pickAccount}
                    placeholder={t.chooseWallet}
                    invalid={!!errors.account}
                />
                <FieldError message={errors.account} />
            </div>

            {isTransfer && (
                <div>
                    <span id="edit-tx-target-account-label" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.toWallet}</span>
                    <AccountPicker
                        id="edit-tx-target-account"
                        labelId="edit-tx-target-account-label"
                        accounts={accounts.filter(a => a.id !== edited.accountId || a.id === form.targetAccountId)}
                        value={form.targetAccountId}
                        onChange={form.pickTarget}
                        placeholder={t.chooseToWallet}
                        invalid={!!errors.target}
                    />
                    <FieldError message={errors.target} />
                    {form.arrival && (
                        <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[13px] text-muted">
                            <ArrowDownLeft size={14} aria-hidden="true" className="shrink-0" />
                            <span>
                                {t.transferArrives
                                    .replace('{wallet}', form.arrival.account.name)
                                    .replace('{amount}', formatCurrency(form.arrival.amount, form.arrival.account.currency, language))}
                            </span>
                        </p>
                    )}
                </div>
            )}
        </>
    );
};
