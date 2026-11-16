import React, { useMemo } from 'react';
import clsx from 'clsx';
import { CalendarDays, CheckCircle2, Download, MoreHorizontal, FileText } from 'lucide-react';
import type { AppState } from '../../types';
import { computeMonthSummary, getUpcomingRecurring, isInMonth, monthKeyOf, parseLocalDate } from '../../domain/home';
import { getCountedIncomeAmount } from '../../domain/money';
import { resolveHomeHeader } from '../../domain/homeHeader';
import { formatNumber, formatShortDate, getIntlLocale } from '../../utils/locale';
import { TRANSLATIONS } from '../../constants';
import { HeroIconButton, HeroMenu, ScreenHero } from '../ui/ScreenHero';
import { fill, fitFont } from '../home/parts';
import { ACTIVITY_STRINGS } from './activityStrings';

interface ActivityHeroProps {
  state: AppState;
  onOpenCalendar: () => void;
  onSelect: () => void;
  onExport: () => void;
  onPrintableReport: () => void;
  isExportingPdf: boolean;
}

/** Whole numbers, or cents for small amounts in currencies that have them. */
const figure = (value: number, currency: AppState['baseCurrency'], language: AppState['language']): string => {
  const digits = Math.abs(value) < 100 && currency !== 'RSD' ? 2 : 0;
  return formatNumber(Math.abs(value), { minimumFractionDigits: digits, maximumFractionDigits: digits }, language);
};

interface StripLabel {
  at: number;
  text: string;
  align: 'start' | 'center' | 'end';
}

/**
 * This month day by day: spending bars up to today (this week brighter, today white), a dashed line
 * for the days to come with a ring on each bill that is due, and a dot under days with money in.
 */
