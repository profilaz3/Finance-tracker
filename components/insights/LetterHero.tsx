import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { ChevronRight, Library, Mail, PenLine } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { CONFIG } from '../../config';
import {
  archiveList,
  buildLetterAggregates,
  hasEnoughForLetter,
  letterMonthFor,
  monthId,
  parseMonthId,
  type LetterInputs,
  type StoredLetter,
} from '../../domain/monthlyLetter';
import {
  clearOpenLetterRequest,
  generateLetter,
  getLetterSnapshot,
  subscribeLetters,
} from '../../services/letterService';
import { formatDate, formatNumber, type AppLanguage } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import { useBackLayer } from '../../hooks/useBackLayer';
import { ON_COLOUR } from '../ui/ScreenHero';
import { LetterSheet } from './LetterSheet';
import { fillTemplate, letterMonthName } from './letterFormat';
import type { InsightsStrings } from './insightsStrings';

interface LetterHeroProps {
  /** The active workspace's data. */
  state: LetterInputs;
  language: AppLanguage;
  s: InsightsStrings;
}

const aiConfigured = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

const readingMinutes = (letter: StoredLetter): number => {
  const words = [letter.title, ...letter.sections.flatMap(section => [section.heading, section.body])]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

const ShimmerOnColour: React.FC<{ width: string }> = ({ width }) => (
  <span className="block h-3.5 animate-pulse rounded-full bg-white/25 motion-reduce:animate-none" style={{ width }} />
);

/**
 * The letter in the Insights header: last month's letter with its numbers, or the way to have it
 * written. `sheet` (reading and the archive) goes outside the header, which clips and layers its content.
 */
export function useLetterHero({ state, language, s }: LetterHeroProps): { hero: React.ReactNode; sheet: React.ReactNode } {
  const t = TRANSLATIONS[language];
  const snapshot = useSyncExternalStore(subscribeLetters, getLetterSnapshot, getLetterSnapshot);
  const now = useMemo(() => new Date(), []);
  const latestMonth = monthId(letterMonthFor(now));
  const letters = useMemo(() => archiveList(snapshot.archive), [snapshot.archive]);
  const enough = useMemo(() => hasEnoughForLetter(buildLetterAggregates(state, letterMonthFor(now))), [state, now]);

  const [isOpen, setIsOpen] = useState(false);
  const [sheetMonth, setSheetMonth] = useState<string | null>(latestMonth);
  const [failedMonth, setFailedMonth] = useState<string | null>(null);

  const write = useCallback(async (month: string) => {
    setFailedMonth(null);
    const result = await generateLetter(state, language, { month });
    if (result.status !== 'ok') setFailedMonth(month);
  }, [state, language]);

  const open = useCallback((month: string | null) => {
    setSheetMonth(month);
    setIsOpen(true);
  }, []);

  // A tapped notification asked for a letter: open it, writing it first when it is missing.
  useEffect(() => {
    const requested = snapshot.openRequest;
    if (!requested || !snapshot.userId) return;
    clearOpenLetterRequest();
    open(requested);
    if (!snapshot.archive[requested] && !snapshot.writing.includes(requested) && aiConfigured()) void write(requested);
  }, [snapshot.openRequest, snapshot.userId, snapshot.archive, snapshot.writing, open, write]);

  const latest = snapshot.archive[latestMonth] ?? null;
  const writingLatest = snapshot.writing.includes(latestMonth);
  const shown = latest ?? (writingLatest || enough ? null : letters[0] ?? null);
  const cardMonth = shown?.month ?? latestMonth;
  const signedIn = Boolean(snapshot.userId);
  const canWrite = signedIn && enough && aiConfigured();

  // The average the letter month is compared with, worked out from today's data.
  const aggregates = useMemo(() => {
    const key = shown ? parseMonthId(shown.month) : null;
    return key ? buildLetterAggregates(state, key) : null;
  }, [state, shown]);

  useBackLayer('letter-sheet', isOpen, () => setIsOpen(false));

  const monthName = letterMonthName(cardMonth, language);
  const older = letters.filter(letter => letter.month !== cardMonth).length;
  const canRewrite = (month: string | null) => {
    if (!month || !aiConfigured()) return false;
    const key = parseMonthId(month);
    return Boolean(key) && hasEnoughForLetter(buildLetterAggregates(state, key!));
  };
  const plain = (value: number) => formatNumber(value, { maximumFractionDigits: 0 }, language);

  const tiles = (() => {
    if (!shown) return [];
    const { stats } = shown;
    const list: Array<{ label: string; value: string; sub: string }> = [
      { label: s.spent, value: plain(stats.spent), sub: fillTemplate(s.spentSub, { month: monthName }) },
    ];
    const vsAverage = aggregates?.spentVsAveragePct ?? null;
    const change = vsAverage ?? stats.spentChangePct;
    if (change !== null) {
      list.push({
        label: vsAverage !== null ? s.vsAverage : s.change,
        value: `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatNumber(Math.abs(change), { maximumFractionDigits: 0 }, language)}%`,
        sub: vsAverage !== null
          ? pluralText(aggregates!.averageMonths, language, { one: s.monthsOne, few: 'monthsFew' in s ? s.monthsFew : undefined, other: s.monthsOther })
          : s.monthBefore,
      });
    }
    if (stats.income > 0) {
      const kept = stats.income - stats.spent;
      list.push({
        label: kept >= 0 ? s.kept : s.over,
        value: plain(Math.abs(kept)),
        sub: fillTemplate(s.ofIncome, { amount: plain(stats.income) }),
      });
    }
    return list;
  })();

  const pastLetters = older > 0 && (
    <button
      type="button"
      onClick={() => open(null)}
      className="flex h-11 items-center gap-1.5 rounded-full px-1 text-[14px] font-semibold text-white/80"
    >
      <Library size={16} aria-hidden="true" />
      {t.letterArchive}
      <span className="text-white/60">({older})</span>
    </button>
  );

  const hero = (
    <>
      <p className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.1em] text-white/80">
        <Mail size={15} aria-hidden="true" />
        {fillTemplate(s.eyebrow, { month: monthName })}
      </p>

      {shown ? (
        <>
          <h2 className="mt-2 line-clamp-3 text-[26px] font-bold leading-[1.15] tracking-[-0.025em] text-white">{shown.title}</h2>
          <p className="mt-1.5 text-[14.5px] font-medium text-white/70">
            {fillTemplate(s.written, {
              date: formatDate(shown.generatedAt, { day: 'numeric', month: 'short' }, language),
              minutes: String(readingMinutes(shown)),
            })}
          </p>
          {tiles.length > 0 && (
            <dl className={clsx('mt-4 grid gap-2', tiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
              {tiles.map(tile => (
                <div key={tile.label} className={clsx(ON_COLOUR, 'flex min-w-0 flex-col rounded-[18px] px-3 pb-2.5 pt-2')}>
                  <dt className="truncate text-[12.5px] font-semibold text-white/75">{tile.label}</dt>
                  <dd className="mt-0.5 text-white">
                    <span className="block truncate text-[18px] font-bold tabular-nums">{tile.value}</span>
                    <span className="block truncate text-[11.5px] font-medium text-white/60">{tile.sub}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3">
            <button
              type="button"
              onClick={() => open(shown.month)}
              className="-ml-1 flex h-11 items-center gap-1 rounded-full px-1 text-[15.5px] font-bold text-white"
            >
              {s.readLetter}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            {pastLetters}
          </div>
        </>
      ) : writingLatest ? (
        <span className="mt-3 flex flex-col gap-2" role="status" aria-label={t.letterCardWriting}>
          <ShimmerOnColour width="85%" />
          <ShimmerOnColour width="60%" />
          <ShimmerOnColour width="40%" />
        </span>
      ) : canWrite ? (
        <>
          <p className="mt-2 text-[15.5px] leading-snug text-white/85">
            {failedMonth === latestMonth ? t.letterFailed : fillTemplate(t.letterCardHint, { month: monthName })}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3">
            <button
              type="button"
              onClick={() => {
                open(latestMonth);
                void write(latestMonth);
              }}
              className="flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[15px] font-semibold text-[#0B0D0C]"
            >
              <PenLine size={16} aria-hidden="true" />
              {t.letterCardWrite}
            </button>
            {pastLetters}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[15px] leading-snug text-white/80">{s.letterLater}</p>
      )}
    </>
  );

  const sheet = (
    <LetterSheet
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      language={language}
      letters={letters}
      month={sheetMonth}
      onSelectMonth={setSheetMonth}
      writing={snapshot.writing}
      failed={failedMonth !== null && failedMonth === sheetMonth}
      canRewrite={canRewrite(sheetMonth)}
      onRewrite={month => void write(month)}
    />
  );

  return { hero, sheet };
}
