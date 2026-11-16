import React, { useId } from 'react';
import clsx from 'clsx';
import { ArrowLeft, MoreHorizontal, Pencil, Repeat, SlidersHorizontal, Trash2, TrendingUp } from 'lucide-react';
import type { Currency, HomeHeaderTone } from '../../types';
import type { AppLanguage } from '../../utils/locale';
import { formatPercent } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import type { BudgetProgress } from '../../domain/home';
import { ringSegments } from '../../domain/budgetView';
import { HeroIconButton, HeroMenu, ON_COLOUR, ScreenHero, type HeroMenuItem } from '../ui/ScreenHero';
import { fill, fitFont } from '../home/parts';
import { plainAmount } from '../stats/analyticsStrings';
import type { BudgetStrings } from './budgetStrings';

const SIZE = 124;
const RADIUS = 52;
const STROKE = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The monthly limit as a ring: spending up to today's share of the month in solid white, anything
 * beyond it hatched, and a white mark where today is. White only, so it reads on every accent.
 */
const BudgetRing: React.FC<{ spentRatio: number; monthElapsed: number; label: string; caption: string; centre: string; centreSub: string }> = ({
  spentRatio, monthElapsed, label, caption, centre, centreSub,
}) => {
  const hatch = useId();
  const { onPace, ahead, today } = ringSegments(spentRatio, monthElapsed);
  const c = SIZE / 2;
  const angle = today * 2 * Math.PI;
  const tick = (r: number) => ({ x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) });
  const inner = tick(RADIUS - STROKE / 2 - 4);
  const outer = tick(RADIUS + STROKE / 2 + 4);
  const arc = (from: number, length: number) => ({
    strokeDasharray: `${(CIRCUMFERENCE * length).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`,
    strokeDashoffset: (-CIRCUMFERENCE * from).toFixed(2),
  });
  return (
    <figure role="img" aria-label={label} className="flex shrink-0 flex-col items-center">
      <span className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" className="-rotate-90 overflow-visible">
          <defs>
            <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2.5" height="5" fill="#fff" />
            </pattern>
          </defs>
          <circle cx={c} cy={c} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={STROKE} />
          {onPace > 0 && <circle cx={c} cy={c} r={RADIUS} fill="none" stroke="#fff" strokeWidth={STROKE} {...arc(0, onPace)} />}
          {ahead > 0 && (
            <>
              <circle cx={c} cy={c} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={STROKE} {...arc(onPace, ahead)} />
              <circle cx={c} cy={c} r={RADIUS} fill="none" stroke={`url(#${hatch})`} strokeWidth={STROKE} {...arc(onPace, ahead)} />
            </>
          )}
          {today > 0 && today < 1 && (
            <>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(0,0,0,0.28)" strokeWidth={5} strokeLinecap="round" />
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
            </>
          )}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-[26px] font-bold tabular-nums tracking-[-0.03em]">{centre}</span>
          <span className="mt-1 text-[12px] font-medium text-white/70">{centreSub}</span>
        </span>
      </span>
      <figcaption aria-hidden="true" className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-white/70">
        <span className="h-3 w-[2.5px] rounded-full bg-white" />
        {caption}
      </figcaption>
    </figure>
  );
};

interface BudgetHeroProps {
  tone: HomeHeaderTone;
  title: string;
  monthLabel: string;
  progress: BudgetProgress;
  daysLeft: number;
  currency: Currency;
  language: AppLanguage;
  locale: string;
  backLabel: string;
  subscriptionsLabel: string;
  removeLabel: string;
  spendingFast: string;
  onPace: string;
  hasBudget: boolean;
  onBack: () => void;
  /** Opens the edit sheet, focused on the monthly limit or on the first category field. */
  onEdit: (focus?: 'monthly') => void;
  onSubscriptions: () => void;
  onRemove: () => void;
  s: BudgetStrings;
}