const DayStrip: React.FC<{ state: AppState; now: Date; onOpen: () => void }> = ({ state, now, onOpen }) => {
  const s = ACTIVITY_STRINGS[state.language];
  const key = monthKeyOf(now);
  const summary = useMemo(
    () => computeMonthSummary(state, key, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.transactions, state.categories, state.baseCurrency, state.rates, key.year, key.month, now.getDate()],
  );
  const incomeDays = useMemo(() => {
    const days = new Set<number>();
    for (const transaction of state.transactions) {
      if (isInMonth(transaction.date, key) && getCountedIncomeAmount(transaction, state.baseCurrency, state.rates) > 0) {
        days.add(parseLocalDate(transaction.date).getDate());
      }
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.transactions, state.baseCurrency, state.rates, key.year, key.month]);
  const dueDays = useMemo(() => {
    const due = new Map<number, string>();
    for (const item of getUpcomingRecurring(state.recurringTransactions, now, 31)) {
      if (item.due.getMonth() !== key.month || item.due.getFullYear() !== key.year || item.due.getDate() <= now.getDate()) continue;
      if (!due.has(item.due.getDate())) due.set(item.due.getDate(), item.recurring.name || item.recurring.note || '');
    }
    return due;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.recurringTransactions, key.year, key.month, now.getDate()]);

  const days = summary.daysInMonth;
  const today = summary.todayIndex;
  const weekStart = Math.max(1, today - ((now.getDay() + 6) % 7));
  const max = Math.max(1, ...summary.byDay.slice(0, today));
  const at = (day: number) => ((day - 0.5) / days) * 100;

  // Month start and end at the edges, "Today" under today, and the next bill when there is room.
  const labels: StripLabel[] = [
    { at: 0, text: formatShortDate(new Date(key.year, key.month, 1), state.language), align: 'start' },
    { at: 100, text: formatShortDate(new Date(key.year, key.month, days), state.language), align: 'end' },
  ];
  const roomy = (position: number) => labels.every(label =>
    Math.abs(label.at - position) >= (label.align === 'center' ? 26 : 20));
  if (roomy(at(today))) labels.push({ at: at(today), text: s.stripToday, align: 'center' });
  const nextDue = [...dueDays.entries()].sort((a, b) => a[0] - b[0]).find(([, name]) => name);
  if (nextDue && roomy(at(nextDue[0]))) labels.push({ at: at(nextDue[0]), text: nextDue[1], align: 'center' });

  return (
    <button type="button" onClick={onOpen} aria-label={s.stripLabel} className="mt-5 block w-full overflow-visible text-left">
      <span aria-hidden="true" className="flex h-[58px] items-end gap-[3px]">
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const amount = summary.byDay[index] ?? 0;
          const past = day <= today;
          return (
            <span key={day} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              {past ? (
                <span
                  className={clsx(
                    'block w-full rounded-[3px]',
                    day === today ? 'bg-white' : day >= weekStart ? 'bg-white/75' : amount > 0 ? 'bg-white/35' : 'bg-white/20',
                  )}
                  // Square-root scale: one big day (rent) should not flatten the rest of the month.
                  style={{ height: amount > 0 ? Math.max(4, Math.sqrt(amount / max) * 52) : 2 }}
                />
              ) : (
                <>
                  {dueDays.has(day) && <span className="mb-1.5 block h-[7px] w-[7px] rounded-full ring-[1.5px] ring-white/80" />}
                  <span className="block w-full border-t-2 border-dashed border-white/30" />
                </>
              )}
            </span>
          );
        })}
      </span>
      <span aria-hidden="true" className="mt-1 flex h-[6px] gap-[3px]">
        {Array.from({ length: days }, (_, index) => (
          <span key={index} className="flex min-w-0 flex-1 justify-center">
            {incomeDays.has(index + 1) && <span className="block h-[5px] w-[5px] rounded-full bg-white/90" />}
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="relative mt-1.5 block h-[18px] text-[12px] font-medium text-white/70">
        {labels.map(label => (
          <span
            key={`${label.align}-${label.at}`}
            className={clsx(
              'absolute top-0 max-w-[34%] truncate whitespace-nowrap',
              label.align === 'center' && '-translate-x-1/2 text-white',
              label.align === 'end' && '-translate-x-full',
            )}
            style={{ left: `${label.at}%` }}
          >
            {label.text}
          </span>
        ))}
      </span>
    </button>
  );
};

export const ActivityHero: React.FC<ActivityHeroProps> = ({
  state,
  onOpenCalendar,
  onSelect,
  onExport,
  onPrintableReport,
  isExportingPdf,
}) => {
  const t = TRANSLATIONS[state.language];
  const s = ACTIVITY_STRINGS[state.language];
  const tone = resolveHomeHeader(state.homeHeader).tone;
  const now = new Date();
  const key = monthKeyOf(now);
  const summary = useMemo(
    () => computeMonthSummary(state, key, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.transactions, state.categories, state.baseCurrency, state.rates, key.year, key.month, now.getDate()],
  );
  const month = new Intl.DateTimeFormat(getIntlLocale(state.language), { month: 'long' }).format(now);
  const spent = figure(summary.spent, state.baseCurrency, state.language);

  return (
    <ScreenHero tone={tone} label={t.navActivity}>
      <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
        <h1 className="min-w-0 flex-1 truncate pl-1 text-[28px] font-bold tracking-[-0.03em]">{t.navActivity}</h1>
        <HeroIconButton icon={CalendarDays} label={t.calendar} onClick={onOpenCalendar} />
        <HeroMenu
          label={t.moreActions}
          icon={MoreHorizontal}
          items={[
            { icon: CheckCircle2, label: s.selectEntries, onSelect },
            { icon: Download, label: s.exportEntries, onSelect: onExport },
            { icon: FileText, label: s.printableReport, onSelect: onPrintableReport, disabled: isExportingPdf },
          ]}
        />
      </div>
      <div className="px-4 pb-[42px] pt-1 md:px-5 md:pb-5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
            <span className="block truncate py-px text-[14px] font-medium leading-5 text-white/80">{fill(s.spentIn, { month })}</span>
            <span
              className="mt-1 flex items-baseline gap-x-2 whitespace-nowrap font-bold leading-[1.08] tracking-[-0.04em] tabular-nums"
              style={{ fontSize: fitFont(46, `${spent} ${state.baseCurrency}`, 0.58) }}
            >
              <span>{spent}</span>
              <span className="text-[0.42em] font-semibold tracking-normal text-white/70">{state.baseCurrency}</span>
            </span>
          </div>
          {summary.income > 0 && (
            <div className="shrink-0 pb-1 text-right">
              <span className="block text-[13px] text-white/75">{s.moneyIn}</span>
              <span className="block whitespace-nowrap text-[19px] font-bold tabular-nums">
                +{figure(summary.income, state.baseCurrency, state.language)}
              </span>
            </div>
          )}
        </div>
        <DayStrip state={state} now={now} onOpen={onOpenCalendar} />
      </div>
    </ScreenHero>
  );
};
