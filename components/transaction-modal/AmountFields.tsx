import React from 'react';
import clsx from 'clsx';
import { AlertCircle, Check, Sparkles } from 'lucide-react';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import { Account, Category, Currency, Transaction } from '../../types';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { parseRequiredNumberInput } from '../../utils/numberInput';

type FieldState = {
    error: string | null;
    touched: boolean;
    isValid: boolean;
};

interface AmountFieldsProps {
    edited: Transaction;
    setEdited: React.Dispatch<React.SetStateAction<Transaction | null>>;
    accounts: Account[];
    categories: Category[];
    amountInputRef: React.RefObject<HTMLInputElement | null>;
    targetAccountId: string;
    setTargetAccountId: (accountId: string) => void;
    validateOnBlur: (field: string, value: unknown) => boolean;
    getFieldState: (field: string) => FieldState;
    t: typeof TRANSLATIONS['en'];
    /** Shown beside the category label when the selection came from the user's habit. */
    usualHint?: string | null;
    /** The user chose a category themselves (habit suggestions stop). */
    onCategoryPicked?: () => void;
}

export const AmountFields: React.FC<AmountFieldsProps> = ({
    edited,
    setEdited,
    accounts,
    categories,
    amountInputRef,
    targetAccountId,
    setTargetAccountId,
    validateOnBlur,
    getFieldState,
    t,
    usualHint,
    onCategoryPicked
}) => {
    const isInternalTransfer = edited.categoryId === 'internal-transfer';
    const selectedCategory = categories.find(c => c.id === edited.categoryId);
    const chipCategories = categories.filter(
        c => c.id !== 'internal-transfer' && c.id !== 'debt-repayment' && c.id !== 'loan-repayment'
    );
    const amountState = getFieldState('amount');
    const accountState = getFieldState('accountId');

    return (
        <>
            <div className="flex gap-3 items-end">
                <div className="flex-1">
                    <label htmlFor="edit-tx-amount" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.amount}</label>
                    <input
                        ref={amountInputRef}
                        id="edit-tx-amount"
                        type="number"
                        inputMode="decimal"
                        value={edited.amount}
                        onChange={e => {
                            let val = e.target.value;
                            if (val.length > 1 && val.startsWith('0') && !val.includes('.')) {
                                val = val.replace(/^0+/, '');
                            }
                            setEdited(prev => ({ ...prev!, amount: parseRequiredNumberInput(val) }));
                        }}
                        onFocus={e => e.target.select()}
                        onBlur={() => validateOnBlur('amount', edited.amount)}
                        className={clsx(
                            "h-14 w-full rounded-[16px] bg-chip px-4 text-[28px] font-bold tracking-[-0.5px] text-on-surface outline-none transition-shadow",
                            amountState.error
                                ? 'ring-2 ring-neg'
                                : 'focus:ring-2 focus:ring-accent'
                        )}
                    />
                    {amountState.error && (
                        <div className="mt-1 flex items-center gap-1 px-1 text-[12px] text-neg">
                            <AlertCircle size={12} aria-hidden="true" />
                            <span>{amountState.error}</span>
                        </div>
                    )}
                </div>
                <div className="w-20">
                    <select
                        id="edit-tx-currency"
                        value={edited.currency}
                        onChange={e => setEdited({ ...edited, currency: e.target.value as Currency })}
                        className="h-14 w-full px-2 text-center text-[17px] font-semibold rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                    >
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2 px-1">
                    <label className="text-[13px] font-semibold text-muted">{t.category}</label>
                    {usualHint && (
                        <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                            <Sparkles size={11} aria-hidden="true" className="shrink-0" />
                            <span className="truncate">{usualHint}</span>
                        </span>
                    )}
                </div>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
                    {chipCategories.map(cat => {
                        const isSelected = edited.categoryId === cat.id;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => {
                                    onCategoryPicked?.();
                                    setEdited({ ...edited, categoryId: cat.id, type: cat.type, subcategory: '' });
                                }}
                                className={clsx(
                                    'flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full py-1 pl-1 pr-3.5 text-[14px] font-semibold transition-colors',
                                    isSelected ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface hover:bg-[var(--paper-tile)]'
                                )}
                            >
                                <CategoryGlyph category={cat} size={34} className="!rounded-full" />
                                {cat.name}
                                {isSelected && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                            </button>
                        );
                    })}
                </div>
                {categories.length > chipCategories.length && (
                    <select
                        id="edit-tx-category"
                        value={edited.categoryId}
                        onChange={e => {
                            onCategoryPicked?.();
                            const newCategory = categories.find(c => c.id === e.target.value);
                            setEdited({
                                ...edited,
                                categoryId: e.target.value,
                                type: newCategory ? newCategory.type : edited.type,
                                subcategory: ''
                            });
                        }}
                        className="mt-2 h-11 w-full px-4 text-[15px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                    >
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                )}
            </div>

            {selectedCategory?.subcategories && selectedCategory.subcategories.length > 0 && (
                <div>
                    <label htmlFor="edit-tx-subcategory" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.subcategory}</label>
                    <select
                        id="edit-tx-subcategory"
                        value={edited.subcategory || ''}
                        onChange={e => setEdited({ ...edited, subcategory: e.target.value })}
                        className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                    >
                        <option value="">{t.selectSubcategory}</option>
                        {selectedCategory.subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                    </select>
                </div>
            )}

            <div>
                <label htmlFor="edit-tx-account" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">
                    {isInternalTransfer ? t.fromAccount : t.account}
                </label>
                <select
                    id="edit-tx-account"
                    value={edited.accountId}
                    onChange={e => setEdited({ ...edited, accountId: e.target.value })}
                    onBlur={() => validateOnBlur('accountId', edited.accountId)}
                    className={clsx(
                        "h-12 w-full rounded-[14px] bg-chip px-4 text-[16px] text-on-surface outline-none transition-shadow",
                        accountState.error
                            ? 'ring-2 ring-neg'
                            : 'focus:ring-2 focus:ring-accent'
                    )}
                >
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
                {accountState.error && (
                    <div className="mt-1 flex items-center gap-1 px-1 text-[12px] text-neg">
                        <AlertCircle size={12} aria-hidden="true" />
                        <span>{accountState.error}</span>
                    </div>
                )}
            </div>

            {isInternalTransfer && (
                <div>
                    <label htmlFor="edit-tx-target-account" className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.toAccount}</label>
                    <select
                        id="edit-tx-target-account"
                        value={targetAccountId}
                        onChange={e => setTargetAccountId(e.target.value)}
                        className="h-12 w-full px-4 text-[16px] rounded-[14px] border-none bg-chip text-on-surface outline-none focus:ring-2 focus:ring-accent"
                    >
                        <option value="">{t.selectAccountPlaceholder}</option>
                        {accounts.filter(a => a.id !== edited.accountId).map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                        ))}
                    </select>
                </div>
            )}
        </>
    );
};
