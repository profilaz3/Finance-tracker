import React, { useLayoutEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Check, ShoppingBasket, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import type { TRANSLATIONS } from '../../constants';
import type { AppLanguage } from '../../utils/locale';
import { formatMoney } from '../../utils/locale';

type T = typeof TRANSLATIONS['en'];

/** The scene is drawn at this size and scaled to fit its box. */
const STAGE_W = 360;
const STAGE_H = 300;
/** Below this scale the scene is too small to read: it steps aside (short screens, open keyboard). */
const MIN_SCALE = 0.5;

const EASE = [0.22, 1, 0.36, 1] as const;

// When each beat of the story starts (seconds).
const PRINT = 0.15;
const FRAME = 1.25;
const BEAM = 1.5;
const CARD = 2.35;

/** Scale that fits the scene into the box, capped at `maxScale`. */
const useFitScale = (box: React.RefObject<HTMLElement | null>, maxScale: number) => {
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setScale(Math.min(maxScale, rect.width / STAGE_W, rect.height / STAGE_H));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box, maxScale]);
  return scale;
};

// Paper zigzag along the bottom edge of the receipt.
const RECEIPT_CLIP = (() => {
  const teeth = 12;
  const points = ['0% 0%', '100% 0%', '100% calc(100% - 7px)'];
  for (let i = teeth; i >= 0; i -= 1) {
    const x = (i / teeth) * 100;
    points.push(`${x.toFixed(2)}% ${i % 2 === 0 ? 'calc(100% - 7px)' : '100%'}`);
  }
  return `polygon(${points.join(', ')})`;
})();

// A fixed pattern that reads as a QR code at a glance.
const QR_CELLS = ['1110101', '1010011', '1110110', '0001010', '1101101', '0110001', '1011011'];

const QrMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 7 7" className={className} shapeRendering="crispEdges">
    {QR_CELLS.flatMap((row, y) => row.split('').map((cell, x) => (
      cell === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#1d1d1b" /> : null
    )))}
  </svg>
);

/** Everyday groceries adding up to 1.150 RSD. */
const receiptItems = (t: T): Array<[string, string]> => [
  [t.authDemoEggs, '320'],
  [t.authDemoMilk, '145'],
  [t.authDemoBread, '85'],
  [t.authDemoCheese, '600'],
];

/** A paper till receipt. Stays light in dark mode, like paper. */
const PaperReceipt: React.FC<{ t: T }> = ({ t }) => (
  <div
    className="relative w-[150px] bg-[#FCFBF7] px-3.5 pb-5 pt-5 font-mono text-[#1d1d1b] shadow-[0_26px_44px_-22px_rgba(0,0,0,0.45)]"
    style={{ clipPath: RECEIPT_CLIP, borderRadius: '6px 6px 0 0' }}
  >
    <p className="text-center text-[10.5px] font-bold tracking-[0.08em]">{t.authDemoShop}</p>
    <p className="mb-2 text-center text-[8px] text-[#77756f]">14.11. 18:20</p>
    {receiptItems(t).map(([name, price]) => (
      <div key={name} className="flex justify-between gap-2 text-[9px] leading-[15px]">
        <span className="truncate">{name}</span>
        <span>{price}</span>
      </div>
    ))}
    <div className="my-1.5 border-t border-dashed border-[#c9c6bd]" />
    <div className="flex justify-between text-[10px] font-bold">
      <span>{t.total}</span>
      <span>1.150</span>
    </div>
    <QrMark className="mt-2.5 h-9 w-9" />
  </div>
);

const Corner: React.FC<{ className: string; color: string }> = ({ className, color }) => (
  <svg viewBox="0 0 22 22" className={clsx('absolute h-[22px] w-[22px]', className)} fill="none">
    <path d="M2 20V8a6 6 0 0 1 6-6h12" strokeWidth="3.5" strokeLinecap="round" style={{ stroke: color }} />
  </svg>
);

interface AuthShowcaseProps {
  t: T;
  language: AppLanguage;
  /** `stage`: on the dark panel (desktop). `paper`: on the page background (phones). */
  tone: 'stage' | 'paper';
  /** Largest scale the scene may grow to. */
  maxScale?: number;
  className?: string;
}

/**
 * What the app does, in four seconds: a till receipt prints, the scanner frames it, a beam reads it,
 * and the finished entry pops out with its items. Plays once, then only the beam idles. Decorative:
 * hidden from assistive tech, still when motion is reduced, and it steps aside when its box gets
 * too small to read (short phones, an open keyboard).
 */
