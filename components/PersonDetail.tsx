import React, { useMemo, useState } from 'react';
import { Account, Person, Transaction, Currency, Category, ExchangeRates } from '../types';
import { TRANSLATIONS, CURRENCIES } from '../constants';
import { X, Trash2, Pencil, Check, Handshake, QrCode, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { openPaymentRequest } from './payments/paymentBus';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import { formatCurrency, getShortDate } from '../utils/formatters';
import { convertAmount } from '../services/currencyService';
import { MOTION } from '../config';
import { BalanceInput } from './BalanceInput';
import { useDialog } from '../hooks/useFocusTrap';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { ConfirmDialog } from './ConfirmDialog';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { CurrencyFlag } from './ui/CurrencyFlag';
import { Illustration } from './ui/Illustration';
import { Avatar, Big } from './home/parts';
import { AmountInput } from './ui/AmountInput';
import { formatAmountForInput } from '../utils/numberInput';
import { localizeCategoryName, localizeTransactionNote } from '../utils/systemText';
import { splitOpenBalances } from '../domain/people';

interface PersonDetailProps {
    person: Person;
    transactions: Transaction[];
    categories: Category[];
    baseCurrency: Currency;
    rates: ExchangeRates;
    onClose: () => void;
    onDelete: (id: string) => void;
    onEdit: (person: Person) => void;
    /** `accountId` is the wallet the money goes into or comes out of; omitted, the handler picks one. */
    onSettleUp: (personId: string, currency: Currency, amount?: number, accountId?: string) => void;
    onUpdateBalance: (personId: string, currency: Currency, newBalance: number) => void;
    language: 'en' | 'sr';
    /** Wallets to record a settlement in. With more than one, a picker is shown. */
    accounts?: Account[];
}

const isImage = (value?: string) => !!value && /^(data:|http)/.test(value);

export const PersonDetail: React.FC<PersonDetailProps> = ({
    person,
    transactions,
    categories,
    baseCurrency,
    rates,
    onClose,
    onDelete,
    onEdit,
    onSettleUp,
    onUpdateBalance,
    language,
    accounts,
}) => {
    const t = TRANSLATIONS[language];
    const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [partialOpen, setPartialOpen] = useState(false);
    const [partialCurrency, setPartialCurrency] = useState<Currency | null>(null);
    const [partialAmount, setPartialAmount] = useState<number | undefined>(undefined);
    const [partialText, setPartialText] = useState('');
    const [partialError, setPartialError] = useState<string | null>(null);
    // '' = the first wallet in the settled currency (see pickSettlementAccountId).
    const [settleAccountId, setSettleAccountId] = useState('');
    const { dialogProps, titleId } = useDialog(true, onClose);
    const reduceMotion = useReducedMotion();
    const { wrapRef, handleProps, contentProps } = useSheetDrag(onClose);

    const personTransactions = useMemo(() => {
        return transactions
            .filter(tx => tx.personId === person.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, person.id]);

    // A positive balance means this person owes you.
    const totalBalanceInBase = useMemo(() => {
        return Object.entries(person.balances).reduce((acc, [currency, amount]) => {
            return acc + convertAmount(amount, currency as Currency, baseCurrency, rates);
        }, 0);
    }, [person.balances, baseCurrency, rates]);
    const settled = Math.abs(totalBalanceInBase) < 0.005;

    // History as a timeline, one group per month.
    const historyGroups = useMemo(() => {
        const locale = language === 'sr' ? 'sr-Latn-RS' : 'en-GB';
        const groups: { key: string; label: string; items: Transaction[] }[] = [];
        personTransactions.forEach(tx => {
            const date = new Date(tx.date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            let group = groups[groups.length - 1];
            if (!group || group.key !== key) {
                group = { key, label: date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }), items: [] };
                groups.push(group);
            }
            group.items.push(tx);
        });
        return groups;
    }, [personTransactions, language]);
    const owesYou = totalBalanceInBase > 0;
    const openCurrencies = CURRENCIES.filter(currency => Math.abs(person.balances[currency] || 0) >= 0.005);
    const activePartialCurrency = partialCurrency && openCurrencies.includes(partialCurrency) ? partialCurrency : openCurrencies[0];
    const partialBalance = activePartialCurrency ? Math.abs(person.balances[activePartialCurrency] || 0) : 0;

    // Balances can point both ways at once (they owe me euros, I owe them dinars). Each settle
    // button clears exactly the currencies its label describes, never the other direction.
    const { owedToMe, iOwe } = useMemo(() => splitOpenBalances(person.balances), [person.balances]);
    const settleDirections = (owesYou ? ['owedToMe', 'iOwe'] as const : ['iOwe', 'owedToMe'] as const)
        .map(direction => ({ direction, entries: direction === 'owedToMe' ? owedToMe : iOwe }))
        .filter(({ entries }) => entries.length > 0);
    const wallets = accounts ?? [];
    const accountFor = () => settleAccountId || undefined;
    const settleEntries = (entries: [Currency, number][]) =>
        entries.forEach(([currency]) => onSettleUp(person.id, currency, undefined, accountFor()));
    const formatEntries = (entries: [Currency, number][]) =>
        entries.map(([currency, amount]) => formatCurrency(amount, currency, language)).join(' + ');

    const openPartial = (currency: Currency | null = openCurrencies[0] ?? null) => {
        setPartialCurrency(currency);
        setPartialAmount(undefined);
        setPartialText('');
        setPartialError(null);
        setPartialOpen(true);
    };

    // NBS IPS QR they scan in their bank app: only for what they owe me. One currency is requested
    // as is (the sheet converts it to dinars); several are netted in the base currency.
    const requestWithQr = () => {
        const single = owedToMe.length === 1 ? owedToMe[0][0] : null;
        const owedInBase = owedToMe.reduce((sum, [currency, amount]) => sum + convertAmount(amount, currency, baseCurrency, rates), 0);
        openPaymentRequest({
            amount: single ? owedToMe[0][1] : owedInBase,
            currency: single ?? baseCurrency,
            payerName: person.name,
            purpose: t.payPurposeDefault,
            onSettled: ({ full, amount }) => {
                if (full) settleEntries(owedToMe);
                else if (single) onSettleUp(person.id, single, amount, accountFor());
                // A part of a debt in several currencies: let the user say which one.
                else openPartial(owedToMe[0][0]);
            },
        });
    };

    const submitPartial = (event: React.FormEvent) => {
        event.preventDefault();
        if (!activePartialCurrency) return;
        const value = partialAmount;
        if (value === undefined) {
            setPartialError(partialText.trim() ? t.settleAmountUnreadable : t.settleAmountInvalid);
            return;
        }
        if (!(value > 0)) {
            setPartialError(t.settleAmountInvalid);
            return;
        }
        if (Math.round(value * 100) > Math.round(partialBalance * 100)) {
            setPartialError(t.settleAmountTooHigh);
            return;
        }
        // The full balance is a plain settle; anything less is recorded as partial.
        const full = Math.round(value * 100) === Math.round(partialBalance * 100);
        onSettleUp(person.id, activePartialCurrency, full ? undefined : value, accountFor());
        setPartialOpen(false);
    };

    const walletPicker = wallets.length > 1 && (
        <label className="flex w-full items-center gap-2 text-left text-[13px] font-semibold text-muted">
            <span className="shrink-0">{t.settleWalletLabel}</span>
            <select
                value={settleAccountId}
                onChange={(e) => setSettleAccountId(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-[14px] bg-chip px-2.5 text-[14px] font-semibold text-on-surface"
            >
                <option value="">{t.settleWalletAuto}</option>
                {wallets.map(account => (
                    <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                ))}
            </select>
        </label>
    );

    const iconButton = 'glass flex h-11 w-11 items-center justify-center rounded-full';

    return (
        <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={onClose}>
            <m.div className="paper-scrim absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden="true" />
            <div ref={wrapRef} className="relative flex w-full justify-center">
            <m.div
                {...dialogProps}
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={MOTION.modal.spring}
                className="glass-sheet relative flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-[40px] text-on-surface outline-none"
            >
                {/* Deleting a person drops their balances: confirm first. */}
                <ConfirmDialog
                    isOpen={isConfirmingDelete}
                    type="danger"
                    title={t.deletePersonTitle}
                    message={t.deletePersonMessage}
                    confirmLabel={t.delete}
                    cancelLabel={t.cancel}
                    onCancel={() => setIsConfirmingDelete(false)}
                    onConfirm={() => {
                        setIsConfirmingDelete(false);
                        onDelete(person.id);
                    }}
                />

                <div className="paper-grab mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full md:hidden" aria-hidden="true" {...handleProps} />
                <div className="flex touch-none items-center justify-between px-4 pt-2 md:pt-4" {...handleProps}>
                    <button type="button" onClick={onClose} aria-label={t.close} title={t.close} className={iconButton}>
                        <X size={20} aria-hidden="true" />
                    </button>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => onEdit(person)} aria-label={t.edit} title={t.edit} className={iconButton}>
                            <Pencil size={18} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => setIsConfirmingDelete(true)} aria-label={t.delete} title={t.delete} className={clsx(iconButton, 'text-neg')}>
                            <Trash2 size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6" {...contentProps}>
                    <div className="flex flex-col items-center pb-5 pt-1 text-center">
                        <span className="relative rounded-full p-1" style={{ background: `color-mix(in oklab, ${person.color || 'rgb(var(--accent-rgb))'} 24%, transparent)` }}>
                            <span className="block rounded-full shadow-[0_0_0_3px_var(--paper-tile)]">
                                {isImage(person.avatar) || !person.avatar ? (
                                    <Avatar name={person.name} color={person.color} image={isImage(person.avatar) ? person.avatar : undefined} size={80} />
                                ) : (
                                    <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full text-[36px]" style={{ background: person.color }}>
                                        {person.avatar}
                                    </span>
                                )}
                            </span>
                            <m.span
                                aria-hidden="true"
                                initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ ...MOTION.modal.spring, delay: reduceMotion ? 0 : 0.12 }}
                                className={clsx(
                                    'absolute bottom-0.5 right-0.5 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-[0_0_0_3px_var(--paper-tile)]',
                                    settled ? 'bg-pos' : owesYou ? 'bg-pos' : 'bg-neg',
                                )}
                            >
                                {settled ? <Check size={15} strokeWidth={3} /> : owesYou ? <ArrowDownLeft size={15} strokeWidth={2.6} /> : <ArrowUpRight size={15} strokeWidth={2.6} />}
                            </m.span>
                        </span>
                        <h2 id={titleId} className="mt-3 max-w-full truncate text-[26px] font-bold tracking-[-0.5px]">{person.name}</h2>
                        {settled ? (
                            <p className="mt-1 flex items-center gap-1.5 rounded-full bg-pos/10 px-3 py-1 text-[14px] font-semibold text-pos">
                                <Check size={15} className="text-pos" aria-hidden="true" /> {t.allSettled}
                            </p>
                        ) : (
                            <>
                                <span className={clsx('mt-2 rounded-full px-3 py-1 text-[12px] font-bold', owesYou ? 'bg-pos/15 text-pos' : 'bg-neg/15 text-neg')}>
                                    {owesYou ? t.owesYou : t.youOwe}
                                </span>
                                <Big size={34} className={clsx('mt-1 w-full text-center', owesYou ? 'text-pos' : 'text-neg')}>
                                    {formatCurrency(Math.abs(totalBalanceInBase), baseCurrency)}
                                </Big>
                                <div className="mt-2 flex items-center gap-2" aria-hidden="true">
                                    {(owesYou ? ['person', 'you'] : ['you', 'person']).map((who, i) => (
                                        <React.Fragment key={who}>
                                            {i === 1 && (
                                                <span className={clsx('relative flex h-4 w-16 items-center', owesYou ? 'text-pos' : 'text-neg')}>
                                                    <span className="h-0 w-full border-t-2 border-dashed border-current opacity-60" />
                                                    <svg width="10" height="12" viewBox="0 0 10 12" className="-ml-1 shrink-0"><path d="M2 1.5 8 6l-6 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                </span>
                                            )}
                                            {who === 'person' ? (
                                                <Avatar name={person.name} color={person.color} image={isImage(person.avatar) ? person.avatar : undefined} size={28} />
                                            ) : (
                                                <span className="flex h-7 items-center rounded-full bg-accent-soft px-2.5 text-[12px] font-bold text-accent">{t.you}</span>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                                {openCurrencies.length > 0 && (
                                    <div className="mt-4 flex w-full max-w-[360px] flex-col items-center gap-2">
                                        {settleDirections.map(({ direction, entries }, index) => (
                                            <button
                                                key={direction}
                                                type="button"
                                                onClick={() => settleEntries(entries)}
                                                className={clsx(
                                                    'flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-[24px] px-4 py-2 text-[15px] font-semibold',
                                                    index === 0 ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent',
                                                )}
                                            >
                                                <Handshake size={18} className="shrink-0" aria-hidden="true" />
                                                <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                                                    <span className="break-words">
                                                        {(direction === 'owedToMe' ? t.settleTheyPaidMe : t.settleIPaidThem).replace('{name}', person.name)}
                                                    </span>
                                                    {/* Exactly what this button records, per currency (never cut off). */}
                                                    <span className="text-[13px] font-medium tabular-nums opacity-85">{formatEntries(entries)}</span>
                                                </span>
                                            </button>
                                        ))}
                                        {owedToMe.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={requestWithQr}
                                                className="flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent"
                                            >
                                                <QrCode size={18} className="shrink-0" aria-hidden="true" />
                                                <span className="truncate">{t.payRequest}</span>
                                            </button>
                                        )}
                                        {walletPicker}
                                        <button
                                            type="button"
                                            onClick={() => (partialOpen ? setPartialOpen(false) : openPartial())}
                                            aria-expanded={partialOpen}
                                            aria-controls="person-partial-settle"
                                            className="flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-[14px] font-semibold text-accent"
                                        >
                                            {t.settleOtherAmount}
                                        </button>
                                    </div>
                                )}
                                <AnimatePresence initial={false}>
                                    {partialOpen && activePartialCurrency && (
                                        <m.form
                                            id="person-partial-settle"
                                            onSubmit={submitPartial}
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={MOTION.modal.spring}
                                            className="w-full max-w-[360px] overflow-hidden"
                                        >
                                            <div className="mt-3 flex flex-col gap-2 rounded-[22px] bg-chip p-3 text-left">
                                                <label htmlFor="person-partial-amount" className="px-1 text-[12px] font-semibold text-muted">
                                                    {t.settlePaidBack}
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    {openCurrencies.length > 1 ? (
                                                        <select
                                                            aria-label={t.currency}
                                                            value={activePartialCurrency}
                                                            onChange={(e) => {
                                                                setPartialCurrency(e.target.value as Currency);
                                                                setPartialError(null);
                                                            }}
                                                            className="h-11 shrink-0 rounded-[14px] bg-[var(--paper-tile)] px-2.5 text-[14px] font-semibold"
                                                        >
                                                            {openCurrencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                                                        </select>
                                                    ) : (
                                                        <span className="flex h-11 shrink-0 items-center rounded-[14px] bg-[var(--paper-tile)] px-3 text-[13px] font-bold text-muted">
                                                            {activePartialCurrency}
                                                        </span>
                                                    )}
                                                    <AmountInput
                                                        id="person-partial-amount"
                                                        autoFocus
                                                        value={partialAmount}
                                                        onValueChange={(next, text) => {
                                                            setPartialAmount(next);
                                                            setPartialText(text);
                                                            setPartialError(null);
                                                        }}
                                                        language={language}
                                                        placeholder={formatAmountForInput(partialBalance, language)}
                                                        aria-invalid={!!partialError}
                                                        aria-describedby={partialError ? 'person-partial-error' : undefined}
                                                        className="h-11 min-w-0 flex-1 rounded-[14px] bg-[var(--paper-tile)] px-3 text-[16px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent"
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
                                                    >
                                                        <Check size={16} aria-hidden="true" />
                                                        {t.settle}
                                                    </button>
                                                </div>
                                                {partialError && (
                                                    <p id="person-partial-error" role="alert" className="px-1 text-[12px] font-medium text-neg">{partialError}</p>
                                                )}
                                            </div>
                                        </m.form>
                                    )}
                                </AnimatePresence>
                            </>
                        )}
                    </div>

                    <section aria-label={t.balance} className="paper-tile overflow-hidden py-1">
                        {CURRENCIES.map((currency, index) => {
                            const amount = person.balances[currency] || 0;
                            const isEditing = editingCurrency === currency;
                            return (
                                <div
                                    key={currency}
                                    className={clsx(
                                        'flex min-h-[60px] gap-x-3 gap-y-2 px-4 py-2.5',
                                        // While editing, the input gets the full row width on its own line.
                                        isEditing ? 'flex-col' : 'flex-wrap items-center',
                                        index < CURRENCIES.length - 1 && 'border-b border-hair',
                                    )}
                                >
                                    <span className="flex h-9 w-[68px] shrink-0 items-center gap-1.5 rounded-[12px] bg-chip pl-1.5 text-[12px] font-bold text-muted">
                                        <CurrencyFlag currency={currency} size={22} />
                                        {currency}
                                    </span>
                                    {isEditing ? (
                                        <div className="w-full">
                                            <BalanceInput
                                                currency={currency}
                                                initialAmount={amount}
                                                showCurrency={false}
                                                onSave={(val) => {
                                                    onUpdateBalance(person.id, currency, val);
                                                    setEditingCurrency(null);
                                                }}
                                                onCancel={() => setEditingCurrency(null)}
                                                language={language}
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            {/* The amount is never cut off: when it and Settle don't fit, Settle wraps below. */}
                                            <button
                                                type="button"
                                                onClick={() => setEditingCurrency(currency)}
                                                aria-label={`${t.edit} ${currency}: ${formatCurrency(amount, currency, language)}`}
                                                className="flex min-h-10 flex-auto items-center gap-2 text-left"
                                            >
                                                <span className={clsx('whitespace-nowrap text-[17px] font-semibold tabular-nums', amount > 0 ? 'text-pos' : amount < 0 ? 'text-neg' : 'text-faint')}>
                                                    {amount > 0 ? '+' : ''}{formatCurrency(amount, currency, language)}
                                                </span>
                                                <Pencil size={13} className="shrink-0 text-faint" aria-hidden="true" />
                                            </button>
                                            {Math.abs(amount) >= 0.005 && (
                                                <button
                                                    type="button"
                                                    onClick={() => onSettleUp(person.id, currency, undefined, accountFor())}
                                                    aria-label={`${t.settle} ${currency}`}
                                                    className="ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent"
                                                >
                                                    <Handshake size={15} aria-hidden="true" /> {t.settle}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </section>

                    <section className="mt-5 flex flex-col gap-1.5">
                        <h3 className="px-4 text-[12px] font-semibold uppercase tracking-wide text-faint">{t.history}</h3>
                        <div className="paper-tile overflow-hidden px-4">
                            {historyGroups.map((group, groupIndex) => (
                                <div key={group.key} className={clsx('pb-1', groupIndex > 0 && 'border-t border-hair')}>
                                    <p className="pb-1 pt-3 text-[12px] font-semibold capitalize text-muted">{group.label}</p>
                                    <div className="relative">
                                        {group.items.length > 1 && (
                                            <span className="absolute bottom-[31px] left-[18.5px] top-[31px] w-px bg-[var(--paper-line)]" aria-hidden="true" />
                                        )}
                                        {group.items.map(tx => {
                                            const category = categories.find(c => c.id === tx.categoryId);
                                            // Direction of money, like every other list: money that came in to me is
                                            // green "+", money I paid out (lent, paid for them, paid back) is red "-".
                                            const moneyIn = tx.type === 'income';
                                            const title = localizeTransactionNote(tx.note, language) || (category ? localizeCategoryName(category, language) : '');
                                            return (
                                                <div key={tx.id} className="relative flex min-h-[62px] items-center gap-3">
                                                    <CategoryGlyph category={category} size={38} />
                                                    <span className="flex min-w-0 flex-1 flex-col">
                                                        <span className="truncate text-[15px] font-semibold">{title}</span>
                                                        <span className="truncate text-[13px] text-muted">{getShortDate(tx.date, language)}</span>
                                                    </span>
                                                    <span className={clsx('flex shrink-0 items-center gap-1 text-[15px] font-semibold tabular-nums', moneyIn ? 'text-pos' : 'text-neg')}>
                                                        {moneyIn ? <ArrowDownLeft size={14} aria-hidden="true" /> : <ArrowUpRight size={14} aria-hidden="true" />}
                                                        <span className="sr-only">{moneyIn ? t.moneyCameIn : t.moneyWentOut}</span>
                                                        {moneyIn ? '+' : '\u2212'}{formatCurrency(tx.amount, tx.currency, language)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {personTransactions.length === 0 && (
                                <div className="flex flex-col items-center gap-1 py-5 text-center">
                                    <span className="h-20 w-[100px]" aria-hidden="true"><Illustration name={settled ? 'settled' : 'transactions'} /></span>
                                    <p className="text-[14px] text-muted">{t.noTransactions}</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </m.div>
            </div>
        </div>
    );
};
