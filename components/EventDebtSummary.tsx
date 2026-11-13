import React, { useMemo } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, PartyPopper, Wallet } from 'lucide-react';
import { Person, SharedExpense, Currency, ExchangeRates, EventDebt } from '../types';
import { calculateEventSettlement } from '../domain/events';
import { getTranslations } from '../utils/i18n';
import { getAppLanguage } from '../utils/locale';
import { money } from './home/parts';
import { MOTION } from '../config';

interface EventDebtSummaryProps {
    expenses: SharedExpense[];
    people: Person[];
    baseCurrency: Currency;
    /** With rates, all currencies are netted into `baseCurrency`. */
    rates?: ExchangeRates;
    /** Id used for the current user in `expenses` (shown as "You" when not in `people`). */
    selfId?: string;
    /** Record a suggested payment as done. Without it the list is read-only. */
    onMarkPaid?: (debt: EventDebt) => void;
    /** The event has real spending, so an empty plan means everyone is even. */
    hasSpending?: boolean;
}

const SELF_FALLBACK_ID = 'self';
const FALLBACK_COLOR = '#9E9E9E';

export const debtKey = (debt: EventDebt) => `${debt.from}>${debt.to}>${debt.currency}`;

export const EventDebtSummary: React.FC<EventDebtSummaryProps> = ({
    expenses = [],
    people = [],
    baseCurrency,
    rates,
    selfId,
    onMarkPaid,
    hasSpending = false,
}) => {
    const t = getTranslations();
    const language = getAppLanguage();
    const reduceMotion = useReducedMotion();
    const debts = useMemo(
        () => calculateEventSettlement(expenses || [], { currency: baseCurrency, rates }),
        [expenses, baseCurrency, rates],
    );

    const isSelf = (id: string) => id === SELF_FALLBACK_ID || (!!selfId && id === selfId);
    // Debts to participants that are not in `people` are still shown.
    const resolvePerson = (id: string): Pick<Person, 'name' | 'color' | 'avatar'> => {
        const person = people.find(p => p.id === id);
        if (person) return person;
        return { name: isSelf(id) ? t.you : t.unknown, color: FALLBACK_COLOR };
    };

    if (debts.length === 0) {
        if (!hasSpending) {
            return (
                <div className="flex flex-col items-center gap-2 rounded-[18px] bg-chip py-6 text-center text-muted">
                    <Wallet size={22} aria-hidden="true" />
                    <p className="text-[13px]">{t.noDebtsToSettle}</p>
                </div>
            );
        }
        return (
            <m.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={MOTION.modal.spring}
                className="flex flex-col items-center gap-1.5 rounded-[22px] bg-accent-soft px-6 py-6 text-center"
                role="status"
            >
                <m.span
                    initial={reduceMotion ? false : { scale: 0.4, rotate: -18 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.08 }}
                    className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_8px_24px_-8px_rgb(var(--accent-rgb)/0.6)]"
                    aria-hidden="true"
                >
                    <PartyPopper size={26} />
                </m.span>
                <p className="text-[17px] font-bold text-accent">{t.eventAllSettled}</p>
                <p className="text-[13px] text-muted">{t.eventAllSettledHint}</p>
            </m.div>
        );
    }

    const face = (person: Pick<Person, 'name' | 'color' | 'avatar'>, className = '') => (
        <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold text-white shadow-[0_0_0_2.5px_var(--paper-tile)] ${className}`}
            style={{ background: person.color }}
            aria-hidden="true"
        >
            {person.avatar && /^(data:|http)/.test(person.avatar)
                ? <img src={person.avatar} alt="" className="h-full w-full object-cover" />
                : person.name.slice(0, 1).toUpperCase()}
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
                                className={`flex items-center gap-3 py-3 ${index < debts.length - 1 ? 'border-b border-hair' : ''}`}
                            >
                                <span className="relative flex shrink-0 items-center" aria-hidden="true">
                                    {face(fromPerson)}
                                    <span className="z-[1] -mx-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--paper-tile)] text-faint">
                                        <ArrowRight size={12} strokeWidth={2.6} />
                                    </span>
                                    {face(toPerson)}
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-[14px] font-semibold">{sentence(debt)}</span>
                                    <span className={`truncate text-[16px] font-bold tabular-nums ${youPay ? 'text-neg' : youGet ? 'text-pos' : ''}`}>
                                        {money(debt.amount, debt.currency, language, true)}
                                    </span>
                                </span>
                                {onMarkPaid && (
                                    <button
                                        type="button"
                                        onClick={() => onMarkPaid(debt)}
                                        aria-label={`${t.markPaid}: ${sentence(debt)}, ${money(debt.amount, debt.currency, language, true)}`}
                                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[13px] font-semibold text-accent"
                                    >
                                        <Check size={15} strokeWidth={2.6} aria-hidden="true" />
                                        {t.markPaid}
                                    </button>
                                )}
                            </m.li>
                        );
                    })}
                </AnimatePresence>
            </ul>
        </div>
    );
};
