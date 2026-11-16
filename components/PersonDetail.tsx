import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Bell, Check, Handshake, QrCode } from 'lucide-react';
import type { Account, AppState, Category, Currency, Event, ExchangeRates, HomeHeaderTone, Person, Transaction } from '../types';
import { TRANSLATIONS, CURRENCIES } from '../constants';
import { MOTION } from '../config';
import { openPaymentRequest } from './payments/paymentBus';
import { convertAmount } from '../services/currencyService';
import { getShortDate } from '../utils/formatters';
import { formatAmountForInput } from '../utils/numberInput';
import { useDialog, useEscapeKey } from '../hooks/useFocusTrap';
import { useSessionIdentity } from '../hooks/useSessionIdentity';
import { pickSettlementAccountId, splitOpenBalances } from '../domain/people';
import { openSince, personLedger, personStats } from '../domain/personLedger';
import { ConfirmDialog } from './ConfirmDialog';
import { AmountInput } from './ui/AmountInput';
import { accountIcon } from './ui/AccountGlyph';
import { fill } from './home/parts';
import { eventAmount } from './event-detail/eventStrings';
import { personEventBalances } from './shared/sharedSummary';
import { SHARED_STRINGS } from './shared/sharedStrings';
import { PERSON_STRINGS } from './person/personStrings';
import { PersonHero, type PersonHeroChip, type PersonHeroTile } from './person/PersonHero';
import { PersonHistory } from './person/PersonHistory';

interface PersonDetailProps {
    /** With effective balances (`selectPeopleWithBalances`). */
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
    /** Wallets to record a settlement in. With more than one, they are offered as chips. */
    accounts?: Account[];
    /** For what is open between you in events; left out, the page shows plain balances only. */
    state?: AppState;
    onOpenEvent?: (event: Event) => void;
    /** The Home header colour. */
    tone?: HomeHeaderTone;
    /** `pane`: the right-hand column of Shared or People on wide windows (no scrim, panel or focus trap). */
    variant?: 'modal' | 'pane';
}

