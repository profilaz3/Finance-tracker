import React from 'react';
import clsx from 'clsx';

/**
 * Spot illustrations for empty and done states. Inline SVG drawn only with theme tokens
 * (paper tile, line, chip, accent, pos, neg), so they follow every theme, mode and custom accent.
 * One visual recipe: a paper card with a hairline, a soft accent focal shape, two sparkle dots.
 */

const CARD = 'fill-[var(--paper-tile)] stroke-[var(--paper-line)]';
const LINE = 'fill-[var(--paper-chip)]';
const ACCENT_SOFT = 'fill-accent/20';
const ACCENT = 'fill-accent';

const Sparkles: React.FC<{ a?: [number, number]; b?: [number, number] }> = ({ a = [38, 30], b = [168, 118] }) => (
  <>
    <path d={`M${a[0]} ${a[1] - 6}v12M${a[0] - 6} ${a[1]}h12`} className="stroke-accent/50" strokeWidth="2" strokeLinecap="round" />
    <circle cx={b[0]} cy={b[1]} r="3.5" className="fill-accent/35" />
  </>
);

/** A list row: icon tile plus two text bars. */
const Row: React.FC<{ y: number; tone?: string; width?: number }> = ({ y, tone = ACCENT_SOFT, width = 54 }) => (
  <>
    <rect x="54" y={y} width="18" height="18" rx="6" className={tone} />
    <rect x="80" y={y + 2} width={width} height="6" rx="3" className={LINE} />
    <rect x="80" y={y + 11} width={width * 0.6} height="5" rx="2.5" className={LINE} />
  </>
);

