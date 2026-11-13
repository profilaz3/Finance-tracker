import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
} from '../../domain/monthlyLetter';
import {
  clearOpenLetterRequest,
  generateLetter,
  getLetterSnapshot,
  subscribeLetters,
} from '../../services/letterService';
import type { AppLanguage } from '../../utils/locale';
import { ShimmerLine } from './Shimmer';
import { LetterSheet } from './LetterSheet';
import { fillTemplate, LETTER_PAPER, LETTER_SERIF, letterMonthLabel, letterMonthName } from './letterFormat';

interface MonthlyLetterCardProps {
  /** The active workspace's data. */
  state: LetterInputs;
  language: AppLanguage;
}

const aiConfigured = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

/** "Your October letter" at the top of Insights, with the reading sheet and the archive. */
export const MonthlyLetterCard: React.FC<MonthlyLetterCardProps> = ({ state, language }) => {
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

  if (!snapshot.userId) return null;

  const latest = snapshot.archive[latestMonth] ?? null;
  const writingLatest = snapshot.writing.includes(latestMonth);
  const shown = latest ?? (writingLatest || enough ? null : letters[0] ?? null);
  const cardMonth = shown?.month ?? latestMonth;
  if (!shown && !writingLatest && !(enough && aiConfigured())) return null;

  const monthName = letterMonthName(cardMonth, language);
  // The whole card opens a written letter; otherwise only its button acts.
  const Row = shown ? 'button' : 'div';
  const older = letters.filter(letter => letter.month !== cardMonth).length;
  const canRewrite = (month: string | null) => {
    if (!month || !aiConfigured()) return false;
    const key = parseMonthId(month);
    return Boolean(key) && hasEnoughForLetter(buildLetterAggregates(state, key!));
  };

  return (
    <>
      <div className="overflow-hidden rounded-[26px] shadow-[var(--paper-tile-shadow)]" style={{ background: LETTER_PAPER }}>
        <Row
          className="flex w-full items-center gap-3.5 p-4 text-left"
          {...(shown ? { type: 'button' as const, onClick: () => open(shown.month), 'aria-label': `${t.letterRead}: ${fillTemplate(t.letterCardTitle, { month: monthName })}` } : {})}
        >
          <span className="accent-card relative flex h-12 w-12 flex-none items-center justify-center rounded-[16px] text-white" aria-hidden="true">
            <Mail size={22} strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">{letterMonthLabel(cardMonth, language)}</span>
            <span className="block text-[17px] font-bold leading-snug tracking-[-0.2px]">{fillTemplate(t.letterCardTitle, { month: monthName })}</span>
            {shown ? (
              <span className="mt-0.5 block truncate text-[15px] italic text-muted" style={{ fontFamily: LETTER_SERIF }}>{shown.title}</span>
            ) : writingLatest ? (
              <span className="mt-2 flex flex-col gap-1.5" role="status" aria-label={t.letterCardWriting}>
                <ShimmerLine width="85%" />
                <ShimmerLine width="55%" />
              </span>
            ) : (
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                {failedMonth === latestMonth ? t.letterFailed : fillTemplate(t.letterCardHint, { month: monthName })}
              </span>
            )}
          </span>
          {shown ? (
            <ChevronRight size={20} aria-hidden="true" className="flex-none text-faint" />
          ) : !writingLatest ? (
            <button
              type="button"
              onClick={() => {
                open(latestMonth);
                void write(latestMonth);
              }}
              className="flex h-10 flex-none items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent"
            >
              <PenLine size={16} aria-hidden="true" />
              {t.letterCardWrite}
            </button>
          ) : null}
        </Row>
        {older > 0 && (
          <button
            type="button"
            onClick={() => open(null)}
            className="flex w-full items-center gap-1.5 border-t border-hair px-4 py-2.5 text-[13px] font-semibold text-accent"
          >
            <Library size={15} aria-hidden="true" />
            {t.letterArchive}
            <span className="text-faint">({older})</span>
          </button>
        )}
      </div>

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
    </>
  );
};
