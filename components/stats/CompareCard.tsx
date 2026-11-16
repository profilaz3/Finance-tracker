import React from 'react';
import clsx from 'clsx';
import { Plane, TrendingDown, TrendingUp } from 'lucide-react';
import type { Category, Currency, Event } from '../../types';
import type { AnalyticsPeriod } from '../../utils/analyticsSelectors';
import type { CompareMover, PeriodComparison } from '../../domain/periodCompare';
import { formatDate, formatShortDate, getIntlLocale, type AppLanguage } from '../../utils/locale';
import { localizeCategoryName } from '../../utils/systemText';
import { pluralText } from '../../utils/plural';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { IconTile } from '../ui/IconTile';
import { fill } from '../home/parts';
import { plainAmount, type AnalyticsStrings } from './analyticsStrings';

interface CompareCardProps {
  comparison: PeriodComparison;
  period: AnalyticsPeriod;
  categories: Category[];
  events: Event[];
  currency: Currency;
  language: AppLanguage;
  s: AnalyticsStrings;
}

const byPeriod = <T,>(period: AnalyticsPeriod, month: T, quarter: T, year: T): T =>
  period === 'month' ? month : period === 'quarter' ? quarter : year;

/**
 * "Compared with October": this period so far against the same days of the last one, and the
 * categories (or events) that moved the most, each with what was behind it.
 */
/** A bare day of the month; Serbian writes it as an ordinal ("1."), which Intl leaves out on its own. */
const dayOnly = (date: Date, language: AppLanguage) => {
  const day = formatDate(date, { day: 'numeric' }, language);
  return language === 'sr' && !day.endsWith('.') ? `${day}.` : day;
};

export const CompareCard: React.FC<CompareCardProps> = ({ comparison, period, categories, events, currency, language, s }) => {
  const locale = getIntlLocale(language);
  const amount = (value: number) => plainAmount(value, currency, locale);
  const { start, end, now, before, movers } = comparison;

  const title = byPeriod(
    period,
    fill(s.compareMonth, { month: formatDate(start, { month: 'long' }, language) }),
    s.compareQuarter,
    fill(s.compareYear, { year: String(start.getFullYear()) }),
  );
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const range = fill(s.range, {
    from: sameMonth ? dayOnly(start, language) : formatShortDate(start, language),
    to: formatShortDate(end, language),
  });
  const difference = Math.round(now - before);
  const summary = difference === 0
    ? fill(s.sameEven, { range })
    : fill(difference < 0 ? s.sameLess : s.sameMore, { range, amount: amount(Math.abs(difference)) });

  const describe = (mover: CompareMover): { name: string; sub: string; glyph: React.ReactNode } => {
    const event = mover.kind === 'event' ? events.find(entry => entry.id === mover.id) : undefined;
    const category = mover.kind === 'category' ? categories.find(entry => entry.id === mover.id) : undefined;
    const name = event?.name ?? (category ? localizeCategoryName(category, language) : mover.id);
    const notes = mover.notes.join(', ');
    let sub: string;
    if (mover.now === 0) sub = byPeriod(period, s.onlyMonth, s.onlyQuarter, s.onlyYear);
    else if (mover.before === 0 && (event || !notes)) sub = byPeriod(period, s.newMonth, s.newQuarter, s.newYear);
    else if (mover.delta < 0 && notes) sub = fill(byPeriod(period, s.lastMonth, s.lastQuarter, s.lastYear), { notes });
    else sub = notes || pluralText(mover.countNow, language, { one: s.entriesOne, few: 'entriesFew' in s ? s.entriesFew : undefined, other: s.entriesOther });
    const glyph = event
      ? <IconTile icon={Plane} color={event.color || 'var(--paper-muted)'} shape="circle" tone="solid" size={40} />
      : <CategoryGlyph category={category} size={40} shape="circle" tone="solid" />;
    return { name, sub, glyph };
  };

  return (
    <section aria-labelledby="analytics-compare-title" className="paper-tile px-4 pb-2 pt-4">
      <h2 id="analytics-compare-title" className="text-[19px] font-bold tracking-[-0.3px]">{title}</h2>
      <p className="mt-0.5 text-[14px] text-muted">{summary}</p>
      {movers.length === 0 ? (
        <p className="py-4 text-[14.5px] text-muted">{s.noMovers}</p>
      ) : (
        <ul className="mt-2">
          {movers.map(mover => {
            const { name, sub, glyph } = describe(mover);
            const up = mover.delta > 0;
            const Icon = up ? TrendingUp : TrendingDown;
            const shown = `${up ? '+' : '−'}${amount(Math.abs(mover.delta))}`;
            return (
              <li key={mover.key} className="flex min-h-[68px] items-center gap-3 border-b border-hair py-2.5 last:border-b-0">
                {glyph}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[16px] font-semibold">{name}</span>
                  <span className="truncate text-[13.5px] text-muted">{sub}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[16.5px] font-bold tabular-nums">
                  <Icon size={16} aria-hidden="true" className={clsx('shrink-0', up ? 'text-neg' : 'text-pos')} />
                  <span aria-hidden="true">{shown}</span>
                  <span className="sr-only">{fill(up ? s.more : s.less, { amount: `${amount(Math.abs(mover.delta))} ${currency}` })}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
