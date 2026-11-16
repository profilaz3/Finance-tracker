import React, { useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, ChevronDown, PenLine, Sparkles, X } from 'lucide-react';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import type { Category, Currency, ExchangeRates, HomeHeaderTone } from '../../types';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { AmountInput } from '../ui/AmountInput';
import { Segmented } from '../ui/Segmented';
import { HeroIconButton, ON_COLOUR } from '../ui/ScreenHero';
import { fitFont } from '../home/parts';
import { localizeCategoryName, localizeTransactionNote } from '../../utils/systemText';
import { formatMoney, getIntlLocale } from '../../utils/locale';
import { formatAmountForInput } from '../../utils/numberInput';
import { hasAmountOperator, parseAmountExpression } from '../../utils/amountExpression';
import { convertAmount } from '../../services/currencyService';
import type { EntryKind } from '../../domain/transactions';
import type { useSheetDrag } from '../../hooks/useSheetDrag';
import type { EntryForm } from './useEntryForm';
import type { EntryStrings } from './entryStrings';

interface AmountFieldsProps {
    form: EntryForm;
    categories: Category[];
    amountInputRef: React.RefObject<HTMLInputElement | null>;
    isNewTransaction: boolean;
    /** At least two wallets: a new entry can be a transfer. */
    canTransfer: boolean;
    title: string;
    tone: HomeHeaderTone;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
    s: EntryStrings;
    rates?: ExchangeRates;
    /** The app's keypad types the amount (touch screens): the phone keyboard stays closed. */
    keypad: boolean;
    onClose: () => void;
    onAmountFocus: () => void;
    onNoteFocus: () => void;
    /** Enter in the note field saves (the amount field's Enter moves to the note). */
    onSubmit: () => void;
    /** Drag-to-close handle props. */
    handleProps: ReturnType<typeof useSheetDrag>['handleProps'];
}

