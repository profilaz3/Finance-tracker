import { useEffect, useMemo, useState } from 'react';
import type { Category, SplitMethod, Transaction } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { excludeOwnProfile } from '../../domain/people';
import { formatMoney } from '../../utils/locale';
import {
    calculateIPaidSplitSubmission,
    calculateRemainingAmount,
    calculateRemainingPercentage,
    calculateTheyPaidSubmission,
    calculateTotalSplitAmount,
    convertFeesToSplitCurrency,
    recalculateSplitShares,
    seedEvenPercentages,
    updatePercentageShare,
} from '../../utils/splitExpenseCalculator';
import { eventDayOf } from '../shared/sharedSummary';
import { formatSplitPercent } from './format';
import { SELF, initialSplitDraft, orderSplitPeople, reconcileShares, switchPayer, type SplitDraft } from './splitDraft';
import type { SplitStrings } from './splitStrings';
import type { SplitExpenseModalProps } from './types';

type Props = Pick<
    SplitExpenseModalProps,
    'people' | 'userProfile' | 'categories' | 'accounts' | 'baseCurrency' | 'language' | 'transaction' | 'events' | 'activeEvent' | 'linkToActiveEvent' | 'rates' | 'prefill' | 'preselect'
>;

/**
 * Reads what a field emitted. Text that can't be read counts as nothing (so the totals shown stay
 * honest) and is flagged; the field keeps the text. A negative number is flagged and the last value
 * kept, since storing 0 would make the field replace the typed text.
 */
const readTyped = (value: number | undefined, text: string) => ({
    invalid: value === undefined ? text.trim() !== '' : value < 0,
    keep: value !== undefined && value < 0,
    value,
});

const round2 = (value: number) => Math.round(value * 100) / 100;
const nameKey = (name: string) => name.trim().toLocaleLowerCase();