/** "November budget": the ring, what is left for each day, and the spent and limit tiles. */
export const BudgetHero: React.FC<BudgetHeroProps> = ({
  tone, title, monthLabel, progress, daysLeft, currency, language, locale, backLabel, subscriptionsLabel, removeLabel,
  spendingFast, onPace, hasBudget, onBack, onEdit, onSubscriptions, onRemove, s,
}) => {
  const amount = (value: number) => plainAmount(Math.abs(value), currency, locale);
  const withCode = (value: number) => `${amount(value)} ${currency}`;
  const monthly = progress.total > 0;
  const over = monthly && progress.left < 0;
  const big = monthly ? amount(progress.left) : amount(progress.spent);
  const days = pluralText(daysLeft, language, { one: s.dayOne, few: 'dayFew' in s ? s.dayFew : undefined, other: s.dayOther });
  const pct = formatPercent(progress.spentRatio * 100, 0, language);

  const menu: HeroMenuItem[] = [
    { icon: SlidersHorizontal, label: s.editLimits, onSelect: () => onEdit() },
    { icon: Repeat, label: subscriptionsLabel, onSelect: onSubscriptions },
    ...(hasBudget ? [{ icon: Trash2, label: removeLabel, onSelect: onRemove, danger: true }] : []),
  ];

  return (
    <ScreenHero tone={tone} label={title}>
      <div className="flex h-[60px] items-center gap-2 px-3 md:px-4">
        {/* The sidebar does this from md up; invisible keeps the header balanced. */}
        <HeroIconButton icon={ArrowLeft} label={backLabel} onClick={onBack} className="md:invisible" />
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
        <HeroMenu label={s.actions} icon={MoreHorizontal} items={menu} />
      </div>

      <div className="px-4 pb-[42px] pt-2 md:px-5 md:pb-5">
        {monthly ? (
          <div className="flex items-center gap-4 sm:gap-6">
            <BudgetRing
              spentRatio={progress.spentRatio}
              monthElapsed={progress.monthElapsed}
              centre={pct}
              centreSub={s.ringSpent}
              caption={s.today}
              label={fill(s.ringLabel, { pct, today: formatPercent(progress.monthElapsed * 100, 0, language) })}
            />
            <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
              <p className="text-[14px] font-medium text-white/75">{over ? s.overBy : s.leftToSpend}</p>
              <p
                className="whitespace-nowrap font-bold leading-[1.1] tracking-[-0.035em] tabular-nums"
                style={{ fontSize: fitFont(36, `${over ? '−' : ''}${big} ${currency}`, 0.62) }}
              >
                {over ? '−' : ''}{big}
                <span className="ml-1 text-[0.44em] font-semibold tracking-normal text-white/60">{currency}</span>
              </p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-white/75">
                {over
                  ? fill(s.overSub, { spent: withCode(progress.spent), limit: withCode(progress.total) })
                  : fill(s.perDayFor, { amount: amount(progress.left / daysLeft), days })}
              </p>
              {!over && (
                <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12.5px] font-semibold">
                  {progress.aheadOfPace && <TrendingUp size={13} aria-hidden="true" />}
                  {progress.aheadOfPace ? spendingFast : onPace}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ containerType: 'inline-size' }}>
            <p className="text-[14px] font-medium text-white/75">{fill(s.noMonthly, { month: monthLabel })}</p>
            <p
              className="whitespace-nowrap font-bold leading-[1.1] tracking-[-0.04em] tabular-nums"
              style={{ fontSize: fitFont(44, `${big} ${currency}`, 0.62) }}
            >
              {big}
              <span className="ml-1.5 text-[0.4em] font-semibold tracking-normal text-white/60">{currency}</span>
            </p>
            <p className="mt-1 max-w-[34ch] text-[14px] leading-snug text-white/75">{s.noMonthlyHint}</p>
            <button
              type="button"
              onClick={() => onEdit('monthly')}
              className="mt-4 h-11 rounded-full bg-white px-5 text-[15px] font-semibold text-[#14171A]"
            >
              {s.setMonthly}
            </button>
          </div>
        )}

        {monthly && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className={clsx(ON_COLOUR, 'rounded-[20px] px-4 py-3')}>
              <p className="text-[13px] font-medium text-white/75">{s.spent}</p>
              <p className="whitespace-nowrap text-[19px] font-bold tabular-nums tracking-[-0.01em]">{amount(progress.spent)}</p>
            </div>
            <button
              type="button"
              onClick={() => onEdit('monthly')}
              aria-label={`${s.changeMonthly}: ${withCode(progress.total)}`}
              className={clsx(ON_COLOUR, 'rounded-[20px] px-4 py-3 text-left')}
            >
              <span className="block text-[13px] font-medium text-white/75">{s.monthlyLimit}</span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[19px] font-bold tabular-nums tracking-[-0.01em]">
                {amount(progress.total)}
                <Pencil size={14} aria-hidden="true" className="text-white/60" />
              </span>
            </button>
          </div>
        )}
      </div>
    </ScreenHero>
  );
};
