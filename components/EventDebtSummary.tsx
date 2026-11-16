import React, { useMemo } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Check, QrCode } from 'lucide-react';
import { Illustration } from './ui/Illustration';
import { openPaymentRequest } from './payments/paymentBus';
import { Person, SharedExpense, Currency, ExchangeRates, EventDebt } from '../types';
import { calculateEventSettlement } from '../domain/events';
import { getTranslations } from '../utils/i18n';
import { getAppLanguage } from '../utils/locale';
import { MOTION } from '../config';
import { EVENT_STRINGS, eventAmount } from './event-detail/eventStrings';
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
    const s = EVENT_STRINGS[language];
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

    const sentence = (debt: EventDebt) => {
        const from = resolvePerson(debt.from).name;
        const to = resolvePerson(debt.to).name;
        if (isSelf(debt.from)) return s.youPay.replace('{name}', to);
        if (isSelf(debt.to)) return s.paysYou.replace('{name}', from);
        return s.pays.replace('{from}', from).replace('{to}', to);
    };

    return (
        <ul className="flex flex-col">
            <AnimatePresence initial={false}>
                {debts.map((debt, index) => {
                    const fromPerson = resolvePerson(debt.from);
                    const youPay = isSelf(debt.from);
                    const youGet = isSelf(debt.to);
                    const amount = eventAmount(debt.amount, debt.currency, language);
                    return (
                        <m.li
                            key={debtKey(debt)}
                            data-debt={debtKey(debt)}
                            layout={!reduceMotion}
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: 0.2 } }}
                            // The buttons drop to their own line when the row is too narrow, so the sentence and amount always fit.
                            className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 ${index < debts.length - 1 ? 'border-b border-hair' : ''}`}
                        >
                            {/* Who pays whom over the amount, so the buttons keep their room on a phone. */}
                            <span className="flex min-w-0 flex-1 flex-col">
                                <span className="break-words text-[14.5px] font-medium leading-snug text-muted">{sentence(debt)}</span>
                                <span className={`whitespace-nowrap text-[18px] font-bold tabular-nums tracking-[-0.2px] ${youPay ? 'text-neg' : youGet ? 'text-pos' : ''}`}>
                                    {amount}
                                </span>
                            </span>
                            {onMarkPaid && (
                                <span className="ml-auto flex shrink-0 gap-2">
                                    {youGet && (
                                        <button
                                            type="button"
                                            onClick={() => openPaymentRequest({
                                                amount: debt.amount,
                                                currency: debt.currency,
                                                payerName: fromPerson.name,
                                                purpose: requestPurpose,
                                                onSettled: ({ full, amount: paid }) => onMarkPaid(full ? debt : { ...debt, amount: paid }),
                                            })}
                                            aria-label={`${t.payRequest}: ${fromPerson.name}, ${amount}`}
                                            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[14px] font-semibold text-on-accent"
                                        >
                                            <QrCode size={16} strokeWidth={2.4} aria-hidden="true" />
                                            {s.request}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onMarkPaid(debt)}
                                        aria-label={`${t.markPaid}: ${sentence(debt)}, ${amount}`}
                                        title={t.markPaid}
                                        className={youGet
                                            ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent'
                                            : 'flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[14px] font-semibold text-accent'}
                                    >
                                        <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                                        {!youGet && t.markPaid}
                                    </button>
                                </span>
                            )}
                        </m.li>
                    );
                })}
            </AnimatePresence>
        </ul>
    );
};
