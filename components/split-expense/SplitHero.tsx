import React, { useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Check, ChevronDown, PenLine, Plane, X } from 'lucide-react';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import type { Currency, Event, HomeHeaderTone, Person } from '../../types';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { AmountInput } from '../ui/AmountInput';
import { HeroIconButton, ON_COLOUR } from '../ui/ScreenHero';
import { Avatar, fitFont } from '../home/parts';
import { formatMoney } from '../../utils/locale';
import { formatAmountForInput } from '../../utils/numberInput';
import { hasAmountOperator, parseAmountExpression } from '../../utils/amountExpression';
import type { useSheetDrag } from '../../hooks/useSheetDrag';
import { SELF } from './splitDraft';
import type { SplitForm } from './useSplitForm';
import type { SplitStrings } from './splitStrings';

interface SplitHeroProps {
    form: SplitForm;
    title: string;
    titleId: string;
    tone: HomeHeaderTone;
    /** The user's own profile, for the "You" avatar. */
    userProfile?: Person;
    event?: Event;
    /** "Who paid" is offered for a new split; an existing entry was paid from my wallet. */
    showPayers: boolean;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
    s: SplitStrings;
    onClose: () => void;
    handleProps: ReturnType<typeof useSheetDrag>['handleProps'];
}

/** The user's own avatar: their profile picture or initials, or the "me" letter without a profile. */
export const SelfAvatar: React.FC<{ userProfile?: Person; size: number; letter: string; className?: string }> = ({ userProfile, size, letter, className }) =>
    userProfile ? (
        <Avatar name={userProfile.name} color={userProfile.color} image={userProfile.avatar} size={size} />
    ) : (
        <span
            aria-hidden="true"
            className={clsx('flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-on-accent', className)}
            style={{ width: size, height: size, fontSize: size < 36 ? 12 : 14 }}
        >
            {letter}
        </span>
    );

/**
 * The top of the split form, in the Home header colour: what it was for, the total with its
 * currency, and who paid (me, or one of my people).
 */
