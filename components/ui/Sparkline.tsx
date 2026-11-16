import React, { useId } from 'react';
import clsx from 'clsx';

/**
 * Tiny trend line with a soft area fill. Scales to its box (viewBox + preserveAspectRatio none),
 * so no measuring and no resize observer. The domain hugs the data, like RateChart.
 */
export const Sparkline: React.FC<{
  values: readonly number[];
  height?: number;
  color?: string;
  /** Fill under the line. */
  area?: boolean;
  /** Dot on the last value. */
  dot?: boolean;
  className?: string;
  label?: string;
}> = ({ values, height = 40, color = 'rgb(var(--accent-rgb))', area = true, dot = true, className, label }) => {
  const gradientId = useId();
  if (values.length < 2) return <div className={className} style={{ height }} aria-hidden="true" />;
  const W = 100;
  const H = height;
  const pad = 3;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const x = (i: number) => (W / (values.length - 1)) * i;
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (H - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <div className={clsx('relative w-full', className)} style={{ height }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {area && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.22" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${gradientId})`} />
          </>
        )}
        <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {dot && (
        <span
          className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: '100%', top: y(last), background: color, boxShadow: '0 0 0 2px var(--paper-tile)' }}
        />
      )}
    </div>
  );
};