const money = (amount: number, currency: Currency, language: 'en' | 'sr') => {
    const digits = currency === 'RSD' && Number.isInteger(amount) ? 0 : 2;
    return formatMoney(amount, currency, language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

/**
 * The top of the entry form, in the Home header colour: expense, income or transfer, the amount
 * (a short sum works too) with its currency and what it comes to in euros or dinars, the note
 * and the category the note's shop usually goes to.
 */
export const AmountFields: React.FC<AmountFieldsProps> = ({
    form,
    categories,
    amountInputRef,
    isNewTransaction,
    canTransfer,
    title,
    tone,
    language,
    t,
    s,
    rates,
    keypad,
    onClose,
    onAmountFocus,
    onNoteFocus,
    onSubmit,
    handleProps,
}) => {
    const { edited, kind, errors } = form;
    const isTransfer = kind === 'transfer';
    const showKinds = !isTransfer || isNewTransaction;
    const [typed, setTyped] = useState('');
    // The text in the field: a sum as typed, otherwise the amount (so outside changes show too).
    const text = hasAmountOperator(typed) && parseAmountExpression(typed, language) === edited.amount
        ? typed
        : edited.amount > 0 ? formatAmountForInput(edited.amount, language) : '';
    const kindOptions: { value: EntryKind; label: string }[] = [
        { value: 'expense', label: t.expenseType },
        { value: 'income', label: t.incomeType },
        ...(isNewTransaction && canTransfer ? [{ value: 'transfer' as const, label: t.transferType }] : []),
    ];
    const usualCategory = form.usual && form.usual.categoryId === edited.categoryId
        ? categories.find(category => category.id === form.usual?.categoryId)
        : undefined;

    // What the amount comes to: the sum, what a transfer's To wallet gets, or euros / dinars.
    const facts: string[] = [];
    if (edited.amount > 0) {
        if (hasAmountOperator(text)) facts.push(`= ${money(edited.amount, edited.currency, language)}`);
        if (form.arrival) {
            facts.push(t.transferArrives
                .replace('{wallet}', form.arrival.account.name)
                .replace('{amount}', money(form.arrival.amount, form.arrival.account.currency, language)));
        } else if (rates && !isTransfer) {
            const other: Currency = edited.currency === 'RSD' ? 'EUR' : 'RSD';
            const converted = Math.round(convertAmount(edited.amount, edited.currency, other, rates) * 100) / 100;
            facts.push(s.about.replace('{amount}', money(other === 'RSD' ? Math.round(converted) : converted, other, language)));
            const [year, month, day] = (rates.provider === 'nbs' ? rates.listDate ?? '' : '').split('-').map(Number);
            if (year && month && day) {
                const date = new Intl.DateTimeFormat(getIntlLocale(language), { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, day));
                facts.push(s.nbsRate.replace('{date}', date));
            }
        }
    }

    return (
        <section className={clsx('hero-bg relative px-4 pb-5', tone === 'dark' && 'hero-dark')}>
            <div className="touch-none pb-3 pt-2 md:pb-0 md:pt-4" {...handleProps}>
                <div className="mx-auto h-[5px] w-9 rounded-full bg-white/30 md:hidden" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2.5">
                <h3
                    id="edit-transaction-title"
                    className={showKinds ? 'sr-only' : 'min-w-0 flex-1 truncate pl-1 text-[19px] font-semibold text-white'}
                >
                    {title}
                </h3>
                {showKinds && (
                    <Segmented<EntryKind>
                        ariaLabel={t.entryType}
                        value={kind}
                        onChange={form.setKind}
                        options={kindOptions}
                        tone="hero"
                        size="lg"
                        className="min-w-0 flex-1"
                    />
                )}
                <HeroIconButton icon={X} label={t.close} onClick={onClose} />
            </div>

            <div className="mt-4 flex items-center gap-3">
                <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
                    <label htmlFor="edit-tx-amount" className="sr-only">{t.amount}</label>
                    <AmountInput
                        ref={amountInputRef}
                        id="edit-tx-amount"
                        language={language}
                        value={edited.amount}
                        emptyWhenZero
                        parse={parseAmountExpression}
                        inputMode={keypad ? 'none' : 'decimal'}
                        placeholder="0"
                        onValueChange={form.setAmount}
                        onInput={event => setTyped(event.currentTarget.value)}
                        onFocus={onAmountFocus}
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
                        className="h-[66px] w-full bg-transparent font-bold tabular-nums text-white caret-white outline-none placeholder:text-white/40"
                        style={{ fontSize: fitFont(58, text || '0', 0.62), letterSpacing: '-0.045em' }}
                    />
                </div>
                <span className={clsx(ON_COLOUR, 'relative flex h-10 shrink-0 items-center gap-1.5 rounded-full pl-1.5 text-white', isTransfer ? 'pr-3' : 'pr-2.5')}>
                    <CurrencyFlag currency={edited.currency} size={26} />
                    <span className="text-[14px] font-bold">{edited.currency}</span>
                    {/* A transfer is always in the From wallet's currency. */}
                    {!isTransfer && (
                        <>
                            <ChevronDown size={15} aria-hidden="true" className="text-white/65" />
                            <select
                                id="edit-tx-currency"
                                aria-label={t.currency}
                                value={edited.currency}
                                onChange={event => form.pickCurrency(event.target.value as Currency)}
                                className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
                            >
                                {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                            </select>
                        </>
                    )}
                </span>
            </div>
            {errors.amount ? (
                <p id="edit-tx-amount-error" role="alert" className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-2.5 py-1 text-[13px] font-semibold text-white">
                    <AlertCircle size={14} aria-hidden="true" className="shrink-0" />
                    {errors.amount}
                </p>
            ) : (
                <p className="min-h-5 break-words text-[13.5px] font-medium tabular-nums text-white/65">{facts.join(' · ')}</p>
            )}

            {/* The note names the shop or purpose; a shop the person has a habit for picks the category. */}
            <div className={clsx(ON_COLOUR, 'mt-4 flex h-[52px] items-center gap-2.5 rounded-[16px] px-4 focus-within:ring-2 focus-within:ring-white/70')}>
                <PenLine size={17} aria-hidden="true" className="shrink-0 text-white/60" />
                <label htmlFor="edit-tx-note" className="sr-only">{t.note}</label>
                {/* App-written notes ("Transfer from Cash") show in the app language; the stored text only changes when edited. */}
                <input
                    id="edit-tx-note"
                    data-focus-ring="parent"
                    value={localizeTransactionNote(edited.note, language) || ''}
                    onChange={event => form.setEdited(prev => ({ ...prev, note: event.target.value }))}
                    onFocus={onNoteFocus}
                    onKeyDown={event => {
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        onSubmit();
                    }}
                    placeholder={t.entryNotePlaceholder}
                    autoComplete="off"
                    enterKeyHint="done"
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-white caret-white outline-none placeholder:text-white/55"
                />
            </div>
            {usualCategory && form.usual && (
                <p className="mt-2.5 inline-flex h-8 max-w-full items-center gap-1.5 rounded-full bg-white/[0.16] px-3 text-[13px] font-semibold text-white/80">
                    <Sparkles size={14} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">
                        {t.usualCategory.replace('{merchant}', form.usual.merchant)}: <b className="font-semibold text-white">{localizeCategoryName(usualCategory, language)}</b>
                    </span>
                </p>
            )}
        </section>
    );
};
