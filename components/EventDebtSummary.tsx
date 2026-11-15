import React, { useMemo } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Check, QrCode } from 'lucide-react';
import { Illustration } from './ui/Illustration';
import { getParticipantInitials } from '../utils/eventParticipants';
import { stableColor } from '../utils/stableColor';
import { openPaymentRequest } from './payments/paymentBus';
import { Person, SharedExpense, Currency, ExchangeRates, EventDebt } from '../types';
import { calculateEventSettlement } from '../domain/events';
import { getTranslations } from '../utils/i18n';
import { getAppLanguage } from '../utils/locale';
import { money } from './home/parts';
import { MOTION } from '../config';
import { participantName, SELF_ID, type EventViewer } from '../domain/eventViewer';

interface EventDebtSummaryProps {
    expenses: SharedExpense[];
    people: Person[];
    baseCurrency: Currency;
    /** With rates, all currencies are netted into `baseCurrency`. */
    rates?: ExchangeRates;
    /** Id used for the current user in `expenses` (shown as "You" when not in `people`). */
    selfId?: string;
    /**
     * Who is looking at the event (domain/eventViewer). Replaces `selfId`: in a guest's view only the
     * participant they picked is "You", and the organizer's ids keep the organizer's name.
     */
    viewer?: Pick<EventViewer, 'selfIds' | 'ownerIds' | 'ownerName'>;
    /** Record a suggested payment as done. Without it the list is read-only. */
    onMarkPaid?: (debt: EventDebt) => void;
    /** The event has real spending, so an empty plan means everyone is even. */
    hasSpending?: boolean;
    /** Payment purpose for an IPS QR request (the event name). */
    requestPurpose?: string;
}

const FALLBACK_COLOR = '#9E9E9E';

export const debtKey = (debt: EventDebt) => `${debt.from}>${debt.to}>${debt.currency}`;

