import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Library, Mail, RefreshCw } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { StoredLetter } from '../../domain/monthlyLetter';
import { shiftMonth } from '../../domain/home';
import { parseMonthId, monthId } from '../../domain/monthlyLetter';
import { formatDate, formatPercent, type AppLanguage } from '../../utils/locale';
import { GlassSheet } from '../ui/GlassSheet';
import { money } from '../home/parts';
import { ShimmerLine } from './Shimmer';
import { fillTemplate, LETTER_PAPER, LETTER_SERIF, letterMonthLabel, letterMonthName } from './letterFormat';

interface LetterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  language: AppLanguage;
  /** Newest first. */
  letters: StoredLetter[];
  /** Month shown; null shows the archive. */
  month: string | null;
  onSelectMonth: (month: string | null) => void;
  writing: string[];
  failed: boolean;
  canRewrite: boolean;
  onRewrite: (month: string) => void;
}

const LetterStats: React.FC<{ letter: StoredLetter; language: AppLanguage }> = ({ letter, language }) => {
  const t = TRANSLATIONS[language];
  const { stats } = letter;
  const key = parseMonthId(letter.month);
  const previousName = key ? letterMonthName(monthId(shiftMonth(key, -1)), language) : '';
  const change = stats.spentChangePct;
  const up = change !== null && change > 0;
  const ChangeIcon = up ? ArrowUpRight : ArrowDownRight;
  const limit = stats.budgetLimit;
  const over = limit !== null && limit > 0 && stats.spent > limit;
  const used = limit ? Math.min(1, stats.spent / limit) : 0;

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-[18px] border border-hair px-3.5 py-3">
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{t.letterSpent}</dt>
        <dd className="mt-0.5 truncate text-[17px] font-semibold tabular-nums">{money(stats.spent, stats.currency, language)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-faint">{fillTemplate(t.letterVsMonth, { month: previousName })}</dt>
        <dd className={clsx('mt-0.5 flex items-center gap-0.5 text-[17px] font-semibold tabular-nums', change === null ? 'text-muted' : up ? 'text-neg' : 'text-pos')}>
          {change === null ? (
            <span className="truncate text-[13px] font-medium">{t.letterNoComparison}</span>
          ) : (
            <>
              <ChangeIcon size={15} aria-hidden="true" className="flex-none" />
              {formatPercent(Math.abs(change), 0, language)}
            </>
          )}
        </dd>
      </div>
      {limit ? (
        <div className="col-span-2 min-w-0 border-t border-hair pt-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{t.letterBudget}</dt>
            <dd className={clsx('min-w-0 truncate text-[14px] font-semibold tabular-nums', over ? 'text-neg' : 'text-pos')}>
              {fillTemplate(t.letterBudgetOf, { spent: money(stats.spent, stats.currency, language), limit: money(limit, stats.currency, language) })}
            </dd>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip" aria-hidden="true">
            <div className={clsx('h-full rounded-full', over ? 'bg-neg' : 'bg-pos')} style={{ width: `${Math.max(4, used * 100)}%` }} />
          </div>
        </div>
      ) : stats.income > 0 && (
        <div className="col-span-2 flex min-w-0 items-baseline justify-between gap-3 border-t border-hair pt-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{t.letterIncome}</dt>
          <dd className="min-w-0 truncate text-[14px] font-semibold tabular-nums">{money(stats.income, stats.currency, language)}</dd>
        </div>
      )}
    </dl>
  );
};

const LetterPage: React.FC<{ letter: StoredLetter; language: AppLanguage }> = ({ letter, language }) => {
  const t = TRANSLATIONS[language];
  return (
    <article
      className="rounded-[28px] px-5 pb-6 pt-6 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_10px_30px_-12px_rgba(0,0,0,0.18)] sm:px-7"
      style={{ background: LETTER_PAPER }}
    >
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-faint">{letterMonthLabel(letter.month, language)}</p>
      <h3 className="mt-2 text-[27px] font-semibold leading-[1.15] tracking-[-0.3px] text-on-surface" style={{ fontFamily: LETTER_SERIF }}>
        {letter.title}
      </h3>
      <div className="mt-5">
        <LetterStats letter={letter} language={language} />
      </div>
      <div className="mt-6 flex flex-col gap-5">
        {letter.sections.map((section, index) => (
          <section key={`${letter.month}-${index}`}>
            <h4 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-accent">{section.heading}</h4>
            <p className="mt-1.5 text-[17px] leading-[1.62] text-on-surface" style={{ fontFamily: LETTER_SERIF }}>
              {section.body}
            </p>
          </section>
        ))}
      </div>
      <div className="mt-7 border-t border-hair pt-3 text-[12px] leading-snug text-faint">
        <p>{fillTemplate(t.letterWrittenOn, { date: formatDate(letter.generatedAt, { day: 'numeric', month: 'long', year: 'numeric' }, language) })}</p>
        <p className="mt-0.5">{t.letterFooter}</p>
      </div>
    </article>
  );
};