export const AuthShowcase: React.FC<AuthShowcaseProps> = ({ t, language, tone, maxScale = 1, className }) => {
  const reduceMotion = useReducedMotion() ?? false;
  const boxRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(boxRef, maxScale);
  const stage = tone === 'stage';
  // On the dark panel a lightened accent reads better than the raw one.
  const frame = stage ? 'color-mix(in srgb, rgb(var(--accent-rgb)) 55%, white)' : 'rgb(var(--accent-rgb))';
  const at = (delay: number) => (reduceMotion ? 0 : delay);

  return (
    <div ref={boxRef} className={clsx('relative min-h-0', className)} aria-hidden="true">
      {scale >= MIN_SCALE && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {/* Printer slot and the receipt feeding out of it */}
          <div className="absolute left-[22px] top-[6px] w-[164px]">
            <div
              className={clsx(
                'relative z-10 mx-auto h-[12px] rounded-full',
                stage
                  ? 'bg-white/12 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]'
                  : 'bg-[#2b2a27] shadow-[inset_0_2px_3px_rgba(0,0,0,0.6)]',
              )}
            />
            <div className="-mt-[6px] overflow-hidden px-[7px] pb-6">
              <m.div
                initial={{ y: reduceMotion ? 0 : '-100%' }}
                animate={{ y: 0 }}
                transition={{ delay: at(PRINT), duration: 1.05, ease: [0.45, 0, 0.2, 1] }}
              >
                <PaperReceipt t={t} />
              </m.div>
            </div>
          </div>

          {/* Scanner frame and beam */}
          <m.div
            className="absolute left-[12px] top-[16px] h-[236px] w-[184px]"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.12 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: at(FRAME), duration: 0.4, ease: EASE }}
          >
            <Corner className="left-0 top-0" color={frame} />
            <Corner className="right-0 top-0 rotate-90" color={frame} />
            <Corner className="bottom-0 right-0 rotate-180" color={frame} />
            <Corner className="bottom-0 left-0 -rotate-90" color={frame} />
            {!reduceMotion && (
              <m.div
                className="absolute inset-x-2 h-10 rounded-[4px]"
                style={{ background: `linear-gradient(180deg, transparent, color-mix(in srgb, ${frame} 28%, transparent) 85%, ${frame} 100%)` }}
                initial={{ top: 0, opacity: 0 }}
                animate={{ top: ['0%', '82%', '82%'], opacity: [0, 1, 0] }}
                transition={{ delay: BEAM, duration: 1.1, times: [0, 0.85, 1], ease: 'easeInOut', repeat: Infinity, repeatDelay: 3.2 }}
              />
            )}
          </m.div>

          {/* The entry it became */}
          <m.div
            className="absolute left-[110px] top-[170px] w-[246px] rounded-[22px] bg-tile p-3.5 text-on-surface shadow-[0_30px_56px_-22px_rgba(0,0,0,0.45),0_0_0_1px_var(--paper-line)]"
            initial={reduceMotion ? { opacity: 1, rotate: 2 } : { opacity: 0, x: -36, y: 10, scale: 0.86, rotate: -4 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 2 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 20, delay: CARD }}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#FDE7DA] text-[#C2410C]">
                <ShoppingBasket size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{t.authDemoGroceries}</p>
                <p className="truncate text-[10.5px] text-muted">{t.authDemoShop}</p>
              </div>
              <span className="shrink-0 text-[13.5px] font-bold tabular-nums">
                −{formatMoney(1150, 'RSD', language, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {receiptItems(t).map(([name], index) => (
                <m.span
                  key={name}
                  className="rounded-full bg-chip px-2 py-0.5 text-[10.5px] font-medium text-muted"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: at(CARD + 0.3 + index * 0.08), duration: 0.3, ease: EASE }}
                >
                  {name}
                </m.span>
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex min-w-0 items-center gap-1 text-muted">
                <Sparkles size={12} className="shrink-0 text-accent" />
                <span className="truncate">{t.authDemoScanned}</span>
              </span>
              <m.span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pos/12 px-2 py-0.5 font-semibold text-pos"
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 20, delay: CARD + 0.75 }}
              >
                <Check size={11} strokeWidth={3} /> {t.authDemoSaved}
              </m.span>
            </div>
          </m.div>
        </div>
      )}
    </div>
  );
};
