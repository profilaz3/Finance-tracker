import { describe, expect, it } from 'vitest';
import type { RecurringTransaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { pluralForm, pluralText } from '../utils/plural';
import { readBudgetLimit } from '../utils/budgetLimit';
import { nextAccountOrder } from '../components/settings/useAccountSettingsState';
import { teamErrorText } from '../components/settings/teamErrors';
import {
  amountError,
  buildRecurring,
  draftFromRecurring,
  emptyRecurringDraft,
  localToday,
  recurringUpdates,
  rescheduledNextDue,
  validateRecurringDraft,
  withAccount,
  withType,
} from '../components/settings/recurringDraft';

const accounts = [
  { id: 'cash', currency: 'RSD' as const },
  { id: 'euro', currency: 'EUR' as const },
];
const categories = [
  { id: 'food', type: 'expense' as const },
  { id: 'salary', type: 'income' as const },
];

describe('pluralText', () => {
  it('uses the Serbian one / few / other forms', () => {
    const forms = { one: '{count} transakcija', few: '{count} transakcije', other: '{count} transakcija' };
    expect(pluralForm(1, 'sr')).toBe('one');
    expect(pluralForm(3, 'sr')).toBe('few');
    expect(pluralForm(5, 'sr')).toBe('other');
    expect(pluralForm(21, 'sr')).toBe('one');
    expect(pluralForm(22, 'sr')).toBe('few');
    expect(pluralForm(12, 'sr')).toBe('other');
    expect(pluralText(22, 'sr', forms)).toBe('22 transakcije');
  });

  it('falls back to other when there is no few form (English)', () => {
    expect(pluralText(1, 'en', { one: '{count} transaction', other: '{count} transactions' })).toBe('1 transaction');
    expect(pluralText(3, 'en', { one: '{count} transaction', other: '{count} transactions' })).toBe('3 transactions');
  });
});

describe('readBudgetLimit', () => {
  it('reads Serbian thousands and decimals', () => {
    expect(readBudgetLimit('50.000', 'sr')).toEqual({ value: 50000, invalid: false });
    expect(readBudgetLimit('50 000', 'sr')).toEqual({ value: 50000, invalid: false });
    expect(readBudgetLimit('1.500,50', 'sr')).toEqual({ value: 1500.5, invalid: false });
    expect(readBudgetLimit('1500,5', 'sr')).toEqual({ value: 1500.5, invalid: false });
  });

  it('treats empty as no limit but never turns bad text into no limit', () => {
    expect(readBudgetLimit('', 'sr')).toEqual({ value: 0, invalid: false });
    expect(readBudgetLimit('abc', 'sr')).toEqual({ value: 0, invalid: true });
    expect(readBudgetLimit('-200', 'en')).toEqual({ value: 0, invalid: true });
    expect(readBudgetLimit('5000000000', 'en')).toEqual({ value: 0, invalid: true });
  });
});

describe('nextAccountOrder', () => {
  it('puts a new wallet after the last one, also when orders are missing', () => {
    expect(nextAccountOrder([])).toBe(0);
    expect(nextAccountOrder([{ order: 0 }, { order: 4 }, { order: 2 }])).toBe(5);
    expect(nextAccountOrder([{}, {}, {}])).toBe(3);
  });
});

describe('teamErrorText', () => {
  const en = TRANSLATIONS.en;
  const sr = TRANSLATIONS.sr;

  it('translates known service messages', () => {
    expect(teamErrorText(new Error('This email is already a member of the team'), sr)).toBe(sr.teamErrAlreadyMember);
    expect(teamErrorText(new Error('Team names can be at most 60 characters'), sr)).toBe(sr.teamErrNameTooLong);
    expect(teamErrorText(new TypeError('Failed to fetch'), en)).toBe(en.teamErrOffline);
  });

  it('keeps the generic wrapper for anything else', () => {
    expect(teamErrorText(new Error('boom'), en)).toBe(en.teamActionFailed.replace('{error}', 'boom'));
    expect(teamErrorText(undefined, en)).toBe(en.teamActionFailed.replace('{error}', en.teamErrUnknown));
  });
});

describe('recurring draft', () => {
  const now = new Date(2026, 10, 14, 0, 30); // just after midnight, local time

  it('uses the local day, not the UTC one', () => {
    expect(localToday(now)).toBe('2026-11-14');
  });

  it('preselects the first wallet and its currency, but no category', () => {
    const draft = emptyRecurringDraft(accounts, 'EUR', now);
    expect(draft).toMatchObject({ accountId: 'cash', currency: 'RSD', categoryId: '', startDate: '2026-11-14' });
  });

  it('reads amounts in the app language and rejects zero or negative amounts', () => {
    expect(amountError('1.500,50', 'sr')).toBeUndefined();
    expect(amountError('1500,50', 'en')).toBeUndefined();
    expect(amountError('', 'sr')).toBe('amountRequired');
    expect(amountError('abc', 'sr')).toBe('amountUnreadable');
    expect(amountError('-50', 'sr')).toBe('amountNotPositive');
    expect(amountError('0', 'sr')).toBe('amountNotPositive');
    expect(amountError('0,001', 'sr')).toBe('amountNotPositive');
  });

  it('requires a name, a category of the right type and an existing wallet', () => {
    const draft = { ...emptyRecurringDraft(accounts, 'EUR', now), amountText: '10' };
    expect(validateRecurringDraft(draft, categories, accounts, 'en')).toEqual({ name: 'nameRequired', category: 'categoryRequired' });
    const filled = { ...draft, name: 'Rent', categoryId: 'salary' };
    expect(validateRecurringDraft(filled, categories, accounts, 'en')).toEqual({ category: 'categoryRequired' });
    expect(validateRecurringDraft({ ...filled, categoryId: 'food' }, categories, accounts, 'en')).toEqual({});
    expect(validateRecurringDraft({ ...filled, categoryId: 'food', accountId: 'gone' }, categories, accounts, 'en')).toEqual({ account: 'accountRequired' });
  });

  it('moves the currency with the wallet until one is chosen', () => {
    const draft = emptyRecurringDraft(accounts, 'EUR', now);
    expect(withAccount(draft, 'euro', accounts).currency).toBe('EUR');
    expect(withAccount({ ...draft, currency: 'USD', currencyChosen: true }, 'euro', accounts).currency).toBe('USD');
  });

  it('drops a category of the other type when the type changes', () => {
    const draft = { ...emptyRecurringDraft(accounts, 'EUR', now), categoryId: 'food' };
    expect(withType(draft, 'income', categories).categoryId).toBe('');
    expect(withType(draft, 'expense', categories).categoryId).toBe('food');
  });

  it('builds a rule with a rounded positive amount starting on the local day', () => {
    const draft = { ...emptyRecurringDraft(accounts, 'EUR', now), name: ' Rent ', amountText: '1.500,505', categoryId: 'food' };
    const rule = buildRecurring(draft, 'sr', 'r1', now);
    expect(rule).toMatchObject({ id: 'r1', name: 'Rent', amount: 1500.51, currency: 'RSD', startDate: '2026-11-14', nextDue: '2026-11-14', isActive: true });
    expect(buildRecurring({ ...draft, startDate: '' }, 'sr', 'r2', now).startDate).toBe('2026-11-14');
  });

  const rule: RecurringTransaction = {
    id: 'r1',
    name: 'Gym',
    amount: 2500,
    currency: 'RSD',
    categoryId: 'food',
    accountId: 'cash',
    type: 'expense',
    frequency: 'monthly',
    startDate: '2026-01-10',
    nextDue: '2026-12-10',
    lastGenerated: '2026-11-10T08:00:00.000Z',
    isActive: true,
  };

  it('prefills an edit with the positive amount in the app language', () => {
    const draft = draftFromRecurring({ ...rule, amount: 1500.5 }, categories, accounts, 'sr');
    expect(draft).toMatchObject({ amountText: '1500,5', categoryId: 'food', accountId: 'cash', currencyChosen: true, startDate: '2026-01-10' });
    expect(draftFromRecurring({ ...rule, accountId: 'gone' }, categories, accounts, 'sr').accountId).toBe('');
  });

  it('keeps the next due date when the schedule did not change', () => {
    const updates = recurringUpdates(rule, { ...draftFromRecurring(rule, categories, accounts, 'en'), amountText: '3000' }, 'en', now);
    expect(updates).toMatchObject({ amount: 3000, nextDue: '2026-12-10' });
  });

  it('continues a changed schedule from today without going back over generated dates', () => {
    const next = rescheduledNextDue(rule, { startDate: '2026-01-10', frequency: 'weekly' }, now);
    expect(next >= '2026-11-14').toBe(true);
    expect(next < '2026-11-21').toBe(true);
    // A rule that never ran starts on its (new) start date.
    expect(rescheduledNextDue({ ...rule, lastGenerated: undefined }, { startDate: '2026-12-01', frequency: 'weekly' }, now)).toBe('2026-12-01');
    // A start date in the future is the next due date.
    expect(rescheduledNextDue(rule, { startDate: '2027-01-05', frequency: 'monthly' }, now)).toBe('2027-01-05');
  });
});
