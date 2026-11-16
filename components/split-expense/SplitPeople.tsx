import React, { useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Check, Plus, Wallet, X } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { Person, SplitMethod, SplitShare } from '../../types';
import { Segmented } from '../ui/Segmented';
import { AmountInput } from '../ui/AmountInput';
import { Avatar, fitFont } from '../home/parts';
import { formatMoney } from '../../utils/locale';
import { formatSplitPercent } from './format';
import { SelfAvatar } from './SplitHero';
import type { SplitForm } from './useSplitForm';
import type { SplitStrings } from './splitStrings';

interface SplitPeopleProps {
    form: SplitForm;
    userProfile?: Person;
    /** Adds someone to People; without it there is no "New person" tile. */
    onAddPerson?: (name: string) => Promise<void>;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
    s: SplitStrings;
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

interface TileProps {
    on: boolean;
    payer: boolean;
    avatar: React.ReactNode;
    name: string;
    /** The share (or "Add"); it shrinks to fit the tile, never cut. */
    line: string;
    /** Without it the tile cannot be toggled ("You" is always in). */
    onToggle?: () => void;
    payerLabel: string;
}

const Tile: React.FC<TileProps> = ({ on, payer, avatar, name, line, onToggle, payerLabel }) => {
    const Element = onToggle ? 'button' : 'div';
    return (
        <Element
            {...(onToggle ? { type: 'button' as const, 'aria-pressed': on, onClick: onToggle } : {})}
            style={{ containerType: 'inline-size' }}
            className={clsx(
                'flex min-w-0 flex-col items-center gap-1 rounded-[20px] bg-[var(--paper-tile)] px-1.5 pb-2.5 pt-3 text-center transition-shadow duration-150',
                on ? 'shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))]' : 'shadow-[inset_0_0_0_1px_var(--paper-line)]',
            )}
        >
            <span className={clsx('relative mb-0.5', !on && 'opacity-55')}>
                {avatar}
                {on && (
                    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_0_2px_var(--paper-tile)]">
                        <Check size={12} strokeWidth={3.2} />
                    </span>
                )}
                {payer && (
                    <span aria-hidden="true" className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-on-surface text-[var(--paper-bg)] shadow-[0_0_0_2px_var(--paper-tile)]">
                        <Wallet size={11} strokeWidth={2.6} />
                    </span>
                )}
            </span>
            <span className="w-full truncate text-[14px] font-semibold leading-tight">
                {name}
                {payer && <span className="sr-only">, {payerLabel}</span>}
            </span>
            <span
                className={clsx('w-full whitespace-nowrap font-semibold tabular-nums leading-tight', on ? 'text-on-surface' : 'text-muted')}
                style={{ fontSize: fitFont(14, line, 0.6) }}
            >
                {line}
            </span>
        </Element>
    );
};

/**
 * Who the bill is split between: me (always in) and my people as tiles with their parts, how to
 * split (evenly, exact amounts or percentages), and a way to add someone new on the spot.
 */