export const EventDebtSummary: React.FC<EventDebtSummaryProps> = ({
    expenses = [],
    people = [],
    baseCurrency,
    rates,
    selfId,
    viewer,
    onMarkPaid,
    hasSpending = false,
    requestPurpose,
}) => {
    const t = getTranslations();
    const language = getAppLanguage();
    const reduceMotion = useReducedMotion();
    const debts = useMemo(
        () => calculateEventSettlement(expenses || [], { currency: baseCurrency, rates }),
        [expenses, baseCurrency, rates],
    );

    const ids = useMemo(() => {
        if (viewer) return viewer;
        const selfIds = new Set([SELF_ID, ...(selfId ? [selfId] : [])]);
        return { selfIds, ownerIds: selfIds, ownerName: null };
    }, [selfId, viewer]);
    const isSelf = (id: string) => ids.selfIds.has(id);
    // Debts to participants that are not in `people` are still shown.
    const resolvePerson = (id: string): Pick<Person, 'name' | 'color' | 'avatar'> => {
        const person = people.find(p => p.id === id);
        if (person) return person;
        return { name: participantName(id, ids, [], { you: t.you, organizer: t.organizer, unknown: t.unknown }), color: FALLBACK_COLOR };
    };

    if (debts.length === 0) {
        if (!hasSpending) {
            return (
                <div className="flex flex-col items-center gap-1 rounded-[18px] bg-chip px-6 pb-5 pt-3 text-center text-muted">
                    <span className="h-16 w-20" aria-hidden="true"><Illustration name="wallet" /></span>
                    <p className="text-[13px]">{t.noDebtsToSettle}</p>
                </div>
            );
        }
        return (
            <m.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={MOTION.modal.spring}
                className="flex items-center gap-4 rounded-[22px] bg-accent-soft py-3 pl-2 pr-5 text-left"
                role="status"
            >
                <m.span
                    initial={reduceMotion ? false : { scale: 0.5, rotate: -10, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ ...MOTION.modal.spring, delay: reduceMotion ? 0 : 0.08 }}
                    className="h-[72px] w-[90px] shrink-0"
                    aria-hidden="true"
                >
                    <Illustration name="settled" />
                </m.span>
                <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[17px] font-bold text-accent">{t.eventAllSettled}</span>
                    <span className="text-[13px] text-muted">{t.eventAllSettledHint}</span>
                </span>
            </m.div>
        );
    }

    const face = (person: Pick<Person, 'name' | 'color' | 'avatar'>, self: boolean) => (
        <span
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white shadow-[0_0_0_2.5px_var(--paper-tile)]"
            style={{ background: self && !person.avatar ? 'rgb(var(--accent-rgb))' : person.color || stableColor(person.name) }}
            aria-hidden="true"
        >
            {person.avatar && /^(data:|http)/.test(person.avatar)
                ? <img src={person.avatar} alt="" className="h-full w-full object-cover" />
                : <span className={self ? 'text-on-accent' : undefined}>{getParticipantInitials(person.name)}</span>}
        </span>
    );

    const sentence = (debt: EventDebt) => {
        const from = resolvePerson(debt.from).name;
        const to = resolvePerson(debt.to).name;
        if (isSelf(debt.from)) return t.settleYouPay.replace('{name}', to);
        if (isSelf(debt.to)) return t.settlePaysYou.replace('{name}', from);
        return t.settlePays.replace('{from}', from).replace('{to}', to);
    };

    return (
        <div className="flex flex-col gap-1">
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t.whoOwesWho}</h4>
            <p className="text-[12px] text-faint">{t.settleUpHint}</p>
            <ul className="flex flex-col">
                <AnimatePresence initial={false}>
                    {debts.map((debt, index) => {
                        const fromPerson = resolvePerson(debt.from);
                        const toPerson = resolvePerson(debt.to);
                        const youPay = isSelf(debt.from);
                        const youGet = isSelf(debt.to);
                        return (
                            <m.li
                                key={debtKey(debt)}
                                data-debt={debtKey(debt)}
                                layout={!reduceMotion}
                                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: 0.2 } }}
                                // Below sm the buttons take their own line, so the names and amount always fit.
                                className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:flex-nowrap ${index < debts.length - 1 ? 'border-b border-hair' : ''}`}
                            >
                                <span className="relative flex shrink-0 items-center" aria-hidden="true">
                                    {face(fromPerson, youPay)}
                                    <span className={`mx-0.5 flex w-4 items-center ${youPay ? 'text-neg' : youGet ? 'text-pos' : 'text-faint'}`}>
                                        <span className="h-0 flex-1 border-t-2 border-dashed border-current opacity-70" />
                                        <svg width="7" height="10" viewBox="0 0 7 10" className="-ml-0.5 shrink-0"><path d="M1.5 1.5 5.5 5l-4 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </span>
                                    {face(toPerson, youGet)}
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="break-words text-[14px] font-semibold leading-snug">{sentence(debt)}</span>
                                    <span className={`whitespace-nowrap text-[16px] font-bold tabular-nums ${youPay ? 'text-neg' : youGet ? 'text-pos' : ''}`}>
                                        {money(debt.amount, debt.currency, language, true)}
                                    </span>
                                </span>
                                {onMarkPaid && (
                                <span className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
                                {youGet && (
                                    <button
                                        type="button"
                                        onClick={() => openPaymentRequest({
                                            amount: debt.amount,
                                            currency: debt.currency,
                                            payerName: fromPerson.name,
                                            purpose: requestPurpose,
                                            onSettled: ({ full, amount }) => onMarkPaid(full ? debt : { ...debt, amount }),
                                        })}
                                        aria-label={`${t.payRequest}: ${fromPerson.name}, ${money(debt.amount, debt.currency, language, true)}`}
                                        title={t.payRequest}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
                                    >
                                        <QrCode size={16} strokeWidth={2.4} aria-hidden="true" />
                                    </button>
                                )}
                                    <button
                                        type="button"
                                        onClick={() => onMarkPaid(debt)}
                                        aria-label={`${t.markPaid}: ${sentence(debt)}, ${money(debt.amount, debt.currency, language, true)}`}
                                        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent"
                                    >
                                        <Check size={15} strokeWidth={2.6} aria-hidden="true" />
                                        {t.markPaid}
                                    </button>
                                </span>
                                )}
                            </m.li>
                        );
                    })}
                </AnimatePresence>
            </ul>
        </div>
    );
};
