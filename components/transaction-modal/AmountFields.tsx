import React from 'react';
import clsx from 'clsx';
import { AlertCircle, Check } from 'lucide-react';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import { Account, Category, Currency, Transaction } from '../../types';
import { getContrastText } from '../../utils/colorUtils';
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
    t
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
                    <label htmlFor="edit-tx-amount" className="text-xs text-on-surface-variant mb-1 block">{t.amount}</label>
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
                            "w-full bg-surface-container rounded-xl px-4 py-3 text-2xl font-semibold text-on-surface transition-all",
                            amountState.error
                                ? 'border-2 border-error ring-2 ring-error/20'
                                : 'border border-outline-variant/30 focus:border-primary focus:ring-2 focus:ring-primary/20'
                        )}
                    />
                    {amountState.error && (
                        <div className="flex items-center gap-1 mt-1 text-error text-xs">
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
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-2 py-3 text-lg font-medium text-on-surface text-center"
                    >
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <label className="text-xs text-on-surface-variant mb-2 block">{t.category}</label>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
                    {chipCategories.map(cat => {
                        const isSelected = edited.categoryId === cat.id;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setEdited({ ...edited, categoryId: cat.id, type: cat.type, subcategory: '' })}
                                className={clsx(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap min-h-[40px] shrink-0",
                                    isSelected
                                        ? 'ring-2 ring-offset-1 ring-offset-surface-container-high scale-[1.02]'
                                        : 'opacity-60 sm:opacity-70 hover:opacity-100 active:scale-95'
                                )}
                                style={{
                                    backgroundColor: isSelected ? cat.color : `${cat.color}18`,
                                    color: isSelected ? getContrastText(cat.color) : cat.color,
                                    borderColor: cat.color,
                                    ['--tw-ring-color' as string]: cat.color,
                                }}
                            >
                                {isSelected && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                                {cat.name}
                            </button>
                        );
                    })}
                </div>
                {categories.length > chipCategories.length && (
                    <select
                        id="edit-tx-category"
                        value={edited.categoryId}
                        onChange={e => {
                            const newCategory = categories.find(c => c.id === e.target.value);
                            setEdited({
                                ...edited,
                                categoryId: e.target.value,
                                type: newCategory ? newCategory.type : edited.type,
                                subcategory: ''
                            });
                        }}
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2 text-sm text-on-surface mt-2"
                    >
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                )}
            </div>

            {selectedCategory?.subcategories && selectedCategory.subcategories.length > 0 && (
                <div>
                    <label htmlFor="edit-tx-subcategory" className="text-xs text-on-surface-variant mb-1 block">{t.subcategory}</label>
                    <select
                        id="edit-tx-subcategory"
                        value={edited.subcategory || ''}
                        onChange={e => setEdited({ ...edited, subcategory: e.target.value })}
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
                    >
                        <option value="">{t.selectSubcategory}</option>
                        {selectedCategory.subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                    </select>
                </div>
            )}

            <div>
                <label htmlFor="edit-tx-account" className="text-xs text-on-surface-variant mb-1 block">
                    {isInternalTransfer ? t.fromAccount : t.account}
                </label>
                <select
                    id="edit-tx-account"
                    value={edited.accountId}
                    onChange={e => setEdited({ ...edited, accountId: e.target.value })}
                    onBlur={() => validateOnBlur('accountId', edited.accountId)}
                    className={clsx(
                        "w-full bg-surface-container rounded-xl px-4 py-2.5 text-on-surface transition-all",
                        accountState.error
                            ? 'border-2 border-error ring-2 ring-error/20'
                            : 'border border-outline-variant/30'
                    )}
                >
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
                {accountState.error && (
                    <div className="flex items-center gap-1 mt-1 text-error text-xs">
                        <AlertCircle size={12} aria-hidden="true" />
                        <span>{accountState.error}</span>
                    </div>
                )}
            </div>

            {isInternalTransfer && (
                <div>
                    <label htmlFor="edit-tx-target-account" className="text-xs text-on-surface-variant mb-1 block">{t.toAccount}</label>
                    <select
                        id="edit-tx-target-account"
                        value={targetAccountId}
                        onChange={e => setTargetAccountId(e.target.value)}
                        className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-on-surface"
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