const WritingPage: React.FC<{ month: string; language: AppLanguage }> = ({ month, language }) => {
  const t = TRANSLATIONS[language];
  return (
    <div className="rounded-[28px] px-5 pb-8 pt-6 sm:px-7" style={{ background: LETTER_PAPER }} aria-busy="true">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-faint">{letterMonthLabel(month, language)}</p>
      <p className="mt-2 text-[22px] font-semibold text-muted" style={{ fontFamily: LETTER_SERIF }} role="status">
        {t.letterCardWriting}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {[92, 100, 78, 0, 96, 88, 64].map((width, index) =>
          width === 0 ? <span key={index} className="h-2" /> : <ShimmerLine key={index} className="h-3.5" width={`${width}%`} />,
        )}
      </div>
    </div>
  );
};

export const LetterSheet: React.FC<LetterSheetProps> = ({
  isOpen,
  onClose,
  language,
  letters,
  month,
  onSelectMonth,
  writing,
  failed,
  canRewrite,
  onRewrite,
}) => {
  const t = TRANSLATIONS[language];
  const letter = month ? letters.find(item => item.month === month) ?? null : null;
  const isWriting = month ? writing.includes(month) : false;
  const [cameFromArchive, setCameFromArchive] = useState(false);

  useEffect(() => {
    if (!isOpen) setCameFromArchive(false);
  }, [isOpen]);

  const title = month ? fillTemplate(t.letterSheetTitle, { month: letterMonthLabel(month, language) }) : t.letterArchive;
  const otherLanguage = letter && letter.language !== language;

  const back = month && (cameFromArchive || letters.length > 1) ? (
    <button
      type="button"
      onClick={() => onSelectMonth(null)}
      className="flex h-9 items-center gap-1 rounded-full bg-chip pl-2 pr-3 text-[13px] font-semibold"
    >
      {cameFromArchive ? <ChevronLeft size={16} aria-hidden="true" /> : <Library size={15} aria-hidden="true" />}
      {t.letterArchive}
    </button>
  ) : null;

  const footer = month && canRewrite ? (
    <div className="flex flex-col gap-2">
      {otherLanguage && <p className="text-center text-[13px] text-muted">{t.letterOtherLanguage}</p>}
      {failed && !isWriting && <p className="text-center text-[13px] text-neg" role="alert">{t.letterFailed}</p>}
      <button
        type="button"
        onClick={() => onRewrite(month)}
        disabled={isWriting}
        className={clsx(
          'flex h-11 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-opacity disabled:opacity-50',
          otherLanguage || !letter ? 'bg-accent text-on-accent' : 'bg-chip',
        )}
      >
        <RefreshCw size={16} aria-hidden="true" className={clsx(isWriting && 'animate-spin')} />
        {isWriting ? t.letterRewriting : otherLanguage ? t.letterRewriteInLanguage : letter ? t.letterRegenerate : t.letterCardWrite}
      </button>
    </div>
  ) : undefined;

  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title={title} hideTitle={Boolean(month)} closeLabel={t.letterClose} headerAction={back} footer={footer}>
      {month ? (
        isWriting && !letter ? (
          <WritingPage month={month} language={language} />
        ) : letter ? (
          <div className={clsx('transition-opacity', isWriting && 'opacity-60')}>
            <LetterPage letter={letter} language={language} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <Mail size={28} aria-hidden="true" className="text-faint" />
            <p className="text-[14px] text-muted">{failed ? t.letterFailed : fillTemplate(t.letterCardHint, { month: letterMonthName(month, language) })}</p>
          </div>
        )
      ) : letters.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] text-muted">{t.letterArchiveEmpty}</p>
      ) : (
        <ul className="paper-tile overflow-hidden">
          {letters.map((item, index) => (
            <li key={item.month} className={clsx(index < letters.length - 1 && 'border-b border-hair')}>
              <button
                type="button"
                onClick={() => {
                  setCameFromArchive(true);
                  onSelectMonth(item.month);
                }}
                className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-faint">{letterMonthLabel(item.month, language)}</span>
                  <span className="mt-0.5 block truncate text-[16px] font-semibold" style={{ fontFamily: LETTER_SERIF }}>{item.title}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="flex-none text-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassSheet>
  );
};
