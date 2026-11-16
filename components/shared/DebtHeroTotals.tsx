import React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { Currency, Person } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { getIntlLocale, type AppLanguage } from '../../utils/locale';
import { fill, fitFont, money } from '../home/parts';
import { SHARED_STRINGS } from './sharedStrings';
import type { DebtTotals } from './sharedSummary';

/** "Ana and Jelena", "Ana, Jelena and Marko", "Ana, Jelena and 3 more". */
export const namesList = (people: Person[], language: AppLanguage): string => {
  const names = people.map(person => person.name.trim()).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length > 3) {
    return fill(SHARED_STRINGS[language].andMore, { names: names.slice(0, 2).join(', '), count: names.length - 2 });
  }
  try {
    return new Intl.ListFormat(getIntlLocale(language), { style: 'long', type: 'conjunction' }).format(names);
  } catch {
    return names.join(', ');
  }
};

interface DebtHeroTotalsProps {
  totals: DebtTotals;
  currency: Currency;
  language: AppLanguage;
  /** An extra line under each side, such as "+€207.80 in Lisbon". */
  owedExtra?: string;
  oweExtra?: string;
  /** Text under the bar, on the right ("1 active event"). */
  aside?: string;
  showBar?: boolean;
}

/** Owed to you and you owe side by side on the screen header, with a bar for the balance. */
export const DebtHeroTotals: React.FC<DebtHeroTotalsProps> = ({ totals, currency, language, owedExtra, oweExtra, aside, showBar = true }) => {
  const t = TRANSLATIONS[language];
  const s = SHARED_STRINGS[language];
  const owed = money(totals.owed, currency, language);
  const owe = money(totals.owe, currency, language);
  const net = totals.owed - totals.owe;
  const caption = Math.abs(net) < 0.5
    ? s.allSquare
    : fill(net > 0 ? s.moreComing : s.moreGoing, { amount: money(Math.abs(net), currency, language) });
  const columns = [
    { key: 'owed', icon: ArrowDownLeft, label: s.owedToYou, amount: owed, names: namesList(totals.owedBy, language), extra: owedExtra },
    { key: 'owe', icon: ArrowUpRight, label: t.youOwe, amount: owe, names: totals.owing.length ? fill(s.toNames, { names: namesList(totals.owing, language) }) : '', extra: oweExtra },
  ];

  return (
    <div className="px-4 md:px-5">
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {columns.map((column, index) => (
          <div
            key={column.key}
            className={index === 1 ? 'min-w-0 border-l border-white/20 pl-4' : 'min-w-0 pr-4'}
            style={{ containerType: 'inline-size' }}
          >
            <span className="flex items-center gap-1.5 text-[14px] font-medium text-white/75">
              <column.icon size={15} aria-hidden="true" />
              {column.label}
            </span>
            <span
              className="mt-1 block whitespace-nowrap font-bold leading-[1.1] tracking-[-0.035em] tabular-nums"
              style={{ fontSize: fitFont(index === 0 ? 38 : 32, column.amount, 0.6) }}
            >
              {column.amount}
            </span>
            {column.extra && <span className="mt-1 block truncate text-[13px] font-semibold text-white/90">{column.extra}</span>}
            {column.names && <span className="mt-0.5 block truncate text-[13px] text-white/65">{column.names}</span>}
          </div>
        ))}
      </div>
      {showBar && (
        <>
          <div className="mt-4 flex h-[6px] w-full gap-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
            {totals.owed > 0 && <span className="h-full rounded-full bg-white" style={{ flexGrow: totals.owed }} />}
            {totals.owe > 0 && <span className="h-full rounded-full bg-white/40" style={{ flexGrow: totals.owe }} />}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px] text-white/75">
            <span className="min-w-0 truncate">{caption}</span>
            {aside && <span className="shrink-0">{aside}</span>}
          </div>
        </>
      )}
    </div>
  );
};