export const SplitPeople: React.FC<SplitPeopleProps> = ({ form, userProfile, onAddPerson, language, t, s }) => {
    const { draft, people } = form;
    const { splitMethod, currency } = draft;
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const money = (value: number) => {
        const digits = Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2;
        return formatMoney(value, currency, language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    };
    const shareOf = (personId: string) => draft.shares.find(item => item.personId === personId);
    const line = (share: SplitShare | undefined) => {
        if (!share?.isIncluded) return s.add;
        return money(share.amount);
    };
    const isPercent = splitMethod === 'percentage';
    const included = people.filter(person => shareOf(person.id)?.isIncluded);
    const over = splitMethod === 'exact' ? form.remainingAmount < -0.005 : form.remainingPercentage < -0.005;

    const closeAdder = () => {
        setAdding(false);
        setNewName('');
        setAddError(null);
    };

    const addPerson = async () => {
        const name = newName.trim();
        if (!name || busy || !onAddPerson) return;
        // Someone with that name already: put them in instead of adding them twice.
        const existing = people.find(person => nameKey(person.name) === nameKey(name));
        if (existing) {
            if (!shareOf(existing.id)?.isIncluded) form.togglePerson(existing.id);
            closeAdder();
            return;
        }
        setBusy(true);
        setAddError(null);
        form.addPending(name);
        try {
            await onAddPerson(name);
            closeAdder();
        } catch (error) {
            console.error('Adding a person from the split form failed:', error);
            setAddError(s.addFailed.replace('{name}', name));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section aria-labelledby="split-between-label">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h3 id="split-between-label" className="whitespace-nowrap pl-1 text-[17px] font-bold tracking-[-0.2px]">{s.splitBetween}</h3>
                <Segmented<SplitMethod>
                    ariaLabel={s.method}
                    size="sm"
                    value={splitMethod}
                    onChange={form.setSplitMethod}
                    className="shrink-0"
                    options={[
                        { value: 'equal', label: <span className="whitespace-nowrap px-1">{s.equal}</span> },
                        { value: 'exact', label: <span className="whitespace-nowrap px-1">{s.exact}</span> },
                        { value: 'percentage', label: <span className="px-1"><span aria-hidden="true">%</span><span className="sr-only">{s.percent}</span></span> },
                    ]}
                />
            </div>

            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
                <Tile
                    on
                    payer={form.iPaid}
                    avatar={<SelfAvatar userProfile={userProfile} size={44} letter={t.meInitial} />}
                    name={s.you}
                    line={money(form.myShare)}
                    payerLabel={s.payer}
                />
                {people.map(person => {
                    const share = shareOf(person.id);
                    return (
                        <Tile
                            key={person.id}
                            on={!!share?.isIncluded}
                            payer={draft.payerId === person.id}
                            avatar={<Avatar name={person.name} color={person.color} image={person.avatar} size={44} />}
                            name={person.name}
                            line={line(share)}
                            onToggle={() => form.togglePerson(person.id)}
                            payerLabel={s.payer}
                        />
                    );
                })}
                {onAddPerson && (
                    <button
                        type="button"
                        aria-expanded={adding}
                        aria-controls={adding ? 'split-new-person-row' : undefined}
                        onClick={() => (adding ? closeAdder() : setAdding(true))}
                        className="flex min-w-0 flex-col items-center gap-1 rounded-[20px] px-1.5 pb-2.5 pt-3 text-center text-muted shadow-[inset_0_0_0_1.5px_var(--paper-line)]"
                    >
                        <span className="mb-0.5 flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-dashed border-current">
                            <Plus size={18} aria-hidden="true" />
                        </span>
                        <span className="w-full text-[13.5px] font-semibold leading-tight">{s.newPerson}</span>
                    </button>
                )}
            </div>

            {adding && (
                <div id="split-new-person-row" className="mt-2">
                    <div className="flex items-center gap-2 rounded-[18px] bg-[var(--paper-tile)] p-2 shadow-[inset_0_0_0_1px_var(--paper-line)]">
                        <label htmlFor="split-new-person" className="sr-only">{s.newPersonName}</label>
                        <input
                            id="split-new-person"
                            autoFocus
                            value={newName}
                            onChange={event => setNewName(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === 'Escape') {
                                    event.stopPropagation();
                                    closeAdder();
                                }
                                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                                // Enter adds the person; it never saves the whole split.
                                event.preventDefault();
                                void addPerson();
                            }}
                            placeholder={s.newPersonName}
                            autoComplete="off"
                            enterKeyHint="done"
                            maxLength={60}
                            className="h-11 min-w-0 flex-1 rounded-[12px] bg-chip px-3 text-[16px] font-medium text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                        />
                        <button
                            type="button"
                            onClick={() => void addPerson()}
                            disabled={!newName.trim() || busy}
                            className="h-11 shrink-0 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent disabled:opacity-50"
                        >
                            {s.addPerson}
                        </button>
                        <button
                            type="button"
                            onClick={closeAdder}
                            aria-label={t.cancel}
                            title={t.cancel}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-chip"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                    {addError && (
                        <p role="alert" className="mt-1.5 flex items-center gap-1 px-1 text-[12.5px] font-medium text-neg">
                            <AlertCircle size={13} aria-hidden="true" className="shrink-0" />
                            {addError}
                        </p>
                    )}
                </div>
            )}

            {/* Exact amounts or percentages: typed per person; mine is what they leave. */}
            {splitMethod !== 'equal' && included.length > 0 && (
                <div className="paper-tile mt-3 divide-y divide-hair px-3">
                    {included.map(person => {
                        const share = shareOf(person.id);
                        if (!share) return null;
                        const invalid = !!form.invalidShares[person.id];
                        const errorId = `split-share-${person.id}-error`;
                        return (
                            <div key={person.id} className="py-2.5">
                                <div className="flex items-center gap-2.5">
                                    <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[15px] font-semibold">{person.name}</span>
                                        {isPercent && <span className="whitespace-nowrap text-[12px] tabular-nums text-muted">{money(share.amount)}</span>}
                                    </span>
                                    <div className={clsx('relative shrink-0', isPercent ? 'w-[88px]' : 'w-[112px]')}>
                                        <AmountInput
                                            language={language}
                                            aria-label={isPercent ? `${person.name} %` : `${person.name} ${currency}`}
                                            value={isPercent ? share.percentage : share.amount}
                                            emptyWhenZero
                                            onValueChange={(value, text) => (isPercent
                                                ? form.updateSharePercentage(person.id, value, text)
                                                : form.updateShareAmount(person.id, value, text))}
                                            placeholder="0"
                                            aria-invalid={invalid}
                                            aria-describedby={invalid ? errorId : undefined}
                                            className={clsx(
                                                'h-11 w-full rounded-[12px] border-none bg-chip pl-3 text-right text-[16px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint focus:ring-2',
                                                isPercent ? 'pr-7' : 'pr-3',
                                                invalid ? 'ring-2 ring-neg focus:ring-neg' : 'focus:ring-accent',
                                            )}
                                        />
                                        {isPercent && <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-muted">%</span>}
                                    </div>
                                </div>
                                {invalid && (
                                    <p id={errorId} role="alert" className="mt-1 flex items-center gap-1 pl-[42px] text-[12px] font-medium text-neg">
                                        <AlertCircle size={12} aria-hidden="true" className="shrink-0" />
                                        {isPercent ? t.splitPercentInvalid : t.splitErrorInvalidAmount}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                    <div aria-live="polite" className={clsx('flex items-center gap-2.5 py-3', over ? 'text-neg' : '')}>
                        <SelfAvatar userProfile={userProfile} size={32} letter={t.meInitial} />
                        <span className="min-w-0 flex-1 text-[15px] font-semibold">{over ? (isPercent
                            ? t.splitPercentOver.replace('{percent}', formatSplitPercent(-form.remainingPercentage, language))
                            : t.splitSharesOverTotal.replace('{amount}', money(-form.remainingAmount))) : s.yourShare}</span>
                        {!over && (
                            <span className="shrink-0 whitespace-nowrap text-[15px] font-bold tabular-nums">
                                {isPercent ? `${formatSplitPercent(Math.max(0, form.remainingPercentage), language)} · ` : ''}{money(form.myShare)}
                            </span>
                        )}
                    </div>
                </div>
            )}
            {isPercent && included.length > 0 && <p className="mt-1.5 px-1 text-[12px] text-muted">{t.splitPercentHint}</p>}
        </section>
    );
};

