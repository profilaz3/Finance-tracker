import React from 'react';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import type { Account, Category, Currency, Person } from '../../types';
import { CURRENCIES, TRANSLATIONS } from '../../constants';
import type { AppLanguage } from '../../utils/locale';
import { getShortDate } from '../../utils/formatters';
import { localizeCategoryName, localizeTransactionNote } from '../../utils/systemText';
import type { LedgerRow, PersonLedger } from '../../domain/personLedger';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { Illustration } from '../ui/Illustration';
import { BalanceInput } from '../BalanceInput';
import { fill } from '../home/parts';
import { eventAmount } from '../event-detail/eventStrings';
import type { PersonStrings } from './personStrings';

interface PersonHistoryProps {
  person: Person;
  ledger: PersonLedger;
  categories: Category[];
  accounts: Account[];
  language: AppLanguage;
  s: PersonStrings;
  /** The per-currency balance editor below the list. */
  editing: boolean;
  onToggleEditing: () => void;
  editingCurrency: Currency | null;
  onEditCurrency: (currency: Currency | null) => void;
  onUpdateBalance: (personId: string, currency: Currency, newBalance: number) => void;
}

const glyphClass = 'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full';

/**
 * "How it adds up": every entry that moved the balance, newest first, with the balance right
 * after it, then what has no entry behind it. Below, the per-currency balances can be set by hand.
 */