/**
 * One person: a page in the Home header colour with what is open between you and since when,
 * paying back (into a wallet, by QR, a reminder, or part of it), and how the balance adds up.
 * On phones it covers the screen; on wider screens it is a panel over the app.
 */
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
    state,
    onOpenEvent,
    tone = 'accent',
    variant = 'modal',
}) => {
    const t = TRANSLATIONS[language];
    const s = PERSON_STRINGS[language];
    const userId = useSessionIdentity()?.userId ?? null;
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [editingBalances, setEditingBalances] = useState(false);
    const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
    const [partialOpen, setPartialOpen] = useState(false);
    const [partialCurrency, setPartialCurrency] = useState<Currency | null>(null);
    const [partialAmount, setPartialAmount] = useState<number | undefined>(undefined);
    const [partialText, setPartialText] = useState('');
    const [partialError, setPartialError] = useState<string | null>(null);
    const [reminded, setReminded] = useState(false);
    // '' = the first wallet in the settled currency (see pickSettlementAccountId).
    const [settleAccountId, setSettleAccountId] = useState('');
    const inPane = variant === 'pane';
    const { dialogProps, titleId } = useDialog(!inPane, onClose);
    // In the pane, Escape closes the person (a dialog or menu on top handles it first).
    useEscapeKey(onClose, inPane);

    useEffect(() => {
        if (!reminded) return;
        const timer = window.setTimeout(() => setReminded(false), 2200);
        return () => window.clearTimeout(timer);
    }, [reminded]);

    const amount = (value: number, currency: Currency) => eventAmount(value, currency, language);
    const ledger = useMemo(() => personLedger(person, transactions), [person, transactions]);
    const { owedToMe, iOwe } = useMemo(() => splitOpenBalances(person.balances), [person.balances]);
    const net = useMemo(() => (Object.entries(person.balances) as [Currency, number][])
        .reduce((sum, [currency, value]) => sum + convertAmount(value || 0, currency, baseCurrency, rates), 0), [person.balances, baseCurrency, rates]);
    const owesYou = net > 0;

    // The header shows the biggest open balance in the net direction; the rest go in chips.
    const open = useMemo(() => [...owedToMe.map(([currency, value]) => [currency, value] as [Currency, number]), ...iOwe.map(([currency, value]) => [currency, -value] as [Currency, number])]
        .sort((a, b) => Math.abs(convertAmount(b[1], b[0], baseCurrency, rates)) - Math.abs(convertAmount(a[1], a[0], baseCurrency, rates))), [owedToMe, iOwe, baseCurrency, rates]);
    const mainEntry = open.find(([, value]) => (owesYou ? value > 0 : value < 0)) ?? open[0] ?? null;
    const main = mainEntry ? { currency: mainEntry[0], amount: mainEntry[1] } : null;
    const displayCurrency = main?.currency ?? baseCurrency;

    const events = useMemo(() => (state ? personEventBalances(person, state, userId) : []), [person, state, userId]);
    const stats = useMemo(() => personStats(ledger, displayCurrency, rates), [ledger, displayCurrency, rates]);

    const since = main ? openSince(ledger, main.currency, main.amount) : null;
    const status = !main
        ? s.settled
        : main.amount > 0
            ? since ? fill(s.owesYouSince, { date: getShortDate(since, language) }) : s.owesYou
            : since ? fill(s.youOweSince, { date: getShortDate(since, language) }) : s.youOwe;

    const chips: PersonHeroChip[] = [
        ...open.filter(entry => entry !== mainEntry).map(([currency, value]) => ({
            key: currency,
            label: fill(value > 0 ? s.plusAmount : s.youOweAmount, { amount: amount(Math.abs(value), currency) }),
        })),
        ...events.map(entry => ({
            key: entry.event.id,
            event: true,
            label: fill(entry.amount < 0 ? s.youOweIn : main && main.amount > 0 ? s.plusIn : s.owesIn, {
                amount: amount(Math.abs(entry.amount), entry.currency),
                event: entry.event.name,
            }),
            onClick: onOpenEvent ? () => onOpenEvent(entry.event) : undefined,
        })),
    ];

    const last = stats.lastRepayment;
    const wallets = accounts ?? [];
    const walletName = (id?: string) => wallets.find(account => account.id === id)?.name;
    const tiles: PersonHeroTile[] = [
        last
            ? { label: s.lastPaid, value: amount(Math.abs(last.delta), last.currency), sub: [getShortDate(last.transaction.date, language), walletName(last.transaction.accountId)].filter(Boolean).join(' · ') }
            : { label: s.lastPaid, value: s.noneYet, sub: '' },
        {
            label: s.sharedBills,
            value: String(stats.bills.length),
            sub: stats.bills.length > 0
                ? stats.bills.slice(0, 2).map(row => row.transaction.note || '').filter(Boolean).join(', ')
                : s.nothingYet,
        },
        {
            label: s.lentTotal,
            value: amount(stats.lent, displayCurrency),
            sub: stats.lentSince ? fill(s.since, { date: getShortDate(stats.lentSince, language) }) : s.nothingYet,
        },
    ];

    // Balances can point both ways at once (they owe me euros, I owe them dinars). Each settle
    // button clears exactly the currencies its label describes, never the other direction.
    const settleDirections = (owesYou ? ['owedToMe', 'iOwe'] as const : ['iOwe', 'owedToMe'] as const)
        .map(direction => ({ direction, entries: direction === 'owedToMe' ? owedToMe : iOwe }))
        .filter(({ entries }) => entries.length > 0);
    const shownWalletId = settleAccountId || pickSettlementAccountId(wallets, displayCurrency);
    const accountFor = () => settleAccountId || undefined;
    const settleEntries = (entries: [Currency, number][]) =>
        entries.forEach(([currency]) => onSettleUp(person.id, currency, undefined, accountFor()));
    const formatEntries = (entries: [Currency, number][]) =>
        entries.map(([currency, value]) => amount(value, currency)).join(' + ');
    const walletFor = (entries: [Currency, number][]) =>
        walletName(settleAccountId || pickSettlementAccountId(wallets, entries[0]?.[0] ?? displayCurrency));

    const openCurrencies = CURRENCIES.filter(currency => Math.abs(person.balances[currency] || 0) >= 0.005);
    const activePartialCurrency = partialCurrency && openCurrencies.includes(partialCurrency) ? partialCurrency : openCurrencies[0];
    const partialBalance = activePartialCurrency ? Math.abs(person.balances[activePartialCurrency] || 0) : 0;

    const openPartial = (currency: Currency | null = openCurrencies[0] ?? null) => {
        setPartialCurrency(currency);
        setPartialAmount(undefined);
        setPartialText('');
        setPartialError(null);
        setPartialOpen(true);
    };

    // NBS IPS QR they scan in their bank app: only for what they owe me. One currency is requested
    // as is (the sheet converts it to dinars); several are netted in the base currency.
    const owedSingle = owedToMe.length === 1 ? owedToMe[0][0] : null;
    const owedInBase = owedToMe.reduce((sum, [currency, value]) => sum + convertAmount(value, currency, baseCurrency, rates), 0);
    const requestWithQr = () => {
        openPaymentRequest({
            amount: owedSingle ? owedToMe[0][1] : owedInBase,
            currency: owedSingle ?? baseCurrency,
            payerName: person.name,
            purpose: t.payPurposeDefault,
            onSettled: ({ full, amount: paid }) => {
                if (full) settleEntries(owedToMe);
                else if (owedSingle) onSettleUp(person.id, owedSingle, paid, accountFor());
                // A part of a debt in several currencies: let the user say which one.
                else openPartial(owedToMe[0][0]);
            },
        });
    };

    // A friendly nudge through the share sheet, or copied when there is none.
    const remind = async () => {
        const shared = SHARED_STRINGS[language];
        const text = fill(shared.remindText, {
            name: person.name,
            amount: owedSingle ? amount(owedToMe[0][1], owedSingle) : amount(owedInBase, baseCurrency),
        });
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share({ text });
                return;
            }
        } catch (error) {
            // The user closed the share sheet: nothing to do.
            if ((error as DOMException)?.name === 'AbortError') return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setReminded(true);
        } catch {
            // Neither works: Request with QR is right next to it.
        }
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

    const openBalances = () => {
        setEditingBalances(true);
        window.setTimeout(() => document.getElementById('person-balances')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    };

    const content = (
        <>
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

            {/* The same insets as the app's screens, so the header runs under the status bar on phones. */}
            <div className="pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] md:p-0">
                <PersonHero
                    person={person}
                    tone={tone}
                    titleId={titleId}
                    main={main}
                    status={status}
                    chips={chips}
                    tiles={tiles}
                    language={language}
                    backLabel={t.back}
                    closeLabel={inPane ? t.close : undefined}
                    editLabel={t.edit}
                    onBack={onClose}
                    onEdit={() => onEdit(person)}
                    onEditBalances={openBalances}
                    onDelete={() => setIsConfirmingDelete(true)}
                    s={s}
                />

                <div className="screen-sheet flex flex-col gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-1">
                    {settleDirections.length > 0 && (
                        <section aria-label={t.settle} className="paper-tile p-3.5">
                            {settleDirections.map(({ direction, entries }, index) => {
                                const wallet = walletFor(entries);
                                const what = formatEntries(entries);
                                return (
                                    <button
                                        key={direction}
                                        type="button"
                                        onClick={() => settleEntries(entries)}
                                        className={clsx(
                                            'flex min-h-[58px] w-full min-w-0 flex-col items-center justify-center rounded-[22px] px-4 py-2 text-center transition-transform active:scale-[0.98]',
                                            index === 0
                                                ? 'bg-accent text-on-accent shadow-[0_10px_24px_-12px_rgb(var(--accent-rgb)/0.8)]'
                                                : 'mt-2 bg-accent-soft text-accent',
                                        )}
                                    >
                                        <span className="flex items-center gap-2 text-[16px] font-semibold">
                                            <Handshake size={19} aria-hidden="true" className="shrink-0" />
                                            <span className="break-words">{fill(direction === 'owedToMe' ? s.paidMeBack : s.iPaidBack, { name: person.name })}</span>
                                        </span>
                                        {/* Exactly what this button records, per currency (never cut off). */}
                                        <span className="text-[13px] font-medium tabular-nums opacity-85">
                                            {wallet ? fill(direction === 'owedToMe' ? s.into : s.from, { amount: what, wallet }) : what}
                                        </span>
                                    </button>
                                );
                            })}

                            {owedToMe.length > 0 && (
                                <div className="mt-2.5 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={requestWithQr}
                                        className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-full bg-chip px-3 text-[14.5px] font-semibold"
                                    >
                                        <QrCode size={17} aria-hidden="true" className="shrink-0" />
                                        <span className="truncate">{s.request}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void remind()}
                                        className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-full bg-chip px-3 text-[14.5px] font-semibold"
                                    >
                                        {reminded ? <Check size={17} aria-hidden="true" className="shrink-0 text-accent" /> : <Bell size={17} aria-hidden="true" className="shrink-0" />}
                                        <span className="truncate" aria-live="polite">{reminded ? SHARED_STRINGS[language].copied : SHARED_STRINGS[language].remind}</span>
                                    </button>
                                </div>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {wallets.length > 1 && (
                                    <>
                                        <span className="text-[13.5px] font-medium text-muted">
                                            {settleDirections[0].direction === 'owedToMe' ? s.intoLabel : s.fromLabel}
                                        </span>
                                        <div role="group" aria-label={t.settleWalletLabel} className="flex min-w-0 flex-wrap gap-2">
                                            {wallets.map(wallet => {
                                                const on = wallet.id === shownWalletId;
                                                const Icon = accountIcon(wallet);
                                                return (
                                                    <button
                                                        key={wallet.id}
                                                        type="button"
                                                        aria-pressed={on}
                                                        onClick={() => setSettleAccountId(wallet.id)}
                                                        className={clsx(
                                                            'flex h-10 min-w-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold',
                                                            on ? 'bg-accent-soft text-accent shadow-[inset_0_0_0_1.5px_rgb(var(--accent-rgb))]' : 'bg-chip',
                                                        )}
                                                    >
                                                        <Icon size={15} aria-hidden="true" className="shrink-0" />
                                                        <span className="max-w-[9rem] truncate">{wallet.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                                <span className="flex-1" />
                                <button
                                    type="button"
                                    onClick={() => (partialOpen ? setPartialOpen(false) : openPartial())}
                                    aria-expanded={partialOpen}
                                    aria-controls="person-partial-settle"
                                    className="flex h-10 shrink-0 items-center rounded-full px-2 text-[14px] font-semibold text-accent"
                                >
                                    {t.settleOtherAmount}
                                </button>
                            </div>

                            <AnimatePresence initial={false}>
                                {partialOpen && activePartialCurrency && (
                                    <m.form
                                        id="person-partial-settle"
                                        onSubmit={submitPartial}
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={MOTION.modal.spring}
                                        className="overflow-hidden"
                                    >
                                        <div className="mt-3 flex flex-col gap-2 rounded-[20px] bg-chip p-3 text-left">
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
                        </section>
                    )}

                    <PersonHistory
                        person={person}
                        ledger={ledger}
                        categories={categories}
                        accounts={wallets}
                        language={language}
                        s={s}
                        editing={editingBalances}
                        onToggleEditing={() => setEditingBalances(value => !value)}
                        editingCurrency={editingCurrency}
                        onEditCurrency={setEditingCurrency}
                        onUpdateBalance={onUpdateBalance}
                    />
                </div>
            </div>
        </>
    );

    if (inPane) {
        return (
            <section aria-labelledby={titleId} className="relative text-on-surface">
                {content}
            </section>
        );
    }

    return (
        <div className="fixed inset-0 z-50 md:flex md:justify-center md:p-6">
            <m.div
                className="paper-scrim absolute inset-0 hidden md:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={MOTION.backdrop}
                onClick={onClose}
                aria-hidden="true"
            />
            <m.div
                {...dialogProps}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 28 }}
                transition={MOTION.modal.spring}
                className="relative h-full w-full overflow-y-auto overscroll-contain bg-[var(--paper-bg)] text-on-surface outline-none custom-scrollbar md:max-w-[600px] md:rounded-[34px] md:p-3 md:shadow-[0_28px_70px_-24px_rgba(0,0,0,0.5)]"
            >
                {content}
            </m.div>
        </div>
    );
};