export const SplitHero: React.FC<SplitHeroProps> = ({ form, title, titleId, tone, userProfile, event, showPayers, language, t, s, onClose, handleProps }) => {
    const { draft, iPaid } = form;
    const [typed, setTyped] = useState('');
    // The text in the field: a sum as typed, otherwise the amount (so outside changes show too).
    const amount = draft.amount ?? 0;
    const text = hasAmountOperator(typed) && parseAmountExpression(typed, language) === draft.amount
        ? typed
        : amount > 0 ? formatAmountForInput(amount, language) : '';
    const money = (value: number) => formatMoney(value, draft.currency, language);
    const facts: string[] = [];
    if (amount > 0 && hasAmountOperator(text)) facts.push(s.sum.replace('{amount}', money(amount)));
    if (iPaid && form.feesInSplitCurrency > 0 && !form.feesInvalid) facts.push(t.splitFeesAdded.replace('{amount}', money(form.feesInSplitCurrency)));

    const payerChip = (id: string, name: string, avatar: React.ReactNode) => {
        const on = draft.payerId === id;
        return (
            <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => form.pickPayer(id)}
                className={clsx(
                    'flex h-11 shrink-0 items-center gap-2 rounded-full pl-1 pr-4 text-[15px] font-semibold transition-colors',
                    on ? 'bg-white text-[#0B0D0C] shadow-[0_4px_14px_rgba(0,0,0,0.18)]' : clsx(ON_COLOUR, 'text-white'),
                )}
            >
                {avatar}
                <span className="max-w-[9rem] truncate">{name}</span>
            </button>
        );
    };

    return (
        <section className={clsx('hero-bg relative px-4 pb-5', tone === 'dark' && 'hero-dark')}>
            <div className="touch-none pb-3 pt-2 md:pb-1 md:pt-4" {...handleProps}>
                <div className="mx-auto h-[5px] w-9 rounded-full bg-white/30 md:hidden" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2.5">
                <h2 id={titleId} className="min-w-0 flex-1 truncate pl-1 text-[20px] font-bold tracking-[-0.3px] text-white">{title}</h2>
                {form.linkable ? (
                    // The active event: tap to put the split in it or keep it out.
                    <button
                        type="button"
                        aria-pressed={form.linked}
                        aria-label={s.inEvent.replace('{event}', form.linkable.name)}
                        onClick={() => form.setLinked(!form.linked)}
                        className={clsx(
                            'flex h-11 min-w-0 max-w-[48%] items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors',
                            form.linked ? clsx(ON_COLOUR, 'text-white') : 'border-[1.5px] border-dashed border-white/45 text-white/75',
                        )}
                    >
                        <Plane size={14} aria-hidden="true" className="shrink-0" />
                        <span className="truncate">{form.linkable.name}</span>
                        {form.linked && <Check size={14} strokeWidth={3} aria-hidden="true" className="shrink-0" />}
                    </button>
                ) : event && (
                    <span className={clsx(ON_COLOUR, 'flex h-9 min-w-0 max-w-[45%] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-white')}>
                        <Plane size={14} aria-hidden="true" className="shrink-0 text-white/75" />
                        <span className="truncate">{event.name}</span>
                    </span>
                )}
                <HeroIconButton icon={X} label={t.close} onClick={onClose} />
            </div>

            {/* What it was for */}
            <div className="mt-3 flex h-11 items-center gap-2 rounded-[14px] px-1 focus-within:ring-2 focus-within:ring-white/60">
                <PenLine size={16} aria-hidden="true" className="shrink-0 text-white/60" />
                <label htmlFor="split-note" className="sr-only">{t.note}</label>
                <input
                    id="split-note"
                    data-focus-ring="parent"
                    value={draft.note}
                    onChange={event => form.set('note', event.target.value)}
                    placeholder={s.notePlaceholder}
                    autoComplete="off"
                    enterKeyHint="next"
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-white caret-white outline-none placeholder:text-white/55"
                />
            </div>

            {/* The total */}
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
                    <label htmlFor="split-amount" className="sr-only">{t.total}</label>
                    <AmountInput
                        id="split-amount"
                        language={language}
                        value={draft.amount}
                        emptyWhenZero
                        parse={parseAmountExpression}
                        placeholder="0"
                        onValueChange={form.onAmountChange}
                        onInput={event => setTyped(event.currentTarget.value)}
                        data-focus-ring="parent"
                        aria-invalid={form.amountInvalid}
                        aria-describedby={form.amountInvalid ? 'split-amount-error' : undefined}
                        className="h-[64px] w-full bg-transparent font-bold tabular-nums text-white caret-white outline-none placeholder:text-white/40"
                        style={{ fontSize: fitFont(56, text || '0', 0.62), letterSpacing: '-0.045em' }}
                    />
                </div>
                <span className={clsx(ON_COLOUR, 'relative flex h-10 shrink-0 items-center gap-1.5 rounded-full pl-1.5 pr-2.5 text-white')}>
                    <CurrencyFlag currency={draft.currency} size={26} />
                    <span className="text-[14px] font-bold">{draft.currency}</span>
                    <ChevronDown size={15} aria-hidden="true" className="text-white/65" />
                    <select
                        id="split-currency"
                        aria-label={t.currency}
                        value={draft.currency}
                        onChange={event => form.set('currency', event.target.value as Currency)}
                        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
                    >
                        {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                    </select>
                </span>
            </div>
            {form.amountInvalid ? (
                <p id="split-amount-error" role="alert" className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-2.5 py-1 text-[13px] font-semibold text-white">
                    <AlertCircle size={14} aria-hidden="true" className="shrink-0" />
                    {t.splitErrorInvalidAmount}
                </p>
            ) : facts.length > 0 ? (
                <p className="break-words text-[13.5px] font-medium tabular-nums text-white/65">{facts.join(' · ')}</p>
            ) : null}

            {showPayers && (
                <>
                    <p id="split-payer-label" className="mt-4 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-white/65">{s.whoPaid}</p>
                    <div role="radiogroup" aria-labelledby="split-payer-label" className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 py-0.5">
                        {payerChip(SELF, s.you, <SelfAvatar userProfile={userProfile} size={36} letter={t.meInitial} className="!bg-white/25 !text-white" />)}
                        {form.people.map(person => payerChip(person.id, person.name, <Avatar name={person.name} color={person.color} image={person.avatar} size={36} />))}
                    </div>
                </>
            )}
        </section>
    );
};