const DRAWINGS = {
  transactions: (
    <>
      <rect x="40" y="26" width="120" height="104" rx="18" className={CARD} strokeWidth="1.5" />
      <Row y={42} />
      <Row y={68} tone="fill-pos/25" width={44} />
      <Row y={94} tone="fill-neg/20" width={50} />
      <circle cx="152" cy="122" r="17" className={ACCENT} />
      <path d="M152 115v14M145 122h14" className="stroke-[var(--paper-tile)]" strokeWidth="3" strokeLinecap="round" />
      <Sparkles />
    </>
  ),
  search: (
    <>
      <rect x="34" y="30" width="112" height="96" rx="18" className={CARD} strokeWidth="1.5" />
      <rect x="48" y="46" width="60" height="7" rx="3.5" className={LINE} />
      <rect x="48" y="62" width="40" height="6" rx="3" className={LINE} />
      <rect x="48" y="78" width="54" height="7" rx="3.5" className={LINE} />
      <circle cx="128" cy="94" r="24" className="fill-[var(--paper-tile)] stroke-accent" strokeWidth="6" />
      <circle cx="128" cy="94" r="14" className={ACCENT_SOFT} />
      <path d="M146 112l16 16" className="stroke-accent" strokeWidth="8" strokeLinecap="round" />
      <Sparkles a={[160, 34]} b={[32, 122]} />
    </>
  ),
  people: (
    <>
      <rect x="30" y="44" width="140" height="80" rx="20" className={CARD} strokeWidth="1.5" />
      <circle cx="78" cy="78" r="22" className={ACCENT_SOFT} />
      <circle cx="78" cy="72" r="8" className="fill-accent/55" />
      <path d="M64 92c3-8 9-11 14-11s11 3 14 11" className="fill-accent/55" />
      <circle cx="122" cy="78" r="22" className={LINE} />
      <circle cx="122" cy="72" r="8" className="fill-[var(--paper-line)]" />
      <path d="M108 92c3-8 9-11 14-11s11 3 14 11" className="fill-[var(--paper-line)]" />
      <rect x="84" y="104" width="32" height="14" rx="7" className={ACCENT} />
      <path d="M93 111h14m-4-4 4 4-4 4" className="stroke-[var(--paper-tile)]" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Sparkles a={[44, 30]} b={[162, 34]} />
    </>
  ),
  events: (
    <>
      <rect x="34" y="52" width="132" height="76" rx="18" className={CARD} strokeWidth="1.5" />
      <path d="M50 112c18-2 24-26 46-24s26 18 52 4" className="stroke-accent/45" strokeWidth="2.5" strokeDasharray="5 6" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="112" r="5" className="fill-accent/45" />
      <path d="M148 92c0 0-20-18-20-32a20 20 0 0 1 40 0c0 14-20 32-20 32Z" className={ACCENT} transform="translate(-8 -24)" />
      <circle cx="140" cy="36" r="7" className="fill-[var(--paper-tile)]" />
      <Sparkles a={[46, 36]} b={[172, 122]} />
    </>
  ),
  subscriptions: (
    <>
      <rect x="44" y="34" width="112" height="96" rx="18" className={CARD} strokeWidth="1.5" />
      <rect x="44" y="34" width="112" height="24" rx="18" className={ACCENT_SOFT} />
      <rect x="44" y="46" width="112" height="12" className={ACCENT_SOFT} />
      {[0, 1, 2, 3].map(col => [0, 1].map(row => (
        <rect key={`${col}-${row}`} x={58 + col * 22} y={70 + row * 22} width="14" height="14" rx="4" className={col === 1 && row === 0 ? ACCENT : LINE} />
      )))}
      <circle cx="150" cy="118" r="20" className="fill-[var(--paper-tile)] stroke-[var(--paper-line)]" strokeWidth="1.5" />
      <path d="M141 115a9 9 0 0 1 16-4m1 9a9 9 0 0 1-16 4" className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M157 106v6h-6M143 130v-6h6" className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Sparkles a={[34, 40]} b={[36, 120]} />
    </>
  ),
  budgets: (
    <>
      <rect x="36" y="30" width="128" height="100" rx="20" className={CARD} strokeWidth="1.5" />
      <circle cx="82" cy="80" r="26" className="stroke-[var(--paper-chip)]" strokeWidth="10" fill="none" />
      <path d="M82 54a26 26 0 0 1 24.7 34" className="stroke-accent" strokeWidth="10" strokeLinecap="round" fill="none" />
      <rect x="120" y="58" width="30" height="7" rx="3.5" className={ACCENT_SOFT} />
      <rect x="120" y="72" width="22" height="6" rx="3" className={LINE} />
      <rect x="120" y="86" width="30" height="7" rx="3.5" className={LINE} />
      <rect x="120" y="100" width="18" height="6" rx="3" className={LINE} />
      <Sparkles a={[30, 120]} b={[170, 36]} />
    </>
  ),
  offline: (
    <>
      <path d="M62 112h76a24 24 0 0 0 2-48 32 32 0 0 0-61-6A26 26 0 0 0 62 112Z" className={CARD} strokeWidth="1.5" />
      <path d="M82 92a26 26 0 0 1 36 0M90 101a14 14 0 0 1 20 0" className="stroke-accent/55" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="100" cy="110" r="4" className={ACCENT} />
      <path d="M60 40l80 80" className="stroke-neg/70" strokeWidth="5" strokeLinecap="round" />
      <Sparkles a={[40, 128]} b={[166, 36]} />
    </>
  ),
  settled: (
    <>
      <circle cx="100" cy="80" r="44" className="fill-pos/15" />
      <circle cx="100" cy="80" r="30" className="fill-pos" />
      <path d="M87 80l9 9 17-18" className="stroke-[var(--paper-tile)]" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="40" y="38" width="8" height="8" rx="2" transform="rotate(20 44 42)" className="fill-accent/55" />
      <rect x="152" y="112" width="8" height="8" rx="2" transform="rotate(-15 156 116)" className="fill-accent/45" />
      <circle cx="158" cy="44" r="4" className="fill-pos/50" />
      <circle cx="46" cy="116" r="3.5" className="fill-pos/45" />
      <path d="M150 26v10M145 31h10" className="stroke-accent/50" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  receipt: (
    <>
      <path d="M62 22l6 8 6-8 6 8 6-8 6 8 6-8 6 8 6-8 6 8 6-8 6 8 6-8v114l-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8-6-8-6 8Z" className={CARD} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="76" y="48" width="48" height="7" rx="3.5" className={LINE} />
      <rect x="76" y="63" width="34" height="5" rx="2.5" className={LINE} />
      <rect x="76" y="78" width="48" height="7" rx="3.5" className={LINE} />
      <rect x="76" y="100" width="48" height="12" rx="6" className={ACCENT_SOFT} />
      <rect x="104" y="103" width="16" height="6" rx="3" className={ACCENT} />
      <Sparkles a={[44, 40]} b={[160, 120]} />
    </>
  ),
  chart: (
    <>
      <rect x="30" y="28" width="140" height="104" rx="20" className={CARD} strokeWidth="1.5" />
      {[34, 52, 74, 46, 62].map((h, i) => (
        <rect key={i} x={50 + i * 22} y={116 - h} width="14" height={h} rx="5" className={i === 2 ? ACCENT : ACCENT_SOFT} />
      ))}
      <path d="M57 74 79 60l22-16 22 24 22-12" className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Sparkles a={[176, 30]} b={[24, 120]} />
    </>
  ),
  wallet: (
    <>
      <rect x="36" y="40" width="128" height="88" rx="20" className={CARD} strokeWidth="1.5" />
      <rect x="36" y="40" width="128" height="26" rx="20" className={ACCENT_SOFT} />
      <rect x="36" y="54" width="128" height="12" className={ACCENT_SOFT} />
      <rect x="118" y="78" width="46" height="30" rx="10" className={LINE} />
      <circle cx="136" cy="93" r="7" className={ACCENT} />
      <rect x="52" y="84" width="46" height="7" rx="3.5" className={LINE} />
      <rect x="52" y="98" width="30" height="5" rx="2.5" className={LINE} />
      <Sparkles a={[30, 30]} b={[172, 122]} />
    </>
  ),
  calendar: (
    <>
      <rect x="40" y="30" width="120" height="100" rx="18" className={CARD} strokeWidth="1.5" />
      <rect x="40" y="30" width="120" height="26" rx="18" className={ACCENT_SOFT} />
      <rect x="40" y="44" width="120" height="12" className={ACCENT_SOFT} />
      {[0, 1, 2, 3].map(row => [0, 1, 2, 3, 4].map(col => (
        <rect key={`${row}-${col}`} x={54 + col * 19} y={66 + row * 15} width="12" height="10" rx="3" className={row === 1 && col === 2 ? ACCENT : LINE} />
      )))}
      <Sparkles a={[30, 36]} b={[170, 124]} />
    </>
  ),
} as const;

export type IllustrationName = keyof typeof DRAWINGS;

export const Illustration: React.FC<{ name: IllustrationName; className?: string }> = ({ name, className }) => (
  <svg viewBox="0 0 200 160" fill="none" aria-hidden="true" className={clsx('h-full w-full', className)}>
    {DRAWINGS[name]}
  </svg>
);
