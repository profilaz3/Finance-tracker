import type { Account, Category, Currency, Event, Person, SplitMethod, SplitShare, Transaction } from '../../types';
import type { SplitPrefill } from './types';

/** The payer id that means "I paid". */
export const SELF = 'self';

/** Everything the split form edits. */
export interface SplitDraft {
    amount: number | undefined;
    /** In USD, like every stored fee. */
    fees: number | undefined;
    currency: Currency;
    note: string;
    categoryId: string;
    accountId: string;
    date: string;
    splitMethod: SplitMethod;
    /** One per person (never me): who is in the split and their part. */
    shares: SplitShare[];
    /** `SELF` when I paid, otherwise the person who did. */
    payerId: string;
}

interface DraftInput {
    transaction?: Transaction;
    prefill?: SplitPrefill;
    preselect?: string[];
    people: Person[];
    categories: Category[];
    accounts: Account[];
    baseCurrency: Currency;
    /** The event the split goes into: its people start in the split. */
    event?: Event;
    now?: Date;
}

const share = (personId: string, isIncluded: boolean, amount = 0, percentage = 0): SplitShare => ({ personId, amount, percentage, isIncluded });

/**
 * Where the form starts: exact amounts from a split receipt, the stored split when editing one,
 * an entry being split for the first time (evenly with the people picked on its details card or
 * its event's people), or an empty split (the event's people already in, when there is one).
 */
export const initialSplitDraft = ({ transaction, prefill, preselect, people, categories, accounts, baseCurrency, event, now = new Date() }: DraftInput): SplitDraft => {
    const today = now.toISOString();
    const inEvent = (person: Person) => !!event?.personIds.includes(person.id);

    if (prefill && !transaction) {
        const amountFor = (id: string) => prefill.amounts[id] ?? 0;
        return {
            amount: prefill.amount,
            fees: undefined,
            currency: prefill.currency,
            note: prefill.note,
            categoryId: prefill.categoryId,
            accountId: prefill.accountId,
            date: prefill.date,
            splitMethod: 'exact',
            shares: people.map(person => share(person.id, amountFor(person.id) > 0, amountFor(person.id))),
            payerId: prefill.payerId || SELF,
        };
    }

    if (transaction) {
        const base = {
            amount: transaction.amount,
            fees: transaction.fees || undefined,
            currency: transaction.currency,
            note: transaction.note || '',
            categoryId: transaction.categoryId,
            accountId: transaction.accountId,
            date: transaction.date || today,
            payerId: SELF,
        };
        if (transaction.splitDetails) {
            const stored = transaction.splitDetails.shares || [];
            return {
                ...base,
                splitMethod: transaction.splitDetails.splitMethod || 'equal',
                shares: people.map(person => {
                    const existing = stored.find(item => item.personId === person.id);
                    return share(person.id, !!existing, existing?.amount || 0, existing?.percentage || 0);
                }),
            };
        }
        const picked = preselect?.length ? new Set(preselect) : null;
        return {
            ...base,
            splitMethod: 'equal',
            shares: people.map(person => share(person.id, picked ? picked.has(person.id) : inEvent(person))),
        };
    }

    return {
        amount: undefined,
        fees: undefined,
        currency: baseCurrency,
        note: '',
        categoryId: categories.find(category => category.type === 'expense')?.id || categories[0]?.id || '',
        accountId: accounts[0]?.id || '',
        date: today,
        splitMethod: 'equal',
        shares: people.map(person => share(person.id, inEvent(person))),
        payerId: SELF,
    };
};

/**
 * Keeps the shares in step with the people list while the form is open: someone added (from the
 * form's "New person") gets a share, included when `include` says so; someone removed drops out.
 * Returns the same array when nothing changed.
 */
export const reconcileShares = (shares: SplitShare[], people: Person[], include: (person: Person) => boolean = () => false): SplitShare[] => {
    const ids = new Set(people.map(person => person.id));
    const known = new Set(shares.map(item => item.personId));
    const kept = shares.filter(item => ids.has(item.personId));
    const added = people.filter(person => !known.has(person.id));
    if (kept.length === shares.length && added.length === 0) return shares;
    return [...kept, ...added.map(person => share(person.id, include(person)))];
};

/** The event's people first, then everyone else, each group in its own order. */
export const orderSplitPeople = (people: Person[], event?: Event): Person[] => {
    if (!event) return people;
    const inEvent = new Set(event.personIds);
    return [...people.filter(person => inEvent.has(person.id)), ...people.filter(person => !inEvent.has(person.id))];
};

/**
 * Switches who paid. Someone else paying usually had a part too, so they join the split; if the
 * switch is what put them in (`autoIncluded`), switching away takes them out again.
 */
export const switchPayer = (
    shares: SplitShare[],
    nextPayer: string,
    autoIncluded: string | null,
): { shares: SplitShare[]; autoIncluded: string | null } => {
    let next = shares;
    if (autoIncluded && autoIncluded !== nextPayer) {
        next = next.map(item => (item.personId === autoIncluded ? { ...item, isIncluded: false, amount: 0, percentage: 0 } : item));
    }
    if (nextPayer === SELF) return { shares: next, autoIncluded: null };
    const payerShare = next.find(item => item.personId === nextPayer);
    if (!payerShare || payerShare.isIncluded) return { shares: next, autoIncluded: autoIncluded === nextPayer ? autoIncluded : null };
    return {
        shares: next.map(item => (item.personId === nextPayer ? { ...item, isIncluded: true } : item)),
        autoIncluded: nextPayer,
    };
};

/** "Ana", "Ana and Jelena", "Ana, Jelena and Marko", or the first two and how many more. */
export const listNames = (names: string[], locale: string, andMore: string): string => {
    if (names.length <= 3) {
        try {
            return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
        } catch {
            return names.join(', ');
        }
    }
    return andMore.replace('{names}', names.slice(0, 2).join(', ')).replace('{count}', String(names.length - 2));
};