/** State, totals and submission for the split form. */
export const useSplitForm = (props: Props, s: SplitStrings) => {
    const { userProfile, categories, accounts, baseCurrency, language, transaction, events, activeEvent, linkToActiveEvent, rates, prefill, preselect } = props;
    const t = TRANSLATIONS[language];

    // A new split can go into the active event; it starts in it while a dated event is on today.
    const canLink = !transaction && !!activeEvent;
    const [linked, setLinked] = useState(() => canLink && (!!linkToActiveEvent || (!!activeEvent && eventDayOf(activeEvent) !== null)));
    // The event the split goes into: the entry's own, or the active one while linked.
    const eventId = transaction ? transaction.eventId : linked && activeEvent ? activeEvent.id : undefined;
    const event = eventId ? events?.find(item => item.id === eventId) ?? (activeEvent?.id === eventId ? activeEvent : undefined) : undefined;

    // The built-in "me" already stands for the user, so their own profile is not offered again.
    const people = useMemo(
        () => orderSplitPeople(excludeOwnProfile(props.people, userProfile, transaction?.splitDetails?.shares?.map(item => item.personId)), event),
        [props.people, userProfile, transaction, event],
    );

    const start = () => initialSplitDraft({ transaction, prefill, preselect, people, categories, accounts, baseCurrency, event });
    const [source, setSource] = useState({ transaction, prefill, preselect });
    const [draft, setDraft] = useState<SplitDraft>(start);
    const [amountInvalid, setAmountInvalid] = useState(false);
    const [feesInvalid, setFeesInvalid] = useState(false);
    const [invalidShares, setInvalidShares] = useState<Record<string, boolean>>({});
    // The person the payer switch put into the split, so switching away takes them out again.
    const [autoIncluded, setAutoIncluded] = useState<string | null>(null);
    // A name just added from "New person": they join the split when they show up in the list.
    const [pendingName, setPendingName] = useState<string | null>(null);
    if (source.transaction !== transaction || source.prefill !== prefill || source.preselect !== preselect) {
        setSource({ transaction, prefill, preselect });
        setDraft(start());
        setAmountInvalid(false);
        setFeesInvalid(false);
        setInvalidShares({});
        setAutoIncluded(null);
    }

    const { splitMethod, shares, payerId, currency } = draft;
    const iPaid = payerId === SELF;
    const set = <K extends keyof SplitDraft>(key: K, value: SplitDraft[K]) => setDraft(prev => ({ ...prev, [key]: value }));
    // Fees are my card's: they count only when I paid.
    const totalToSplit = calculateTotalSplitAmount(draft.amount, iPaid ? draft.fees : undefined, currency, rates);
    const feesInSplitCurrency = iPaid ? convertFeesToSplitCurrency(draft.fees, currency, rates) : 0;

    // Equal and percentage parts follow the total.
    useEffect(() => {
        if (splitMethod === 'equal' || splitMethod === 'percentage') {
            setDraft(prev => ({ ...prev, shares: recalculateSplitShares(prev.shares, prev.splitMethod, totalToSplit) }));
        }
    }, [totalToSplit, splitMethod]);

    // People added or removed while the form is open.
    useEffect(() => {
        setDraft(prev => {
            const next = reconcileShares(prev.shares, people, person => !!pendingName && nameKey(person.name) === pendingName);
            return next === prev.shares ? prev : { ...prev, shares: recalculateSplitShares(next, prev.splitMethod, totalToSplit) };
        });
        if (pendingName && people.some(person => nameKey(person.name) === pendingName)) setPendingName(null);
    }, [people, pendingName, totalToSplit]);

    const remainingAmount = calculateRemainingAmount(shares, totalToSplit);
    const remainingPercentage = calculateRemainingPercentage(shares);
    const includedCount = shares.filter(item => item.isIncluded).length;
    /** My part: what the others leave of the total. */
    const myShare = Math.max(0, remainingAmount);

    const onAmountChange = (value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setAmountInvalid(typed.invalid);
        if (!typed.keep) set('amount', typed.value);
    };

    const onFeesChange = (value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setFeesInvalid(typed.invalid);
        if (!typed.keep) set('fees', typed.value);
    };

    const setSplitMethod = (method: SplitMethod) => {
        setInvalidShares({});
        // Percentages start everyone, me included, on an even share; the effect fills the amounts.
        setDraft(prev => ({ ...prev, splitMethod: method, shares: method === 'percentage' ? seedEvenPercentages(prev.shares, totalToSplit) : prev.shares }));
    };

    const togglePerson = (personId: string) => {
        setInvalidShares(prev => ({ ...prev, [personId]: false }));
        if (autoIncluded === personId) setAutoIncluded(null);
        setDraft(prev => ({
            ...prev,
            shares: recalculateSplitShares(
                prev.shares.map(item => (item.personId === personId ? { ...item, isIncluded: !item.isIncluded } : item)),
                prev.splitMethod,
                totalToSplit,
            ),
        }));
    };

    const updateShareAmount = (personId: string, value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setInvalidShares(prev => ({ ...prev, [personId]: typed.invalid }));
        if (typed.keep) return;
        const amount = round2(typed.value ?? 0);
        setDraft(prev => ({ ...prev, shares: prev.shares.map(item => (item.personId === personId ? { ...item, amount } : item)) }));
    };

    // Above 100% is kept as typed: the reason under the button says it is over.
    const updateSharePercentage = (personId: string, value: number | undefined, text: string) => {
        const typed = readTyped(value, text);
        setInvalidShares(prev => ({ ...prev, [personId]: typed.invalid }));
        if (typed.keep) return;
        setDraft(prev => ({ ...prev, shares: updatePercentageShare(prev.shares, personId, typed.value ?? 0, totalToSplit) }));
    };

    const pickPayer = (id: string) => {
        if (id === payerId) return;
        const next = switchPayer(shares, id, autoIncluded);
        setAutoIncluded(next.autoIncluded);
        setDraft(prev => ({ ...prev, payerId: id, shares: recalculateSplitShares(next.shares, prev.splitMethod, totalToSplit) }));
    };

    const pickCategory = (category: Category) => set('categoryId', category.id);

    // Why saving is not possible yet, shown in place of the summary. My share is what the others
    // leave, so in exact and percentage splits anything from zero up is fine; only going over blocks.
    const blockReason = (() => {
        const sharesUnreadable = splitMethod !== 'equal' && shares.some(item => item.isIncluded && invalidShares[item.personId]);
        if (amountInvalid || (iPaid && feesInvalid) || sharesUnreadable) return t.splitBlockUnreadable;
        if (!(totalToSplit > 0)) return t.splitBlockNoAmount;
        if (iPaid && includedCount === 0) return t.splitBlockNoPeople;
        if (splitMethod === 'exact' && remainingAmount < -0.005) {
            return t.splitSharesOverTotal.replace('{amount}', formatMoney(-remainingAmount, currency, language));
        }
        if (splitMethod === 'percentage' && remainingPercentage < -0.005) {
            return t.splitPercentOver.replace('{percent}', formatSplitPercent(-remainingPercentage, language));
        }
        if (!iPaid && !(myShare > 0.004)) return s.nothingOwed;
        return null;
    })();

    const iPaidSubmission = (transactionId: string) => calculateIPaidSplitSubmission({
        amount: draft.amount,
        fees: draft.fees,
        currency,
        categoryId: draft.categoryId,
        accountId: draft.accountId,
        note: draft.note,
        transactionDate: draft.date,
        splitMethod,
        shares,
        rates,
        transactionId,
        transaction,
        eventId: event?.id,
        language,
    });

    /** The expense as it would be saved, for the event card; none while it cannot be saved. */
    const canPreview = iPaid && !!event && !blockReason;
    const preview = useMemo<Transaction | undefined>(
        () => (canPreview ? iPaidSubmission(transaction?.id ?? 'split-preview').transaction : undefined),
        // The submission reads only the draft, the event and these.
        [canPreview, draft, event?.id, transaction, rates, language],
    );

    /** Someone else paid: only what I owe them is saved. */
    const theyPaidSubmission = () => calculateTheyPaidSubmission({
        payerId,
        currency,
        recipients: [{ personId: SELF, name: t.me, amount: round2(myShare), isIncluded: true }],
    });

    return {
        draft,
        set,
        people,
        event,
        /** The active event a new split can go into (toggled from the header). */
        linkable: canLink ? activeEvent : undefined,
        linked,
        setLinked,
        iPaid,
        totalToSplit,
        feesInSplitCurrency,
        remainingAmount,
        remainingPercentage,
        includedCount,
        myShare,
        amountInvalid,
        feesInvalid,
        invalidShares,
        blockReason,
        preview,
        onAmountChange,
        onFeesChange,
        setSplitMethod,
        togglePerson,
        updateShareAmount,
        updateSharePercentage,
        pickPayer,
        pickCategory,
        addPending: (name: string) => setPendingName(nameKey(name)),
        submitIPaid: iPaidSubmission,
        submitTheyPaid: theyPaidSubmission,
    };
};

export type SplitForm = ReturnType<typeof useSplitForm>;
