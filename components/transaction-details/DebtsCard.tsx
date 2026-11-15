import React from 'react';
import clsx from 'clsx';
import { Check, QrCode, User } from 'lucide-react';
import type { Currency, Person } from '../../types';
import type { TRANSLATIONS } from '../../constants';
import type { EntryDebt } from '../../domain/entryDebts';
import { formatMoney, formatNumber, type AppLanguage } from '../../utils/locale';

const isImageAvatar = (avatar?: string) => !!avatar && (avatar.startsWith('data:') || avatar.startsWith('http'));

export const PersonAvatar: React.FC<{ person?: Pick<Person, 'name' | 'avatar' | 'color'>; size?: number }> = ({ person, size = 30 }) => (
  <span
    className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
    style={{ width: size, height: size, background: person?.color || 'var(--paper-muted)', fontSize: Math.round(size * 0.42) }}
    aria-hidden="true"
  >
    {isImageAvatar(person?.avatar) ? (
      <img src={person!.avatar} alt="" className="h-full w-full object-cover" />
    ) : person?.avatar ? (
      <span style={{ fontSize: Math.round(size * 0.5) }}>{person.avatar}</span>
    ) : person?.name ? (
      person.name.trim().charAt(0).toUpperCase()
    ) : (
      <User size={Math.round(size * 0.5)} />
    )}
  </span>
);

interface DebtsCardProps {
  debts: EntryDebt[];
  people: Person[];
  currency: Currency;
  language: AppLanguage;
  t: typeof TRANSLATIONS['en'];
  /** Split bills list me first with my portion; an expense paid for one person has no split. */
  split?: { myPortion: number; me?: Pick<Person, 'name' | 'avatar' | 'color'> };
  onRequest?: (debt: EntryDebt, person: Person | undefined) => void;
}

const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value * 100, 0)) / 100;

/** One person's state on a one-person debt, as the line under their name. */
const singleSummary = (debt: EntryDebt, t: DebtsCardProps['t'], money: (value: number) => string): string =>
  debt.state === 'paid'
    ? t.detailsPaidBack
    : debt.state === 'partial'
      ? t.detailsStillOpen.replace('{amount}', money(debt.outstanding))
      : t.detailsNotPaidBack;

/**
 * Who is on the bill and who still owes: a progress bar of what came back, then a row per person
 * with "Paid" or a Request button that opens the IPS QR for what is still open.
 */
export const DebtsCard: React.FC<DebtsCardProps> = ({ debts, people, currency, language, t, split, onRequest }) => {
  const money = (value: number) => formatMoney(value, currency, language);
  const amounts = [...debts.map(debt => debt.amount), split?.myPortion ?? 0];
  // Rows are in the entry's currency (named in the header); whole amounts stay whole.
  const fractionDigits = amounts.some(value => Math.round(value * 100) % 100 !== 0) ? 2 : 0;
  const plain = (value: number) =>
    formatNumber(value, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }, language);
  const paidCount = debts.filter(debt => debt.state === 'paid').length;
  const owedTotal = sum(debts.map(debt => debt.amount));
  const backTotal = sum(debts.map(debt => debt.amount - debt.outstanding));
  const progress = owedTotal > 0 ? Math.min(1, backTotal / owedTotal) : 0;
  const allPaid = paidCount === debts.length;
  const summary = debts.length === 1
    ? singleSummary(debts[0], t, money)
    : allPaid
      ? t.detailsAllPaidBack
      : t.detailsPaidBackOf.replace('{paid}', String(paidCount)).replace('{count}', String(debts.length));

  const row = (debt: EntryDebt, index: number) => {
    const person = people.find(item => item.id === debt.personId);
    const name = person?.name || t.unknown;
    const sub = debts.length > 1 && debt.state === 'partial' ? t.detailsOwesAmount.replace('{amount}', money(debt.outstanding)) : '';
    return (
      <li
        key={debt.personId}
        className={clsx('flex min-h-[48px] items-center gap-2.5 py-1', (index > 0 || split) && 'border-t border-hair')}
      >
        <PersonAvatar person={person} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{name}</span>
          {sub && <span className="block truncate text-[12px] font-medium tabular-nums text-muted">{sub}</span>}
          {!split && <span className={clsx('block text-[12px] font-medium', debt.state === 'paid' ? 'text-pos' : 'text-muted')}>{summary}</span>}
        </span>
        {debt.state === 'paid' ? (
          <span className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--paper-pos)_13%,transparent)] px-2.5 text-[12px] font-semibold text-pos">
            <Check size={12} strokeWidth={2.6} aria-hidden="true" /> {t.detailsPaidShort}
          </span>
        ) : onRequest ? (
          <button
            type="button"
            onClick={() => onRequest(debt, person)}
            aria-label={t.detailsRequestFrom.replace('{amount}', money(debt.outstanding)).replace('{name}', name)}
            className="-my-1 flex h-10 shrink-0 items-center"
            data-focus-ring="parent"
          >
            <span className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-[12.5px] font-semibold text-on-accent [button:focus-visible_&]:ring-2 [button:focus-visible_&]:ring-accent [button:focus-visible_&]:ring-offset-2">
              <QrCode size={14} aria-hidden="true" /> {t.detailsRequest}
            </span>
          </button>
        ) : null}
        {split && <span className="min-w-[4rem] shrink-0 text-right text-[14px] font-semibold tabular-nums">{plain(debt.amount)}</span>}
      </li>
    );
  };

  if (!split) {
    return (
      <section className="paper-tile px-3.5 py-1" aria-label={t.person}>
        <ul>{debts.map(row)}</ul>
      </section>
    );
  }

  return (
    <section className="paper-tile px-3.5 pb-1 pt-3" aria-label={t.detailsSplitWays.replace('{count}', String(debts.length + 1))}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-semibold">{t.detailsSplitWays.replace('{count}', String(debts.length + 1))}</h3>
        <span className={clsx('min-w-0 truncate text-[12px] font-medium', allPaid ? 'text-pos' : 'text-muted')}>{summary}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-chip" aria-hidden="true">
        <div className="h-full rounded-full bg-pos transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <ul className="mt-1.5">
        <li className="flex min-h-[48px] items-center gap-2.5 py-1">
          <PersonAvatar person={split.me ?? { name: t.detailsYou, color: '' }} />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t.detailsYou}</span>
          <span className="min-w-[4rem] shrink-0 text-right text-[14px] font-semibold tabular-nums">{plain(split.myPortion)}</span>
        </li>
        {debts.map(row)}
      </ul>
    </section>
  );
};