export const PersonHistory: React.FC<PersonHistoryProps> = ({
  person, ledger, categories, accounts, language, s, editing, onToggleEditing, editingCurrency, onEditCurrency, onUpdateBalance,
}) => {
  const t = TRANSLATIONS[language];
  const amount = (value: number, currency: Currency) => eventAmount(value, currency, language);

  const describe = (row: LedgerRow): { title: string; sub: string } => {
    const { transaction } = row;
    const category = categories.find(entry => entry.id === transaction.categoryId);
    const title = localizeTransactionNote(transaction.note, language) || (category ? localizeCategoryName(category, language) : '');
    const date = getShortDate(transaction.date, language);
    const wallet = accounts.find(account => account.id === transaction.accountId)?.name;
    const value = amount(Math.abs(row.delta), row.currency);
    switch (row.kind) {
      case 'repaid': return { title: fill(s.rowRepaid, { amount: value }), sub: [date, wallet].filter(Boolean).join(' · ') };
      case 'paidBack': return { title: fill(s.rowPaidBack, { amount: value }), sub: [date, wallet].filter(Boolean).join(' · ') };
      case 'share': return { title: fill(s.rowShare, { title, amount: value }), sub: `${date} · ${fill(s.youPaidBill, { amount: amount(transaction.splitDetails?.totalAmount ?? transaction.amount, transaction.currency) })}` };
      case 'lent': return { title: fill(s.rowLent, { title, amount: value }), sub: [date, wallet].filter(Boolean).join(' · ') };
      default: return { title: fill(s.rowBorrowed, { title, amount: value }), sub: [date, wallet].filter(Boolean).join(' · ') };
    }
  };

  const balanceText = (value: number, currency: Currency) => (
    <span className={clsx('shrink-0 whitespace-nowrap text-[15.5px] font-semibold tabular-nums', Math.abs(value) < 0.005 && 'text-muted')}>
      {amount(value, currency)}
    </span>
  );

  const zeroCurrencies = CURRENCIES.filter(currency => Math.abs(person.balances[currency] || 0) < 0.005);
  const footerLabel = zeroCurrencies.length > 0 && zeroCurrencies.length < CURRENCIES.length
    ? fill(s.addBalance, { list: zeroCurrencies.join(` ${s.or} `) })
    : s.editBalances;
  const empty = ledger.rows.length === 0 && ledger.offsets.length === 0;

  return (
    <section aria-labelledby="person-history-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="person-history-title" className="text-[19px] font-bold tracking-[-0.3px]">{s.howItAddsUp}</h2>
        {!empty && <span className="text-[13.5px] font-medium text-muted">{s.balance}</span>}
      </div>
      <ul className="paper-tile px-4">
        {ledger.rows.map(row => {
          const { title, sub } = describe(row);
          const category = categories.find(entry => entry.id === row.transaction.categoryId);
          return (
            <li key={row.transaction.id} className="flex min-h-[66px] items-center gap-3 border-b border-hair py-2.5 last:border-b-0">
              {row.kind === 'repaid' ? (
                <span className={clsx(glyphClass, 'bg-pos text-white')} aria-hidden="true"><ArrowDownLeft size={17} strokeWidth={2.4} /></span>
              ) : row.kind === 'paidBack' ? (
                <span className={clsx(glyphClass, 'bg-accent text-on-accent')} aria-hidden="true"><ArrowUpRight size={17} strokeWidth={2.4} /></span>
              ) : (
                <CategoryGlyph category={category} size={38} />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                {/* Two lines before it is cut, so the amount in it stays readable. */}
                <span className="line-clamp-2 break-words text-[15px] font-semibold leading-snug">{title}</span>
                <span className="truncate text-[13px] text-muted">{sub}</span>
              </span>
              {balanceText(row.balance, row.currency)}
            </li>
          );
        })}
        {ledger.offsets.map(([currency, value]) => (
          <li key={`offset-${currency}`} className="flex min-h-[66px] items-center gap-3 border-b border-hair py-2.5 last:border-b-0">
            <span className={clsx(glyphClass, 'bg-chip text-muted')} aria-hidden="true"><SlidersHorizontal size={16} /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold">{s.startRow}</span>
              <span className="truncate text-[13px] text-muted">{s.startSub}</span>
            </span>
            {balanceText(value, currency)}
          </li>
        ))}
        {empty && (
          <li className="flex flex-col items-center gap-1 py-5 text-center">
            <span className="h-20 w-[100px]" aria-hidden="true"><Illustration name="transactions" /></span>
            <p className="text-[14px] text-muted">{s.noHistory}</p>
          </li>
        )}
      </ul>

      <button
        type="button"
        onClick={onToggleEditing}
        aria-expanded={editing}
        aria-controls="person-balances"
        className="mx-auto flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-muted"
      >
        <Plus size={15} aria-hidden="true" className={clsx('transition-transform', editing && 'rotate-45')} />
        {footerLabel}
      </button>

      {editing && (
        <div id="person-balances" role="group" aria-label={t.balance} className="paper-tile overflow-hidden py-1">
          {CURRENCIES.map((currency, index) => {
            const value = person.balances[currency] || 0;
            const isEditing = editingCurrency === currency;
            return (
              <div
                key={currency}
                className={clsx(
                  'flex min-h-[60px] gap-x-3 gap-y-2 px-4 py-2.5',
                  // While editing, the input gets the full row width on its own line.
                  isEditing ? 'flex-col' : 'items-center',
                  index < CURRENCIES.length - 1 && 'border-b border-hair',
                )}
              >
                <span className="flex h-9 w-[68px] shrink-0 items-center gap-1.5 rounded-[12px] bg-chip pl-1.5 text-[12px] font-bold text-muted">
                  <CurrencyFlag currency={currency} size={22} />
                  {currency}
                </span>
                {isEditing ? (
                  <div className="w-full">
                    <BalanceInput
                      currency={currency}
                      initialAmount={value}
                      showCurrency={false}
                      onSave={next => {
                        onUpdateBalance(person.id, currency, next);
                        onEditCurrency(null);
                      }}
                      onCancel={() => onEditCurrency(null)}
                      language={language}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onEditCurrency(currency)}
                    aria-label={`${t.edit} ${currency}: ${amount(value, currency)}`}
                    className="flex min-h-10 flex-1 items-center gap-2 text-left"
                  >
                    <span className={clsx('whitespace-nowrap text-[17px] font-semibold tabular-nums', value > 0 ? 'text-pos' : value < 0 ? 'text-neg' : 'text-faint')}>
                      {value > 0 ? '+' : ''}{amount(value, currency)}
                    </span>
                    <Pencil size={13} className="shrink-0 text-faint" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
